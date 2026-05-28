from __future__ import annotations

import json
import logging
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
    MAX_VOICE_WORDS,
    classify_fast_reject,
    classify_fast_reject_voice,
    count_hebrew_words,
    enforce_hebrew_only_scope,
    evaluate_vocabulary,
    get_fallback_text,
    is_clearly_out_of_scope,
    is_hebrew_only_answer,
    is_short_hebrew_answer,
    normalize_level,
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

logger = logging.getLogger("lisan.chat")

BASE_DIR = Path(__file__).resolve().parents[1]
PROMPT_V2_PATH    = BASE_DIR / "prompts" / "chat-system-prompt-v2.txt"
PROMPT_V1_PATH    = BASE_DIR / "prompts" / "chat-system-prompt-v1.txt"
PROMPT_VOICE_PATH = BASE_DIR / "prompts" / "chat-system-prompt-voice.txt"


def generate_chat_response(payload: ChatRequest) -> ChatResponse:
    request_context = _build_request_context(payload)

    cached_response = get_exact_cached_response(request_context.cache_key)
    if cached_response is not None:
        hydrated_response = _hydrate_cached_response(cached_response, request_context)
        _log_response(hydrated_response, request_context.provider, 0)
        return hydrated_response

    bundle = get_level_bundle(request_context.requested_level)
    resolved_level = bundle.level

    if not provider_circuit.allow_request():
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="CIRCUIT_OPEN",
        )
        _log_response(response, request_context.provider, 0)
        return response

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
        _log_response(routed_response, request_context.provider, 0)
        return routed_response

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
        max_output_tokens=VOICE_MAX_OUTPUT_TOKENS if request_context.voice_mode else 120,
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
        provider_circuit.record_failure()
        fallback_reason = _map_provider_error_to_fallback_reason(exc.primary_error)
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
        provider_circuit.record_failure()
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

    vocabulary_decision = evaluate_vocabulary(
        answer_he,
        build_allowed_vocabulary(bundle, _resolve_selected_chunks(bundle, retrieval_context.chunk_ids)),
        level=resolved_level,
    )
    if vocabulary_decision.fallback_used:
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
        store_exact_cached_response(request_context.cache_key, response)
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
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
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
    _log_response(response, active_provider, retrieval_context.chunks_count)
    return response


def stream_chat_response(payload: ChatRequest) -> Iterator[str]:
    """
    Streaming variant of generate_chat_response.

    Runs the same pre-LLM pipeline (cache, guardrails, retrieval, grammar)
    then yields raw text tokens from the LLM as they arrive.

    Pre-LLM exits (cache hit, fast-reject, router, out-of-scope) yield the
    full fallback/cached answer as a single chunk so callers always get at
    least one yield.  Post-LLM guardrails (vocab, Hebrew-only) are applied
    on the accumulated answer after streaming completes; if they fail the
    fallback text is yielded as a final correction chunk prefixed with
    the sentinel "\x00FALLBACK\x00" so the SSE layer can signal the client.
    """
    request_context = _build_request_context(payload)

    # ── cache hit ────────────────────────────────────────────────────────────
    cached = get_exact_cached_response(request_context.cache_key)
    if cached is not None:
        yield cached.answerHe or get_fallback_text(cached.fallbackReason)
        return

    bundle = get_level_bundle(request_context.requested_level)
    resolved_level = bundle.level
    fast_reject = (
        classify_fast_reject_voice if request_context.voice_mode
        else classify_fast_reject
    )

    # ── fast-reject ──────────────────────────────────────────────────────────
    fallback_reason = fast_reject(request_context.message)
    if fallback_reason:
        yield get_fallback_text(fallback_reason)
        return

    # ── rule-based router ────────────────────────────────────────────────────
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

    # ── out-of-scope ─────────────────────────────────────────────────────────
    if is_clearly_out_of_scope(
        request_context.message,
        set(bundle.vocab_set),
        set(bundle.advanced_only_tokens),
        level=resolved_level,
    ):
        yield get_fallback_text("OUT_OF_SCOPE")
        return

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
            VOICE_MAX_OUTPUT_TOKENS if request_context.voice_mode else 120
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
            yield token
    except Exception:
        yield get_fallback_text("MODEL_ERROR")
        return

    # ── post-stream guardrails (apply to full accumulated answer) ────────────
    answer_he = _split_answer(
        "".join(accumulated), voice_mode=request_context.voice_mode
    )
    if not answer_he or not is_hebrew_only_answer(answer_he):
        yield "\x00FALLBACK\x00" + get_fallback_text("VOCAB_LEAKAGE")
        return

    allowed_vocab = build_allowed_vocabulary(
        bundle,
        _resolve_selected_chunks(bundle, retrieval_context.chunk_ids),
    )
    vocab_decision = evaluate_vocabulary(answer_he, allowed_vocab, level=resolved_level)
    if vocab_decision.fallback_used:
        yield "\x00FALLBACK\x00" + get_fallback_text("VOCAB_LEAKAGE")
        return

    # ── persist to conversation memory ───────────────────────────────────────
    if request_context.session_id:
        CONVERSATION_MEMORY.append_turn(
            session_id=request_context.session_id,
            user_message=request_context.message,
            assistant_message=answer_he,
        )


def _build_request_context(payload: ChatRequest) -> ChatRequestContext:
    provider, model = get_configured_provider()
    requested_level = normalize_level(payload.level)
    normalized_message = (payload.message or "").strip()
    include_arabic = enforce_hebrew_only_scope(payload.includeArabic)
    return ChatRequestContext(
        message=payload.message,
        normalized_message=normalized_message,
        requested_level=requested_level,
        include_arabic=include_arabic,
        cache_key=build_cache_key(payload.message, requested_level, include_arabic),
        provider=provider,
        model=model,
        voice_mode=getattr(payload, "voiceMode", False),
        session_id=getattr(payload, "sessionId", None) or None,
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
            "Answer in one spoken Hebrew sentence.\n"
            "Maximum 10 Hebrew words. No punctuation except a final period or question mark.\n"
            "Use Hebrew only. No Arabic, no English, no digits.\n\n"
            f"Approved vocabulary:\n{vocabulary_block}\n\n"
            f"Approved curriculum context:\n{context}"
        )
    else:
        msg = (
            f"{base_prompt}\n"
            "Answer in one short Hebrew sentence.\n"
            "Maximum 12 Hebrew words.\n"
            "Use Hebrew only. Do not add Arabic or English.\n"
            "No explanations, translations, second lines, lists, or notes.\n\n"
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

    answer_he = lines[0]
    cap = MAX_VOICE_WORDS if voice_mode else 12

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
    return ChatResponse(
        answerHe=get_fallback_text(fallback_reason),
        answerAr=None,
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
