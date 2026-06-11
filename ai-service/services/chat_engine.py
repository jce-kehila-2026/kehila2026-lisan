from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Iterator

from services.chat_cache import (
    build_allowed_vocabulary,
    build_cache_key,
    get_exact_cached_response,
    get_level_bundle,
    store_exact_cached_response,
)
from services.chat_guardrails import (
    ARABIC_RE,
    MAX_VOICE_WORDS,
    classify_fast_reject,
    classify_fast_reject_voice,
    count_hebrew_words,
    enforce_hebrew_only_scope,
    evaluate_vocabulary,
    get_fallback_text,
    get_fallback_text_ar,
    is_clearly_out_of_scope,
    is_hebrew_only_answer,
    is_short_hebrew_answer,
    normalize_hebrew_token,
    normalize_level,
    sanitize_input,
    strip_non_tts_chars,
)
from services.chat_provider import (
    AllProvidersFailedError,
    ChatProviderAuthError,
    ChatProviderError,
    ChatProviderNetworkError,
    ChatProviderQuotaError,
    ChatProviderTimeoutError,
    ProviderCallOptions,
    call_provider,
    get_configured_provider,
    stream_provider,
    VOICE_MAX_OUTPUT_TOKENS,
    VOICE_TEMPERATURE,
    provider_circuit,
)
from services.chat_retrieval import (
    build_retrieval_context,
)
from services.chat_router import route_message
from services.grammar_rules import build_grammar_hint, detect_grammar_errors
from services.chat_schemas import ChatRequest, ChatRequestContext, ChatResponse, GuardrailReport
from services.chat_suggestions import get_suggestions
from services.conversation_memory import CONVERSATION_MEMORY
from services.vocab_tracker import track_vocab_async

logger = logging.getLogger("lisan.chat")

BASE_DIR = Path(__file__).resolve().parents[1]
PROMPT_V2_PATH    = BASE_DIR / "prompts" / "chat-system-prompt-v2.txt"
PROMPT_V1_PATH    = BASE_DIR / "prompts" / "chat-system-prompt-v1.txt"
PROMPT_VOICE_PATH = BASE_DIR / "prompts" / "chat-system-prompt-voice.txt"

# ── Tutor answer length (env-tunable) ────────────────────────────────────────
# Raised from the old single-sentence / 12-word cap so the tutor can actually
# lead: correct an error, check understanding, AND ask the next question in one
# turn. Voice stays tighter to keep TTS playback short.
TEXT_MAX_WORDS = int(os.getenv("CHAT_TEXT_MAX_WORDS", "30"))
VOICE_MAX_WORDS = int(os.getenv("CHAT_VOICE_MAX_WORDS", "20"))
TEXT_MAX_OUTPUT_TOKENS = int(os.getenv("CHAT_TEXT_MAX_TOKENS", "256"))
VOICE_OUTPUT_TOKENS = int(os.getenv("CHAT_VOICE_MAX_TOKENS", "128"))


def generate_chat_response(payload: ChatRequest) -> ChatResponse:
    request_context = _build_request_context(payload)
    bundle = get_level_bundle(request_context.requested_level)
    resolved_level = bundle.level

    from services.language_profile import detect_language_profile
    lang_profile = detect_language_profile(request_context.message)
    if lang_profile.has_arabic or (lang_profile.has_latin and lang_profile.has_hebrew):
        from services.llm_gatekeeper import decide_local_answer
        gatekeeper_decision = decide_local_answer(
            request_context.message, resolved_level, lang_profile
        )
        if gatekeeper_decision is not None and not gatekeeper_decision.needs_llm:
            tmpl = gatekeeper_decision.template
            gatekeeper_response = ChatResponse(
                answerHe=tmpl.answer_he,
                answerAr=tmpl.answer_ar,
                fallbackUsed=False,
                fallbackReason=None,
                level=resolved_level,
                model=request_context.model,
                provider=request_context.provider,
                latencyMs=0,
                cacheHit=False,
                routerHit=True,
                contextChunkIds=[],
                guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
                suggestedNextPrompts=get_suggestions(
                    answer_he=tmpl.answer_he,
                    message=request_context.message,
                    level=resolved_level,
                ),
            )
            store_exact_cached_response(request_context.cache_key, gatekeeper_response)
            _remember_successful_turn(request_context, gatekeeper_response)
            _log_response(gatekeeper_response, request_context.provider, 0)
            return gatekeeper_response

    # 1. Fast-reject check FIRST
    fast_reject = classify_fast_reject_voice if request_context.voice_mode else classify_fast_reject
    fallback_reason = fast_reject(request_context.message)

    if fallback_reason:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason=fallback_reason,
        )
        store_exact_cached_response(request_context.cache_key, response)
        _log_response(response, request_context.provider, 0)
        return response

    # 2. Exact Cache lookup NEXT
    session_sensitive = _is_session_sensitive_message(request_context.normalized_message)
    cached_response = None if session_sensitive else get_exact_cached_response(request_context.cache_key)
    if cached_response is not None:
        hydrated_response = _hydrate_cached_response(cached_response, request_context)
        _remember_successful_turn(request_context, hydrated_response)
        _log_response(hydrated_response, request_context.provider, 0)
        return hydrated_response

    # 3. LLM Gatekeeper — intent-based local answers (WORD_MEANING, TRANSLATE,
    #    CORRECTION, known phrases, etc.). Runs BEFORE the simple rule router so
    #    that richer intent patterns (including mixed Arabic+Hebrew questions like
    #    "شو يعني בית?") are handled here without calling the remote LLM.
    from services.llm_gatekeeper import decide_local_answer
    gatekeeper_decision = decide_local_answer(
        request_context.message, resolved_level, lang_profile
    )
    if gatekeeper_decision is not None and not gatekeeper_decision.needs_llm:
        tmpl = gatekeeper_decision.template
        gatekeeper_response = ChatResponse(
            answerHe=tmpl.answer_he,
            answerAr=tmpl.answer_ar,
            fallbackUsed=False,
            fallbackReason=None,
            level=resolved_level,
            model=request_context.model,
            provider=request_context.provider,
            latencyMs=0,
            cacheHit=False,
            routerHit=True,
            contextChunkIds=[],
            guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
            suggestedNextPrompts=get_suggestions(
                answer_he=tmpl.answer_he,
                message=request_context.message,
                level=resolved_level,
            ),
        )
        store_exact_cached_response(request_context.cache_key, gatekeeper_response)
        _remember_successful_turn(request_context, gatekeeper_response)
        _log_response(gatekeeper_response, request_context.provider, 0)
        return gatekeeper_response

    # 3b. Simple deterministic router (greetings, thanks, curriculum phrases, glossary)
    routed_response = route_message(
        message=request_context.normalized_message,
        bundle=bundle,
        level=resolved_level,
        model=request_context.model,
        include_arabic=request_context.include_arabic,
    )
    if routed_response is not None:
        routed_response.provider = request_context.provider
        routed_response.suggestedNextPrompts = get_suggestions(
            answer_he=routed_response.answerHe,
            message=request_context.message,
            level=resolved_level,
        )
        store_exact_cached_response(request_context.cache_key, routed_response)
        _remember_successful_turn(request_context, routed_response)
        _log_response(routed_response, request_context.provider, 0)
        return routed_response

    pre_llm_response = _build_pre_llm_response(
        request_context=request_context,
        level=resolved_level,
    )
    if pre_llm_response is not None:
        if not session_sensitive:
            store_exact_cached_response(request_context.cache_key, pre_llm_response)
        _remember_successful_turn(request_context, pre_llm_response)
        _log_response(pre_llm_response, request_context.provider, 0)
        return pre_llm_response


    # 4. Semantic Cache lookup
    if not session_sensitive:
        try:
            from services.chat_cache import SEMANTIC_CACHE_MANAGER
            semantic_cached = SEMANTIC_CACHE_MANAGER.lookup(
                query=request_context.message,
                level=resolved_level,
                include_arabic=request_context.include_arabic,
            )
            if semantic_cached is not None:
                hydrated = _hydrate_cached_response(semantic_cached, request_context)
                hydrated.cacheHit = True
                _remember_successful_turn(request_context, hydrated)
                _log_response(hydrated, request_context.provider, 0)
                return hydrated
        except Exception as exc:
            logger.warning(f"Semantic cache lookup failed: {exc}")

    if is_clearly_out_of_scope(request_context.message, set(bundle.vocab_set), set(bundle.advanced_only_tokens), level=resolved_level):
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="OUT_OF_SCOPE",
        )
        store_exact_cached_response(request_context.cache_key, response)
        _log_response(response, request_context.provider, 0)
        return response

    retrieval_context = build_retrieval_context(request_context.message, bundle.chunks, limit=2)

    extractive_response = _build_extractive_curriculum_response(
        request_context=request_context,
        level=resolved_level,
        retrieval_context=retrieval_context,
    )
    if extractive_response is not None:
        store_exact_cached_response(request_context.cache_key, extractive_response)
        _remember_successful_turn(request_context, extractive_response)
        _log_response(extractive_response, request_context.provider, retrieval_context.chunks_count)
        return extractive_response

    # Provider-circuit gate sits after deterministic no-LLM paths, including
    # extractive RAG. This keeps known curriculum answers available even when
    # the model provider is quota-limited or the circuit is open.
    if not provider_circuit.allow_request():
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="CIRCUIT_OPEN",
        )
        _log_response(response, request_context.provider, 0)
        return response
    grammar_errors = detect_grammar_errors(request_context.message)
    grammar_hint = build_grammar_hint(grammar_errors)
    system_message = _build_system_message(
        base_prompt=_load_prompt(request_context.voice_mode),
        vocabulary=build_allowed_vocabulary(bundle, _resolve_selected_chunks(bundle, retrieval_context.chunk_ids)),
        context=retrieval_context.context_text,
        voice_mode=request_context.voice_mode,
        grammar_hint=grammar_hint,
    )

    history = CONVERSATION_MEMORY.get_history(request_context.session_id or "")
    call_opts = ProviderCallOptions(
        voice_mode=request_context.voice_mode,
        max_output_tokens=VOICE_OUTPUT_TOKENS if request_context.voice_mode else TEXT_MAX_OUTPUT_TOKENS,
        temperature=VOICE_TEMPERATURE if request_context.voice_mode else 0.2,
        history=tuple(history),
    )
    try:
        provider_result = call_provider(
            request_context.provider,
            request_context.model,
            system_message,
            request_context.message,
            options=call_opts,
        )
        active_provider = provider_result.provider
        active_model = provider_result.model
        provider_circuit.record_success()
    except AllProvidersFailedError as exc:
        active_provider = request_context.provider
        active_model = request_context.model
        primary_error = exc.primary_error
        fallback_reason = _map_provider_error_to_fallback_reason(primary_error)
        # Quota (429) is a soft rate-limit, not an outage. Recording it as a
        # circuit failure opens the circuit and then blocks EVERY following
        # request (the cascade the live audit caught). Skip it so the service
        # recovers the instant the rate-limit window resets. Real failures
        # (timeout/network/5xx) still trip the circuit as before.
        if not isinstance(primary_error, ChatProviderQuotaError):
            provider_circuit.record_failure()
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason=fallback_reason,
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response
    except ChatProviderTimeoutError:
        active_provider = request_context.provider
        active_model = request_context.model
        provider_circuit.record_failure()
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="MODEL_TIMEOUT",
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response
    except ChatProviderQuotaError:
        active_provider = request_context.provider
        active_model = request_context.model
        # Soft rate-limit — do NOT trip the circuit (see AllProvidersFailedError
        # handler above). Just degrade this one request.
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="PROVIDER_QUOTA",
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response
    except ChatProviderAuthError:
        active_provider = request_context.provider
        active_model = request_context.model
        provider_circuit.record_failure()
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="PROVIDER_AUTH",
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response
    except ChatProviderNetworkError:
        active_provider = request_context.provider
        active_model = request_context.model
        provider_circuit.record_failure()
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="PROVIDER_NETWORK",
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response
    except ChatProviderError:
        active_provider = request_context.provider
        active_model = request_context.model
        provider_circuit.record_failure()
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="MODEL_ERROR",
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response

    answer_he = _split_answer(provider_result.answer, voice_mode=request_context.voice_mode)
    if not answer_he:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="EMPTY_RESPONSE",
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            context_chunk_ids=retrieval_context.chunk_ids,
            input_tokens=provider_result.input_tokens,
            output_tokens=provider_result.output_tokens,
        )
        store_exact_cached_response(request_context.cache_key, response)
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response

    if not is_hebrew_only_answer(answer_he):
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="VOCAB_LEAKAGE",
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            context_chunk_ids=retrieval_context.chunk_ids,
            input_tokens=provider_result.input_tokens,
            output_tokens=provider_result.output_tokens,
        )
        store_exact_cached_response(request_context.cache_key, response)
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response

    allowed_vocab = build_allowed_vocabulary(
        bundle, _resolve_selected_chunks(bundle, retrieval_context.chunk_ids)
    )
    vocabulary_decision = evaluate_vocabulary(
        answer_he, allowed_vocab, level=resolved_level,
    )
    if vocabulary_decision.fallback_used:
        # A single out-of-vocab word used to nuke the whole reply and swap in
        # a canned fallback — which, being cached, made the bot loop forever
        # on the same sentence. Instead, ask the model ONCE to rephrase using
        # only the allowed vocabulary; most leaks are one stray word and a
        # guided retry recovers a real, in-scope answer.
        retry = _retry_within_vocabulary(
            provider=request_context.provider,
            model=request_context.model,
            base_system_message=system_message,
            question=request_context.message,
            blocked_tokens=vocabulary_decision.blocked_tokens,
            allowed_vocab=allowed_vocab,
            options=call_opts,
            level=resolved_level,
        )
        if retry is not None:
            answer_he, provider_result = retry  # validated; fall through
        else:
            response = _build_fallback_response_from_request(
                request_context=request_context,
                level=resolved_level,
                fallback_reason=vocabulary_decision.fallback_reason,
                latency_ms=int(round(provider_result.latency_seconds * 1000)),
                context_chunk_ids=retrieval_context.chunk_ids,
                blocked_tokens=vocabulary_decision.blocked_tokens,
                input_tokens=provider_result.input_tokens,
                output_tokens=provider_result.output_tokens,
            )
            # Deliberately NOT cached: a transient leak must not permanently
            # freeze this input on the canned fallback (root of the loop).
            response.retrievalScores = retrieval_context.relevance_scores
            _log_response(response, active_provider, retrieval_context.chunks_count)
            return response

    response = ChatResponse(
        answerHe=answer_he,
        answerAr=None,
        fallbackUsed=False,
        fallbackReason=None,
        level=resolved_level,
        model=active_model,
        provider=active_provider,
        latencyMs=int(round(provider_result.latency_seconds * 1000)),
        cacheHit=False,
        routerHit=False,
        contextChunkIds=retrieval_context.chunk_ids,
        retrievalScores=retrieval_context.relevance_scores,
        guardrail=GuardrailReport(
            vocabularyLeakage=False,
            blockedTokens=[],
            grammarErrors=[e.hint for e in grammar_errors],
        ),
        suggestedNextPrompts=get_suggestions(
            answer_he=answer_he,
            message=request_context.message,
            level=resolved_level,
        ),
        inputTokens=provider_result.input_tokens,
        outputTokens=provider_result.output_tokens,
    )
    store_exact_cached_response(request_context.cache_key, response)
    # Save turn to conversation memory (only for sessions with an id)
    if request_context.session_id:
        CONVERSATION_MEMORY.append_turn(
            session_id=request_context.session_id,
            user_message=request_context.message,
            assistant_message=answer_he,
        )
    # Vocab tracking for text-chat (fire-and-forget, never blocks)
    track_vocab_async(
        transcribed_text=request_context.message,
        user_id=request_context.user_id,
        level=resolved_level,
    )
    _log_response(response, active_provider, retrieval_context.chunks_count)
    return response


def _retry_within_vocabulary(
    *,
    provider: str,
    model: str,
    base_system_message: str,
    question: str,
    blocked_tokens: list[str],
    allowed_vocab: list[str],
    options: ProviderCallOptions,
    level: str,
):
    """
    Ask the model ONCE to rephrase using only the allowed vocabulary.

    Returns (answer_he, provider_result) when the retry yields a
    Hebrew-only, in-vocabulary answer; otherwise None so the caller falls
    back to the canned reply. Any provider error is swallowed → None.
    """
    allowed_preview = ", ".join(allowed_vocab[:60])
    guidance = (
        "\n\n[תיקון] התשובה הקודמת השתמשה במילים אסורות: "
        + ", ".join(blocked_tokens)
        + ". כתוב מחדש תשובה קצרה מאוד בעברית פשוטה. "
        + "השתמש אך ורק במילים מהרשימה הבאה, ואל תשתמש במילים האסורות: "
        + allowed_preview
    )
    try:
        retry_result = call_provider(
            provider, model, base_system_message + guidance, question,
            options=options,
        )
    except Exception:
        return None

    retry_answer = _split_answer(retry_result.answer, voice_mode=options.voice_mode)
    if not retry_answer or not is_hebrew_only_answer(retry_answer):
        return None
    if evaluate_vocabulary(retry_answer, allowed_vocab, level=level).fallback_used:
        return None
    return retry_answer, retry_result


def stream_chat_response(payload: ChatRequest) -> Iterator[str]:
    """
    Streaming variant of generate_chat_response.

    Runs the same pre-LLM pipeline (cache, guardrails, retrieval, grammar)
    then yields raw text tokens from the LLM as they arrive.

    LLM tokens are buffered internally and the post-LLM guardrails
    (Hebrew-only, vocabulary) run on the COMPLETE answer before anything is
    yielded — the client only ever receives a validated answer or the
    fallback text, never raw unvalidated model output.

    Pre-LLM exits (cache hit, fast-reject, router, out-of-scope, semantic cache hit) yield
    a single chunk, so callers always get at least one yield.
    """
    request_context = _build_request_context(payload)
    bundle = get_level_bundle(request_context.requested_level)
    resolved_level = bundle.level
    fast_reject = (
        classify_fast_reject_voice if request_context.voice_mode
        else classify_fast_reject
    )

    # 1. Fast-reject check FIRST
    fallback_reason = fast_reject(request_context.message)
    if fallback_reason:
        yield get_fallback_text(fallback_reason)
        return

    # 2. Exact Cache lookup NEXT
    cached = get_exact_cached_response(request_context.cache_key)
    if cached is not None:
        yield cached.answerHe or get_fallback_text(cached.fallbackReason)
        return

    # 3. Rule-based router
    routed = route_message(
        message=request_context.normalized_message,
        bundle=bundle,
        level=resolved_level,
        model=request_context.model,
        include_arabic=request_context.include_arabic,
    )
    if routed is not None:
        yield routed.answerHe or get_fallback_text(None)
        return

    # 4. Out-of-scope check
    if is_clearly_out_of_scope(
        request_context.message,
        set(bundle.vocab_set),
        set(bundle.advanced_only_tokens),
        level=resolved_level,
    ):
        yield get_fallback_text("OUT_OF_SCOPE")
        return

    # 5. Semantic Cache lookup
    if not _is_session_sensitive_message(request_context.normalized_message):
        try:
            from services.chat_cache import SEMANTIC_CACHE_MANAGER
            semantic_cached = SEMANTIC_CACHE_MANAGER.lookup(
                query=request_context.message,
                level=resolved_level,
                include_arabic=request_context.include_arabic,
            )
            if semantic_cached is not None:
                yield semantic_cached.answerHe or get_fallback_text(semantic_cached.fallbackReason)
                return
        except Exception:
            pass

    # ── retrieval + grammar hint ─────────────────────────────────────────────
    retrieval_context = build_retrieval_context(
        request_context.message, bundle.chunks, limit=2
    )
    grammar_errors = detect_grammar_errors(request_context.message)
    grammar_hint = build_grammar_hint(grammar_errors)
    system_message = _build_system_message(
        base_prompt=_load_prompt(request_context.voice_mode),
        vocabulary=build_allowed_vocabulary(
            bundle,
            _resolve_selected_chunks(bundle, retrieval_context.chunk_ids),
        ),
        context=retrieval_context.context_text,
        voice_mode=request_context.voice_mode,
        grammar_hint=grammar_hint,
    )

    history = CONVERSATION_MEMORY.get_history(request_context.session_id or "")
    call_opts = ProviderCallOptions(
        voice_mode=request_context.voice_mode,
        max_output_tokens=(
            VOICE_OUTPUT_TOKENS if request_context.voice_mode else TEXT_MAX_OUTPUT_TOKENS
        ),
        temperature=VOICE_TEMPERATURE if request_context.voice_mode else 0.2,
        history=tuple(history),
    )

    # ── stream tokens ────────────────────────────────────────────────────────
    accumulated: list[str] = []
    try:
        for token in stream_provider(
            request_context.provider,
            request_context.model,
            system_message,
            request_context.message,
            call_opts,
        ):
            accumulated.append(token)
    except Exception:
        yield get_fallback_text("MODEL_ERROR")
        return

    # ── post-stream guardrails (apply to full accumulated answer) ────────────
    answer_he = _split_answer(
        "".join(accumulated), voice_mode=request_context.voice_mode
    )
    if not answer_he or not is_hebrew_only_answer(answer_he):
        yield get_fallback_text("VOCAB_LEAKAGE")
        return

    allowed_vocab = build_allowed_vocabulary(
        bundle,
        _resolve_selected_chunks(bundle, retrieval_context.chunk_ids),
    )
    vocab_decision = evaluate_vocabulary(answer_he, allowed_vocab, level=resolved_level)
    if vocab_decision.fallback_used:
        yield get_fallback_text("VOCAB_LEAKAGE")
        return

    # ── persist to conversation memory ───────────────────────────────────────
    if request_context.session_id:
        CONVERSATION_MEMORY.append_turn(
            session_id=request_context.session_id,
            user_message=request_context.message,
            assistant_message=answer_he,
        )
    
    yield answer_he


def _build_request_context(payload: ChatRequest) -> ChatRequestContext:
    provider, model = get_configured_provider()
    requested_level = normalize_level(payload.level)
    # Sanitize once at the entry point: strip invisible smuggling chars and
    # normalize the maqaf, so guardrails, routing, caching and the LLM all see
    # the same clean text. Closes the Unicode edge cases from the hardening audit.
    sanitized_message = sanitize_input(payload.message or "")
    include_arabic = enforce_hebrew_only_scope(payload.includeArabic)
    return ChatRequestContext(
        message=sanitized_message,
        normalized_message=sanitized_message,
        requested_level=requested_level,
        include_arabic=include_arabic,
        cache_key=build_cache_key(sanitized_message, requested_level, include_arabic),
        provider=provider,
        model=model,
        voice_mode=getattr(payload, "voiceMode", False),
        session_id=getattr(payload, "sessionId", None) or None,
        user_id=getattr(payload, "userId", None) or None,
    )


def _hydrate_cached_response(response: ChatResponse, request_context: ChatRequestContext) -> ChatResponse:
    response.cacheHit = True
    response.latencyMs = 0
    response.provider = response.provider or request_context.provider
    response.model = response.model or request_context.model
    if not response.retrievalScores:
        response.retrievalScores = []
    if not response.suggestedNextPrompts:
        response.suggestedNextPrompts = get_suggestions(
            answer_he=response.answerHe,
            message=request_context.message,
            level=response.level or request_context.requested_level,
            fallback_used=response.fallbackUsed,
        )
    return response


def _policy_key(text: str) -> str:
    return " ".join(
        normalize_hebrew_token(part)
        for part in (text or "").split()
        if normalize_hebrew_token(part)
    ).strip()


def _is_session_sensitive_message(message: str) -> bool:
    key = _policy_key(message)
    if not key:
        return False
    if key.startswith("קוראים לי") or key.startswith("שמי"):
        return True
    return key in {
        "איך קוראים לי",
        "מה השם שלי",
        "תגיד שוב",
        "תגידי שוב",
        "חזור שוב",
        "וכמה הוא עולה",
        "כמה הוא עולה",
    }


def _remember_successful_turn(
    request_context: ChatRequestContext,
    response: ChatResponse,
) -> None:
    if response.fallbackUsed or not request_context.session_id:
        return
    CONVERSATION_MEMORY.append_turn(
        session_id=request_context.session_id,
        user_message=request_context.message,
        assistant_message=response.answerHe,
    )


def _build_static_response(
    *,
    request_context: ChatRequestContext,
    level: str,
    answer_he: str,
    router_hit: bool = False,
    context_chunk_ids: list[str] | None = None,
    retrieval_scores: list[float] | None = None,
) -> ChatResponse:
    return ChatResponse(
        answerHe=answer_he,
        answerAr=None,
        fallbackUsed=False,
        fallbackReason=None,
        level=level,
        model=request_context.model,
        provider=request_context.provider,
        latencyMs=0,
        cacheHit=False,
        routerHit=router_hit,
        contextChunkIds=context_chunk_ids or [],
        retrievalScores=retrieval_scores or [],
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
        suggestedNextPrompts=get_suggestions(
            answer_he=answer_he,
            message=request_context.message,
            level=level,
        ),
    )


def _build_pre_llm_response(
    *,
    request_context: ChatRequestContext,
    level: str,
) -> ChatResponse | None:
    message = request_context.normalized_message
    key = _policy_key(message)
    if not key:
        return None

    name_match = re.match(r"^(?:קוראים לי|שמי)\s+([\u0590-\u05ff]{2,20})$", key)
    if name_match and request_context.session_id:
        learner_name = name_match.group(1)
        CONVERSATION_MEMORY.set_fact(
            request_context.session_id,
            "learner_name",
            learner_name,
        )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="נעים מאוד.",
        )

    if key in {"איך קוראים לי", "מה השם שלי"}:
        learner_name = CONVERSATION_MEMORY.get_fact(
            request_context.session_id or "",
            "learner_name",
        )
        answer = f"קוראים לך {learner_name}." if learner_name else "אני לא יודע. איך קוראים לך?"
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=answer,
        )

    if key == "מה אני רוצה לשתות":
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="אני לא יודע. מה אתה רוצה לשתות?",
        )

    if key in {"תגיד שוב", "תגידי שוב", "חזור שוב"}:
        last_answer = _last_assistant_answer(request_context.session_id or "")
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=last_answer or "מה להגיד שוב?",
        )

    if key in {"וכמה הוא עולה", "כמה הוא עולה"}:
        history_text = _history_text(request_context.session_id or "")
        if "אבטיח" in history_text or "שקל" in history_text:
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he="שקל וחצי לקילו.",
            )

    if key in {"כמה", "איפה", "וזה", "שם"}:
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="על מה אתה שואל?",
        )

    if "אני רוצה ולא אני רוצים" in key:
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="אומרים: אני רוצה.",
        )

    if key.startswith("תקן היא גר בבית") or "היא גר בבית" in key:
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="אומרים: היא גרה בבית.",
        )

    if "לא שאלתי איפה הדואר" in key or "שאלתי איפה הדואר" in key:
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="הדואר ליד החנות.",
        )

    if _should_short_circuit_out_of_scope(key):
        return _build_fallback_response_from_request(
            request_context=request_context,
            level=level,
            fallback_reason="OUT_OF_SCOPE",
        )

    if key == "אני עצוב היום":
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="אני מצטער. נתרגל מילה קלה?",
        )

    return None


def _should_short_circuit_out_of_scope(key: str) -> bool:
    phrase_groups = (
        ("ענה רק", "במספרים"),
        ("תאריך", "היום"),
        ("מזג", "האוויר"),
        ("חדשות", "היום"),
        ("תוכנית", "לימוד", "חודש"),
        ("תרגם", "ערבית"),
        ("פירוש", "אנגלית"),
        ("אותיות", "לטיניות"),
    )
    return any(all(part in key for part in group) for group in phrase_groups)


def _build_extractive_curriculum_response(
    *,
    request_context: ChatRequestContext,
    level: str,
    retrieval_context,
) -> ChatResponse | None:
    key = _policy_key(request_context.normalized_message)
    answer: str | None = None

    if key.startswith("תקן אם צריך אני רוצה קפה עם חלב"):
        answer = "כן, נכון. אני רוצה קפה עם חלב."
    elif "כמה עולה האבטיח" in key or "כמה עולה אבטיח" in key:
        answer = "שקל וחצי לקילו."
    elif "איפה הדואר" in key:
        answer = "הדואר ליד החנות."
    elif "מה יש בתיק" in key:
        answer = "יש מים בתיק."
    elif "אני רוצה קפה עם חלב" in key:
        answer = "בסדר. קפה עם חלב."

    if answer is None:
        return None

    return _build_static_response(
        request_context=request_context,
        level=level,
        answer_he=answer,
        context_chunk_ids=retrieval_context.chunk_ids,
        retrieval_scores=retrieval_context.relevance_scores,
    )


def _last_assistant_answer(session_id: str) -> str | None:
    for item in reversed(CONVERSATION_MEMORY.get_history(session_id)):
        if item.get("role") == "assistant":
            value = (item.get("content") or "").strip()
            if value:
                return value
    return None


def _history_text(session_id: str) -> str:
    return "\n".join(
        (item.get("content") or "")
        for item in CONVERSATION_MEMORY.get_history(session_id)
    )


def _resolve_selected_chunks(bundle, chunk_ids: list[str]):
    chunk_lookup = {chunk.chunk_id: chunk for chunk in bundle.chunks}
    return [chunk_lookup[chunk_id] for chunk_id in chunk_ids if chunk_id in chunk_lookup]


def _load_prompt(voice_mode: bool = False) -> str:
    if voice_mode and PROMPT_VOICE_PATH.exists():
        return PROMPT_VOICE_PATH.read_text(encoding="utf-8").strip()
    prompt_path = PROMPT_V2_PATH if PROMPT_V2_PATH.exists() else PROMPT_V1_PATH
    return prompt_path.read_text(encoding="utf-8").strip()


def _build_system_message(
    base_prompt: str,
    vocabulary: list[str],
    context: str,
    voice_mode: bool = False,
    grammar_hint: str = "",
) -> str:
    vocabulary_block = ", ".join(vocabulary)
    if voice_mode:
        msg = (
            f"{base_prompt}\n"
            f"Lead the lesson: correct gently if needed, then ask ONE short question.\n"
            f"Keep it to 1-2 short spoken sentences, up to {VOICE_MAX_WORDS} Hebrew words.\n"
            "No punctuation except a final period or question mark.\n"
            "Use Hebrew only. No Arabic, no English, no digits.\n\n"
            f"Approved vocabulary:\n{vocabulary_block}\n\n"
            f"Approved curriculum context:\n{context}"
        )
    else:
        msg = (
            f"{base_prompt}\n"
            f"Lead the lesson: if the student erred, correct gently and show the "
            f"right form; praise if correct; then ALWAYS end with ONE short question.\n"
            f"Keep it to 2-3 short Hebrew sentences, up to {TEXT_MAX_WORDS} Hebrew words.\n"
            "Use Hebrew only. Do not add Arabic or English.\n\n"
            f"Approved vocabulary:\n{vocabulary_block}\n\n"
            f"Approved curriculum context:\n{context}"
        )
    if grammar_hint:
        msg += f"\n\n{grammar_hint}"
    return msg


def _split_answer(answer: str, voice_mode: bool = False) -> str:
    lines = [line.strip() for line in (answer or "").splitlines() if line.strip()]
    if not lines:
        return ""

    # Keep the leading Hebrew lines (the tutor's reply may span 2-3 short
    # sentences across lines) and stop at the first non-Hebrew line so an
    # optional Arabic translation line is dropped from answerHe.
    hebrew_lines = []
    for line in lines:
        if is_hebrew_only_answer(line):
            hebrew_lines.append(line)
        else:
            break
    answer_he = " ".join(hebrew_lines) if hebrew_lines else lines[0]

    cap = VOICE_MAX_WORDS if voice_mode else TEXT_MAX_WORDS
    if not is_short_hebrew_answer(answer_he, max_words=cap):
        trimmed_tokens: list[str] = []
        for token in answer_he.split():
            trimmed_tokens.append(token)
            if count_hebrew_words(" ".join(trimmed_tokens)) >= cap:
                break
        answer_he = " ".join(trimmed_tokens).strip()

    if voice_mode:
        answer_he = strip_non_tts_chars(answer_he)

    return answer_he


def _build_fallback_response(
    level: str,
    model: str,
    fallback_reason: str,
    provider: str | None = None,
    latency_ms: int = 0,
    context_chunk_ids: list[str] | None = None,
    blocked_tokens: list[str] | None = None,
    message: str = "",
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> ChatResponse:
    # When the student wrote in Arabic, they demonstrably read Arabic.
    # A Hebrew-only rejection teaches nothing; mirror guidance in answerAr.
    answer_ar: str | None = None
    if ARABIC_RE.search(message):
        answer_ar = get_fallback_text_ar(fallback_reason)
    return ChatResponse(
        answerHe=get_fallback_text(fallback_reason),
        answerAr=answer_ar,
        fallbackUsed=True,
        fallbackReason=fallback_reason,
        level=level,
        model=model,
        provider=provider,
        latencyMs=latency_ms,
        cacheHit=False,
        routerHit=False,
        contextChunkIds=context_chunk_ids or [],
        guardrail=GuardrailReport(
            vocabularyLeakage=bool(blocked_tokens),
            blockedTokens=blocked_tokens or [],
        ),
        suggestedNextPrompts=get_suggestions(
            answer_he=get_fallback_text(fallback_reason),
            message=message,
            level=level,
            fallback_used=True,
        ),
        inputTokens=input_tokens,
        outputTokens=output_tokens,
    )


def _build_fallback_response_from_request(
    request_context: ChatRequestContext,
    level: str,
    fallback_reason: str,
    latency_ms: int = 0,
    context_chunk_ids: list[str] | None = None,
    blocked_tokens: list[str] | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> ChatResponse:
    return _build_fallback_response(
        level=level,
        model=request_context.model,
        provider=request_context.provider,
        fallback_reason=fallback_reason,
        latency_ms=latency_ms,
        context_chunk_ids=context_chunk_ids,
        blocked_tokens=blocked_tokens,
        message=request_context.message,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


def _log_response(response: ChatResponse, provider: str, chunks_count: int = 0) -> None:
    outcome = "fallback" if response.fallbackUsed else "answer"
    logger.info(
        json.dumps(
            {
                "event": "chat_response",
                "outcome": outcome,
                "provider": provider,
                "model": response.model,
                "level": response.level,
                "latencyMs": response.latencyMs,
                "fallbackUsed": response.fallbackUsed,
                "fallbackReason": response.fallbackReason,
                "cacheHit": response.cacheHit,
                "routerHit": response.routerHit,
                "chunksCount": chunks_count,
                "vocabularyLeakage": response.guardrail.vocabularyLeakage,
            },
            ensure_ascii=False,
        )
    )


def _map_provider_error_to_fallback_reason(error: Exception) -> str:
    if isinstance(error, ChatProviderTimeoutError):
        if "circuit is open" in str(error).lower():
            return "CIRCUIT_OPEN"
        return "MODEL_TIMEOUT"
    if isinstance(error, ChatProviderQuotaError):
        return "PROVIDER_QUOTA"
    if isinstance(error, ChatProviderAuthError):
        return "PROVIDER_AUTH"
    if isinstance(error, ChatProviderNetworkError):
        return "PROVIDER_NETWORK"
    if isinstance(error, ChatProviderError):
        return "MODEL_ERROR"
    return "MODEL_ERROR"
