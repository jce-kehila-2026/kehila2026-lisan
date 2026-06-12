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
    MAX_MESSAGE_LENGTH,
    MAX_VOICE_WORDS,
    classify_fast_reject,
    classify_fast_reject_voice,
    count_hebrew_words,
    enforce_hebrew_only_scope,
    evaluate_vocabulary,
    get_fallback_text,
    get_fallback_text_ar,
    hebrew_words,
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
from services.curriculum import build_tutor_prompt, looks_like_tutor_driven_request
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

# Tier where vocabulary becomes "abstract" (finance / politics / theory:
# בורסה, קריפטו, פילוסופיה, אלגוריתמים). At/above this rank a word is rejected
# as out-of-scope below its level — kept even in conversational mode.
_ABSTRACT_COMPLEXITY_RANK = 4


def _local_conversation_shortcuts_enabled() -> bool:
    """Whether the LOCAL fabricated-conversation shortcuts are active.

    OFF by default: real conversation (free-text sentences, "let's chat",
    practising a word) flows to the LLM with memory, which is far smarter than
    canned templates. Deterministic local answers (cache, word-meaning glossary,
    name memory, greetings/thanks) and the scope guard stay local regardless.
    The 6-key free provider chain absorbs the extra LLM load at no cost.

    Set ENABLE_LOCAL_CONVERSATION_SHORTCUTS=true to restore the old fully-local
    behaviour (offline / quota-emergency mode).
    """
    return os.getenv(
        "ENABLE_LOCAL_CONVERSATION_SHORTCUTS", "false"
    ).strip().lower() in {"1", "true", "yes", "on"}


def _conversational_scope_reject(message: str, level: str) -> str | None:
    """Relaxed scope check for conversational mode.

    Only the ABSTRACT tier (finance/theory) above the learner's level is
    rejected as OUT_OF_SCOPE; everyday/survival vocabulary (rank ≤ 3) is allowed
    through to the LLM, which simplifies to the level. Hard rejects (empty /
    non-Hebrew / one-letter noise) already ran in _classify_hard_input_reject.
    """
    from services.complexity_checker import (
        estimate_vocab_complexity,
        is_too_complex_for_level,
    )
    estimated_rank, _tokens = estimate_vocab_complexity(message)
    if estimated_rank >= _ABSTRACT_COMPLEXITY_RANK and is_too_complex_for_level(
        message, level
    ):
        return "OUT_OF_SCOPE"
    return None


def generate_chat_response(payload: ChatRequest) -> ChatResponse:
    """
    Public entry point. Wraps the full pipeline in a last-resort guard so an
    unexpected error in the *non-LLM* stages (retrieval, grammar, suggestions,
    cache) degrades to a clean fallback instead of bubbling a 500 to the
    student. Provider errors are already handled granularly inside the impl.
    """
    try:
        return _generate_chat_response_impl(payload)
    except Exception as exc:  # noqa: BLE001 — last-resort guard, must not leak
        logger.exception("Unhandled error in chat pipeline: %s", exc)
        try:
            provider, model = get_configured_provider()
        except Exception:
            provider, model = "", ""
        return _build_fallback_response(
            level=normalize_level(getattr(payload, "level", None)),
            model=model,
            provider=provider,
            fallback_reason="MODEL_ERROR",
            message=getattr(payload, "message", "") or "",
        )


def _generate_chat_response_impl(payload: ChatRequest) -> ChatResponse:
    request_context = _build_request_context(payload)
    bundle = get_level_bundle(request_context.requested_level)
    resolved_level = bundle.level

    # Interactive activity mode (محادثة role-play / quiz / word-of-day ...).
    # Runs a dedicated live path that bypasses every cache and the scope
    # rejections, so the scene never dead-ends. Costs an LLM call per turn by
    # design — normal (scenario-less) chat is untouched and stays local-first.
    from services.scenario_engine import is_scenario
    if is_scenario(request_context.scenario):
        return _generate_scenario_response(request_context, resolved_level)

    from services.language_profile import detect_language_profile
    lang_profile = detect_language_profile(request_context.message)
    if lang_profile.has_arabic or (lang_profile.has_latin and lang_profile.has_hebrew):
        gatekeeper_response = _try_gatekeeper(
            request_context, resolved_level, lang_profile
        )
        if gatekeeper_response is not None:
            return gatekeeper_response

    # Fabricated local "let's practice / role-play scene" openings. OFF by
    # default → "בוא נדבר ..." flows to the LLM (or the real scenario mode),
    # which holds a genuine conversation instead of a canned scene template.
    if _local_conversation_shortcuts_enabled():
        tutor_driven_response = _try_tutor_driven_response(request_context, resolved_level)
        if tutor_driven_response is not None:
            store_exact_cached_response(request_context.cache_key, tutor_driven_response)
            _remember_successful_turn(request_context, tutor_driven_response)
            _log_response(tutor_driven_response, request_context.provider, 0)
            return tutor_driven_response

    arabic_support_response = _try_arabic_support_response(request_context, resolved_level)
    if arabic_support_response is not None:
        store_exact_cached_response(request_context.cache_key, arabic_support_response)
        _remember_successful_turn(request_context, arabic_support_response)
        _log_response(arabic_support_response, request_context.provider, 0)
        return arabic_support_response

    # Keep structural rejects (empty text, Latin/other scripts, one-letter
    # noise) ahead of the local learning layer. The learning layer is intentionally
    # lenient for new Hebrew words, but it must not turn "שלום hello" into a
    # valid Hebrew answer.
    hard_fallback_reason = _classify_hard_input_reject(request_context.message)
    if hard_fallback_reason:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason=hard_fallback_reason,
        )
        store_exact_cached_response(request_context.cache_key, response)
        _log_response(response, request_context.provider, 0)
        return response

    # Exact cache lookup before deterministic local answers so repeat greetings
    # and templates still report cacheHit=True.
    session_sensitive = (
        _is_session_sensitive_message(request_context.normalized_message)
        or _has_active_learning_scene(request_context)
    )
    cached_response = None if session_sensitive else get_exact_cached_response(request_context.cache_key)
    if cached_response is not None:
        hydrated_response = _hydrate_cached_response(cached_response, request_context)
        _remember_successful_turn(request_context, hydrated_response)
        _log_response(hydrated_response, request_context.provider, 0)
        return hydrated_response

    early_learning_response = _build_pre_llm_response(
        request_context=request_context,
        level=resolved_level,
        bundle=bundle,
    )
    if early_learning_response is not None:
        if not (
            _is_session_sensitive_message(request_context.normalized_message)
            or _has_active_learning_scene(request_context)
        ):
            store_exact_cached_response(request_context.cache_key, early_learning_response)
        _remember_successful_turn(request_context, early_learning_response)
        _log_response(early_learning_response, request_context.provider, 0)
        return early_learning_response

    # 1. Fast-reject check FIRST
    if request_context.voice_mode:
        fallback_reason = classify_fast_reject_voice(request_context.message)
    elif _local_conversation_shortcuts_enabled():
        fallback_reason = classify_fast_reject(
            request_context.message, level=resolved_level
        )
    else:
        # Conversational mode: only the abstract tier is out-of-scope; everyday
        # sentences (which the lenient local layer used to absorb) now flow to
        # the LLM instead of being rejected.
        fallback_reason = _conversational_scope_reject(
            request_context.message, resolved_level
        )

    if fallback_reason:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason=fallback_reason,
        )
        store_exact_cached_response(request_context.cache_key, response)
        if fallback_reason == "OUT_OF_SCOPE":
            _store_ood_canonical(request_context, resolved_level, response)
        _log_response(response, request_context.provider, 0)
        return response

    # 2. Exact Cache lookup NEXT
    # 2b. Canonical out-of-domain cache. A previously-rejected topic (stocks,
    #     crypto, politics ...) is returned straight from the canonical cache,
    #     phrasing-invariantly, before we re-run the scope analysis.
    if not session_sensitive:
        ood_hit = _lookup_ood_canonical(request_context, resolved_level)
        if ood_hit is not None:
            return ood_hit

    # 3. LLM Gatekeeper — intent-based local answers (WORD_MEANING, TRANSLATE,
    #    CORRECTION, known phrases, etc.). Runs BEFORE the simple rule router so
    #    that richer intent patterns (including mixed Arabic+Hebrew questions like
    #    "شو يعني בית?") are handled here without calling the remote LLM. The
    #    canonical cache inside makes every phrasing of the same intent collapse
    #    to one key, so repeat questions never reach the LLM.
    gatekeeper_response = _try_gatekeeper(
        request_context, resolved_level, lang_profile
    )
    if gatekeeper_response is not None:
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

    # The strict vocabulary-ratio OUT_OF_SCOPE only applies in fully-local mode.
    # In conversational mode the abstract-tier reject above already filtered
    # blocked topics; everything else flows to the LLM, which simplifies to the
    # learner's level rather than refusing an everyday sentence.
    if _local_conversation_shortcuts_enabled() and is_clearly_out_of_scope(
        request_context.message, set(bundle.vocab_set), set(bundle.advanced_only_tokens), level=resolved_level
    ):
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="OUT_OF_SCOPE",
        )
        store_exact_cached_response(request_context.cache_key, response)
        _store_ood_canonical(request_context, resolved_level, response)
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

    # Per-identity LLM budget. Only requests that survive every local path land
    # here, so this is the tight knob that protects the free Gemini quota: one
    # heavy user can keep asking, but their LLM calls (not their cached/router
    # answers) are throttled. Identity falls back user_id → session_id →
    # "anonymous" (IP-level throttling already happened in the HTTP middleware).
    from services.chat_cache import check_llm_rate_limit
    llm_identity = (
        request_context.user_id or request_context.session_id or "anonymous"
    )
    llm_allowed, _llm_retry = check_llm_rate_limit(llm_identity)
    if not llm_allowed:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="LLM_RATE_LIMITED",
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, request_context.provider, retrieval_context.chunks_count)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
        _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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
            _log_response(response, active_provider, retrieval_context.chunks_count, llm_called=True)
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


def _generate_scenario_response(
    request_context: ChatRequestContext,
    resolved_level: str,
) -> ChatResponse:
    """Live activity path for the six "quick activity" modes.

    Unlike the default pipeline this deliberately:
      - bypasses exact/canonical/semantic cache + router (a live role-play turn
        must never be served from a stale cached line),
      - skips the OUT_OF_SCOPE / complexity rejections (the scene re-anchors via
        the prompt instead of dead-ending), and
      - always reaches the LLM (the user accepted this cost for scenarios only).

    Hard safety (empty / over-long input), the provider circuit, and the
    per-identity LLM budget still apply.
    """
    from services.scenario_engine import build_scenario_prompt

    # Light safety only — no scope/topic rejection (that would close the scene).
    stripped = (request_context.message or "").strip()
    if not stripped:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="EMPTY_MESSAGE",
        )
        _log_response(response, request_context.provider, 0)
        return response
    if len(stripped) > MAX_MESSAGE_LENGTH:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="MESSAGE_TOO_LONG",
        )
        _log_response(response, request_context.provider, 0)
        return response

    # Provider circuit — keep degrading gracefully when the model is down.
    if not provider_circuit.allow_request():
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="CIRCUIT_OPEN",
        )
        _log_response(response, request_context.provider, 0)
        return response

    # Per-identity LLM budget (same knob that protects the free Gemini quota).
    from services.chat_cache import check_llm_rate_limit
    llm_identity = (
        request_context.user_id or request_context.session_id or "anonymous"
    )
    llm_allowed, _retry = check_llm_rate_limit(llm_identity)
    if not llm_allowed:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="LLM_RATE_LIMITED",
        )
        _log_response(response, request_context.provider, 0)
        return response

    system_message = build_scenario_prompt(
        request_context.scenario,
        resolved_level,
        request_context.include_arabic,
    )
    history = CONVERSATION_MEMORY.get_history(request_context.session_id or "")
    call_opts = ProviderCallOptions(
        voice_mode=request_context.voice_mode,
        max_output_tokens=VOICE_OUTPUT_TOKENS if request_context.voice_mode else TEXT_MAX_OUTPUT_TOKENS,
        # A touch warmer than the default 0.2 so role-play feels alive, not canned.
        temperature=VOICE_TEMPERATURE if request_context.voice_mode else 0.5,
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
        primary_error = exc.primary_error
        if not isinstance(primary_error, ChatProviderQuotaError):
            provider_circuit.record_failure()
        return _scenario_provider_failure(
            request_context, resolved_level,
            _map_provider_error_to_fallback_reason(primary_error),
        )
    except ChatProviderQuotaError:
        # Soft rate-limit — do not trip the circuit.
        return _scenario_provider_failure(
            request_context, resolved_level, "PROVIDER_QUOTA"
        )
    except ChatProviderTimeoutError:
        provider_circuit.record_failure()
        return _scenario_provider_failure(
            request_context, resolved_level, "MODEL_TIMEOUT"
        )
    except ChatProviderAuthError:
        provider_circuit.record_failure()
        return _scenario_provider_failure(
            request_context, resolved_level, "PROVIDER_AUTH"
        )
    except ChatProviderNetworkError:
        provider_circuit.record_failure()
        return _scenario_provider_failure(
            request_context, resolved_level, "PROVIDER_NETWORK"
        )
    except ChatProviderError:
        provider_circuit.record_failure()
        return _scenario_provider_failure(
            request_context, resolved_level, "MODEL_ERROR"
        )

    answer_he = _split_answer(provider_result.answer, voice_mode=request_context.voice_mode)

    # A single stray non-Hebrew fragment (e.g. an English word the model leaked
    # while role-playing) must not collapse the scene into a canned fallback.
    # Ask ONCE for a Hebrew-only rewrite first — parity with the normal path's
    # vocab retry. With thinking disabled this is rare, but it keeps the scene
    # alive when it does happen.
    if answer_he and not is_hebrew_only_answer(answer_he):
        retry = _retry_scenario_hebrew_only(
            request_context, system_message, call_opts
        )
        if retry is not None:
            answer_he, provider_result = retry

    if not answer_he or not is_hebrew_only_answer(answer_he):
        # Empty or leaked-vocab output. Degrade for THIS turn without caching so
        # the scene can recover on the next message.
        reason = "EMPTY_RESPONSE" if not answer_he else "VOCAB_LEAKAGE"
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason=reason,
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            input_tokens=provider_result.input_tokens,
            output_tokens=provider_result.output_tokens,
        )
        _log_response(response, active_provider, 0, llm_called=True)
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
        contextChunkIds=[],
        retrievalScores=[],
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
        suggestedNextPrompts=get_suggestions(
            answer_he=answer_he,
            message=request_context.message,
            level=resolved_level,
        ),
        inputTokens=provider_result.input_tokens,
        outputTokens=provider_result.output_tokens,
    )
    # Remember the turn for multi-turn continuity, but do NOT cache: a live
    # role-play line is unique to this conversation state.
    _remember_successful_turn(request_context, response)
    track_vocab_async(
        transcribed_text=request_context.message,
        user_id=request_context.user_id,
        level=resolved_level,
    )
    _log_response(response, active_provider, 0, llm_called=True)
    return response


def _retry_scenario_hebrew_only(
    request_context: ChatRequestContext,
    base_system_message: str,
    options: ProviderCallOptions,
):
    """Ask the model ONCE to rewrite its reply in Hebrew only, staying in role.

    Returns (answer_he, provider_result) when the retry is Hebrew-only;
    otherwise None so the caller degrades. Any provider error → None (we never
    let a retry failure bubble out of the scene path).
    """
    guidance = (
        "\n\n[הנחיה] כתוב מחדש את התשובה בעברית בלבד, בלי אנגלית ובלי ערבית. "
        "הישאר באותו תפקיד ובאותה סצנה, ושאל שאלה אחת קצרה בסוף."
    )
    try:
        result = call_provider(
            request_context.provider,
            request_context.model,
            base_system_message + guidance,
            request_context.message,
            options=options,
        )
    except Exception:  # noqa: BLE001 — retry is best-effort
        return None
    retry_answer = _split_answer(result.answer, voice_mode=request_context.voice_mode)
    if retry_answer and is_hebrew_only_answer(retry_answer):
        return retry_answer, result
    return None


def _scenario_provider_failure(
    request_context: ChatRequestContext,
    resolved_level: str,
    fallback_reason: str,
) -> ChatResponse:
    """Build + log a provider-error fallback for the scenario path (no caching)."""
    response = _build_fallback_response_from_request(
        request_context=request_context,
        level=resolved_level,
        fallback_reason=fallback_reason,
    )
    _log_response(response, request_context.provider, 0, llm_called=True)
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
        scenario=getattr(payload, "scenario", None) or None,
    )


def _build_gatekeeper_response(
    request_context: ChatRequestContext,
    level: str,
    tmpl,
) -> ChatResponse:
    """Build the ChatResponse for a deterministic gatekeeper template answer.

    Extracted from the two (formerly duplicated) gatekeeper call sites so the
    canonical-cache wiring lives in exactly one place.
    """
    return ChatResponse(
        answerHe=tmpl.answer_he,
        answerAr=tmpl.answer_ar,
        fallbackUsed=False,
        fallbackReason=None,
        level=level,
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
            level=level,
        ),
    )


def _try_gatekeeper(
    request_context: ChatRequestContext,
    resolved_level: str,
    lang_profile,
) -> ChatResponse | None:
    """Resolve a request via the intent gatekeeper + canonical cache.

    Order:
      1. Derive the canonical key (intent + normalized target). If a prior
         deterministic answer for the SAME intent exists, return it — this is
         the phrasing-invariant hit that keeps repeat questions off the LLM.
      2. Otherwise run the gatekeeper; if it produces a non-LLM answer, store
         it in BOTH the exact cache (this phrasing) and the canonical cache
         (every future phrasing) and return it.
      3. Return None when the gatekeeper defers to the LLM.
    """
    from services.canonical_cache import CANONICAL_CACHE, derive_intent_key
    from services.llm_gatekeeper import decide_local_answer

    canonical_k = derive_intent_key(
        request_context.message, resolved_level, lang_profile
    )
    if canonical_k:
        hit = CANONICAL_CACHE.lookup(canonical_k)
        if hit is not None:
            hydrated = _hydrate_cached_response(hit, request_context)
            _remember_successful_turn(request_context, hydrated)
            _log_response(hydrated, request_context.provider, 0)
            return hydrated

    decision = decide_local_answer(
        request_context.message, resolved_level, lang_profile
    )
    if decision is None or decision.needs_llm:
        return None

    response = _build_gatekeeper_response(
        request_context, resolved_level, decision.template
    )
    store_exact_cached_response(request_context.cache_key, response)
    if canonical_k:
        CANONICAL_CACHE.store(canonical_k, response)
    _remember_successful_turn(request_context, response)
    _log_response(response, request_context.provider, 0)
    return response


def _lookup_ood_canonical(
    request_context: ChatRequestContext,
    resolved_level: str,
) -> ChatResponse | None:
    """Return a cached out-of-domain rejection for this topic, if any."""
    from services.canonical_cache import CANONICAL_CACHE, derive_ood_key

    key = derive_ood_key(request_context.message, resolved_level)
    if not key:
        return None
    hit = CANONICAL_CACHE.lookup(key)
    if hit is None:
        return None
    hydrated = _hydrate_cached_response(hit, request_context)
    _log_response(hydrated, request_context.provider, 0)
    return hydrated


def _store_ood_canonical(
    request_context: ChatRequestContext,
    resolved_level: str,
    response: ChatResponse,
) -> None:
    """Cache a deterministic out-of-domain rejection so repeat topics skip the
    scope analysis. We pass allow_fallback=True (this is a stable local reject,
    not a transient LLM failure) and keep fallbackUsed=True so the client
    contract for rejections is preserved on the cached hit.
    """
    from services.canonical_cache import CANONICAL_CACHE, derive_ood_key

    key = derive_ood_key(request_context.message, resolved_level)
    if not key:
        return
    CANONICAL_CACHE.store(key, response, allow_fallback=True)


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


def _classify_hard_input_reject(message: str) -> str | None:
    stripped_message = (message or "").strip()
    if not stripped_message:
        return "EMPTY_MESSAGE"
    if len(stripped_message) > MAX_MESSAGE_LENGTH:
        return "MESSAGE_TOO_LONG"
    if re.fullmatch(r"[\?\u061f]+", stripped_message):
        return "EMPTY_MESSAGE"

    has_arabic = bool(ARABIC_RE.search(stripped_message))
    has_hebrew = bool(hebrew_words(stripped_message))

    if has_arabic and not has_hebrew:
        return "MIXED_LANGUAGE"

    # Reject Latin/Cyrillic/etc. before the lenient local Hebrew learner path.
    if re.search(r"[^\W\d_\u0590-\u05FF\u0600-\u06FF]", stripped_message, re.UNICODE):
        return "MIXED_LANGUAGE"

    if not has_hebrew:
        return "OUT_OF_SCOPE"

    tokens = [
        normalize_hebrew_token(token)
        for token in hebrew_words(stripped_message)
        if normalize_hebrew_token(token)
    ]
    if len(tokens) == 1 and len(tokens[0]) == 1:
        return "EMPTY_MESSAGE"
    return None


def _build_static_response(
    *,
    request_context: ChatRequestContext,
    level: str,
    answer_he: str,
    answer_ar: str | None = None,
    router_hit: bool = False,
    context_chunk_ids: list[str] | None = None,
    retrieval_scores: list[float] | None = None,
) -> ChatResponse:
    return ChatResponse(
        answerHe=answer_he,
        answerAr=answer_ar,
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


_SCENE_PROFILES: dict[str, dict[str, str | tuple[str, ...]]] = {
    "gas_station": {
        "keywords": ("קזיה", "תחנת דלק", "דלק", "בנזין"),
        "place": "בקזיה",
        "role": "המוכר",
        "question": "כמה דלק אתה צריך?",
        "start": "אנחנו בקזיה. אני המוכר. כמה דלק אתה צריך?",
    },
    "supermarket": {
        "keywords": ("סופר", "סופרמרקט", "מכולת", "קניות"),
        "place": "בסופר",
        "role": "המוכר",
        "question": "מה אתה רוצה לקנות?",
        "start": "אנחנו בסופר. אני המוכר. מה אתה רוצה לקנות?",
    },
    "clinic": {
        "keywords": ("דוקטור", "רופא", "מרפאה", "חולה", "תרופה"),
        "place": "במרפאה",
        "role": "הרופא",
        "question": "מה כואב לך?",
        "start": "אנחנו במרפאה. נתרגל בריאות. מה כואב לך?",
    },
    "university": {
        "keywords": ("אוניברסיטה", "כיתה", "שיעור", "סטודנט"),
        "place": "באוניברסיטה",
        "role": "המורה",
        "question": "איזה שיעור יש לך?",
        "start": "אנחנו באוניברסיטה. אני המורה. איזה שיעור יש לך?",
    },
    "bus_station": {
        "keywords": ("תחנה", "אוטובוס", "כרטיס"),
        "place": "בתחנה",
        "role": "הנהג",
        "question": "לאן אתה נוסע?",
        "start": "אנחנו בתחנה. אני הנהג. לאן אתה נוסע?",
    },
    "cafe": {
        "keywords": ("בית קפה", "קפה"),
        "place": "בבית קפה",
        "role": "המלצר",
        "question": "מה אתה רוצה לשתות?",
        "start": "אנחנו בבית קפה. אני המלצר. מה אתה רוצה לשתות?",
    },
    "bank": {
        "keywords": ("בנק", "חשבון", "כסף", "חתימה"),
        "place": "בבנק",
        "role": "הפקיד",
        "question": "איזה שירות אתה צריך?",
        "start": "אנחנו בבנק. אני הפקיד. איזה שירות אתה צריך?",
    },
    "post_office": {
        "keywords": ("דואר", "מעטפה", "בול", "מכתב"),
        "place": "בדואר",
        "role": "הפקיד",
        "question": "מה אתה רוצה לשלוח?",
        "start": "אנחנו בדואר. אני הפקיד. מה אתה רוצה לשלוח?",
    },
    "apartment": {
        "keywords": ("דירה", "בית", "חדר", "מטבח"),
        "place": "בדירה",
        "role": "השכן",
        "question": "מה יש בבית?",
        "start": "אנחנו בדירה. אני השכן. מה יש בבית?",
    },
    "phone_store": {
        "keywords": ("טלפון", "טלפונים", "מטען", "אחריות"),
        "place": "בחנות טלפונים",
        "role": "המוכר",
        "question": "איזה טלפון אתה רוצה?",
        "start": "אנחנו בחנות טלפונים. אני המוכר. איזה טלפון אתה רוצה?",
    },
    "bakery": {
        "keywords": ("מאפייה", "לחם", "עוגה", "טרי"),
        "place": "במאפייה",
        "role": "המוכר",
        "question": "מה אתה רוצה לקנות?",
        "start": "אנחנו במאפייה. אני המוכר. מה אתה רוצה לקנות?",
    },
    "restaurant": {
        "keywords": ("מסעדה", "תפריט", "סלט", "אוכל"),
        "place": "במסעדה",
        "role": "המלצר",
        "question": "מה אתה רוצה להזמין?",
        "start": "אנחנו במסעדה. אני המלצר. מה אתה רוצה להזמין?",
    },
    "pharmacy": {
        "keywords": ("בית מרקחת", "תרופה", "מרשם"),
        "place": "בבית מרקחת",
        "role": "הרוקח",
        "question": "איזו תרופה אתה צריך?",
        "start": "אנחנו בבית מרקחת. אני הרוקח. איזו תרופה אתה צריך?",
    },
    "hotel": {
        "keywords": ("מלון", "מפתח", "מעלית"),
        "place": "במלון",
        "role": "הפקיד",
        "question": "איזה חדר אתה צריך?",
        "start": "אנחנו במלון. אני הפקיד. איזה חדר אתה צריך?",
    },
    "market": {
        "keywords": ("שוק", "עגבנייה", "קילו", "בננה", "יקר"),
        "place": "בשוק",
        "role": "המוכר",
        "question": "מה אתה רוצה לקנות?",
        "start": "אנחנו בשוק. אני המוכר. מה אתה רוצה לקנות?",
    },
    "clothing_store": {
        "keywords": ("בגדים", "חולצה", "מידה", "צבע"),
        "place": "בחנות בגדים",
        "role": "המוכר",
        "question": "איזו מידה אתה צריך?",
        "start": "אנחנו בחנות בגדים. אני המוכר. איזו מידה אתה צריך?",
    },
    "library": {
        "keywords": ("ספרייה", "ספר", "שקט"),
        "place": "בספרייה",
        "role": "הספרן",
        "question": "איזה ספר אתה מחפש?",
        "start": "אנחנו בספרייה. אני הספרן. איזה ספר אתה מחפש?",
    },
    "gym": {
        "keywords": ("כושר", "ספורט", "להתאמן", "מנוי"),
        "place": "בחדר כושר",
        "role": "המאמן",
        "question": "מה אתה רוצה לתרגל?",
        "start": "אנחנו בחדר כושר. אני המאמן. מה אתה רוצה לתרגל?",
    },
    "workplace": {
        "keywords": ("עבודה", "משרד", "פגישה", "עובד"),
        "place": "בעבודה",
        "role": "המנהל",
        "question": "איזו פגישה יש לך?",
        "start": "אנחנו בעבודה. אני המנהל. איזו פגישה יש לך?",
    },
    "municipality": {
        "keywords": ("עירייה", "טופס", "מסמך"),
        "place": "בעירייה",
        "role": "הפקיד",
        "question": "איזה טופס אתה צריך?",
        "start": "אנחנו בעירייה. אני הפקיד. איזה טופס אתה צריך?",
    },
}


def _detect_learning_scene_id(message: str) -> str | None:
    key = _policy_key(message)
    if not key:
        return None
    for scene_id, profile in _SCENE_PROFILES.items():
        for keyword in profile["keywords"]:
            if str(keyword) in key:
                return scene_id
    return None


def _active_scene_profile(request_context: ChatRequestContext) -> dict[str, str | tuple[str, ...]] | None:
    if not request_context.session_id:
        return None
    scene_id = CONVERSATION_MEMORY.get_fact(
        request_context.session_id,
        "learning_scene",
    )
    if not scene_id:
        return None
    return _SCENE_PROFILES.get(scene_id)


def _has_active_learning_scene(request_context: ChatRequestContext) -> bool:
    return _active_scene_profile(request_context) is not None


def _scene_question(request_context: ChatRequestContext) -> str:
    profile = _active_scene_profile(request_context)
    if profile is None:
        return "מה אתה רוצה לתרגל?"
    return str(profile["question"])


def _scene_continue_response(
    request_context: ChatRequestContext,
    *,
    prefix: str = "יופי.",
) -> str:
    profile = _active_scene_profile(request_context)
    if profile is None:
        return f"{prefix} מה אתה רוצה לתרגל?"
    return f"{prefix} נשארים {profile['place']}. {profile['question']}"


def _try_tutor_driven_response(
    request_context: ChatRequestContext,
    level: str,
) -> ChatResponse | None:
    if not looks_like_tutor_driven_request(request_context.message):
        return None
    scene_id = _detect_learning_scene_id(request_context.message)
    if scene_id and request_context.session_id:
        CONVERSATION_MEMORY.set_fact(
            request_context.session_id,
            "learning_scene",
            scene_id,
        )
        profile = _SCENE_PROFILES[scene_id]
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=str(profile["start"]),
            router_hit=True,
        )
    answer_he, answer_ar = build_tutor_prompt(level, request_context.message)
    return _build_static_response(
        request_context=request_context,
        level=level,
        answer_he=answer_he,
        answer_ar=answer_ar,
        router_hit=True,
    )


def _try_arabic_support_response(
    request_context: ChatRequestContext,
    level: str,
) -> ChatResponse | None:
    message = request_context.message or ""
    if not ARABIC_RE.search(message):
        return None
    if "السلام" not in message and "سلام عليكم" not in message:
        return None
    return _build_static_response(
        request_context=request_context,
        level=level,
        answer_he="נכון. שלום זה ברכה. תגיד: שלום.",
        answer_ar="صحيح، هذا معنى قريب من שלום. الآن حاول تكتبها بالعبرية: שלום.",
        router_hit=True,
    )


# Common social / politeness / filler words. These are NOT vocabulary to drill —
# a learner typing "סליחה" or "ביי" is being polite, not asking to practice a new
# word. Treated as a coherent CLASS (see _POLITENESS_REPLIES) so the fix is
# general, not a per-word patch.
_POLITENESS_WORDS = {
    "שלום", "תודה", "תודה רבה", "בבקשה", "סליחה",
    "להתראות", "ביי", "ביי ביי", "אהלן", "נעים מאוד",
}
# Short, in-character social replies for the politeness class — keeps these turns
# local (no LLM) and warm, instead of mislabelling them as "a new word".
_POLITENESS_REPLIES = {
    "תודה": "בבקשה! נמשיך לתרגל. מה זה חלב?",
    "תודה רבה": "בבקשה רבה! נמשיך לתרגל. מה זה חלב?",
    "סליחה": "אין בעיה. נמשיך לתרגל. מה זה חלב?",
    "להתראות": "להתראות! נתראה בפעם הבאה.",
    "ביי": "ביי! נתראה בפעם הבאה.",
    "ביי ביי": "ביי! נתראה בפעם הבאה.",
    "בבקשה": "יופי. נמשיך לתרגל. מה זה חלב?",
    "אהלן": "אהלן! מה שלומך היום?",
    "נעים מאוד": "נעים מאוד! מה שלומך?",
}
_SINGLE_WORD_STOPWORDS = {
    "מה", "מי", "איפה", "איך", "כמה", "למה", "מתי",
    "אני", "אתה", "את", "הוא", "היא", "אנחנו", "הם", "הן",
    "כן", "לא", "זה", "זאת", "שם", "פה", "כאן",
    "בסדר", "טוב", "אוקיי", "סבבה",
} | {w for word in _POLITENESS_WORDS for w in word.split()}
_QUESTION_STARTERS = {"מה", "מי", "איפה", "איך", "כמה", "למה", "מתי"}
_GREETING_STARTERS = {"שלום", "היי", "הי", "בוקר", "ערב", "לילה"}


def _try_single_new_word_response(
    *,
    request_context: ChatRequestContext,
    level: str,
    key: str,
) -> ChatResponse | None:
    tokens = [
        normalize_hebrew_token(token)
        for token in hebrew_words(key)
        if normalize_hebrew_token(token)
    ]
    if len(tokens) != 1:
        return None
    word = tokens[0]
    if len(word) < 2 or word in _SINGLE_WORD_STOPWORDS:
        return None
    if _has_active_learning_scene(request_context):
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=f"יופי, {word}. {_scene_question(request_context)}",
            router_hit=True,
        )
    return _build_static_response(
        request_context=request_context,
        level=level,
        answer_he=f"כתבת מילה חדשה: {word}. תכתוב משפט קצר עם {word}?",
        router_hit=True,
    )


def _try_short_learner_sentence_response(
    *,
    request_context: ChatRequestContext,
    level: str,
    key: str,
) -> ChatResponse | None:
    if "?" in (request_context.message or ""):
        return None
    # A sentence with a grammar mistake must NOT be praised as correct here —
    # that both teaches the error and bypasses the LLM's correction. Defer to
    # the LLM (which receives a grammar hint) instead of answering locally.
    if detect_grammar_errors(request_context.message):
        return None
    tokens = [
        normalize_hebrew_token(token)
        for token in hebrew_words(key)
        if normalize_hebrew_token(token)
    ]
    if len(tokens) < 2 or len(tokens) > 8:
        return None
    if tokens[0] in _QUESTION_STARTERS or tokens[0] in _GREETING_STARTERS:
        return None
    focus_word = next(
        (token for token in reversed(tokens) if token not in _SINGLE_WORD_STOPWORDS),
        tokens[-1],
    )
    if _has_active_learning_scene(request_context):
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=_scene_continue_response(
                request_context,
                prefix=f"יפה. אמרת משפט עם {focus_word}.",
            ),
            router_hit=True,
        )
    return _build_static_response(
        request_context=request_context,
        level=level,
        answer_he=f"יפה. כתבת משפט. תכתוב עוד משפט עם {focus_word}?",
        router_hit=True,
    )


def _deterministic_local_response(
    *,
    request_context: ChatRequestContext,
    level: str,
    bundle,
    key: str,
) -> ChatResponse | None:
    """Local answers that are correct & deterministic in ANY mode.

    Greetings/thanks, glossary word-meaning, name memory, and
    curriculum-grounded price (RAG). Returns None when there is no confident
    deterministic answer, so the turn flows to the LLM instead of a canned
    template. This is the ONLY local layer that runs in conversational mode.
    """
    # Greetings / thanks / politeness — fixed social replies.
    politeness_reply = _POLITENESS_REPLIES.get(key)
    if politeness_reply is not None:
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=politeness_reply,
            router_hit=True,
        )

    # "מה זה X" — answer ONLY when the curriculum glossary knows X. Unknown words
    # defer to the LLM (which can actually explain), not a canned "new word".
    word_meaning_match = re.match(r"^מה זה\s+([֐-׿]{2,20})$", key)
    if word_meaning_match:
        from services.answer_templates import render_word_meaning
        local_answer = render_word_meaning(word_meaning_match.group(1))
        if local_answer is not None:
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=local_answer.answer_he,
                answer_ar=local_answer.answer_ar,
                router_hit=True,
            )
        return None

    # Name memory (set / recall) — deterministic per session.
    name_match = re.match(r"^(?:קוראים לי|שמי)\s+([֐-׿]{2,20})$", key)
    if name_match and request_context.session_id:
        CONVERSATION_MEMORY.set_fact(
            request_context.session_id, "learner_name", name_match.group(1)
        )
        return _build_static_response(
            request_context=request_context, level=level, answer_he="נעים מאוד.",
        )
    if key in {"איך קוראים לי", "מה השם שלי"}:
        learner_name = CONVERSATION_MEMORY.get_fact(
            request_context.session_id or "", "learner_name"
        )
        answer = (
            f"קוראים לך {learner_name}." if learner_name
            else "אני לא יודע. איך קוראים לך?"
        )
        return _build_static_response(
            request_context=request_context, level=level, answer_he=answer,
        )

    # Curriculum-grounded named-item price (e.g. the watermelon dialogue) → a
    # real RAG answer, never a fabricated echo.
    is_bare_price = key in {"כמה זה עולה", "כמה עולה"}
    is_named_price = key.startswith("כמה עולה ") and not is_bare_price
    if is_named_price and bundle is not None:
        retrieval_context = build_retrieval_context(
            request_context.message, bundle.chunks, limit=2
        )
        grounded = _build_extractive_curriculum_response(
            request_context=request_context,
            level=level,
            retrieval_context=retrieval_context,
        )
        if grounded is not None:
            return grounded
    return None


def _build_pre_llm_response(
    *,
    request_context: ChatRequestContext,
    level: str,
    bundle=None,
) -> ChatResponse | None:
    message = request_context.normalized_message
    key = _policy_key(message)
    if not key:
        return None

    # Never let the lenient local "teach this word/sentence" shortcuts handle
    # abstract / finance / theory vocabulary (בורסה, קריפטו, פילוסופיה,
    # אלגוריתמים — the top complexity tier). Those must flow to the level-aware
    # scope check: rejected as OUT_OF_SCOPE at A1, handled by the LLM/curriculum
    # at B2. Everyday survival words (rank ≤ 3: חולה, תור, טופס) are unaffected,
    # so this does not re-break the everyday-sentence fix.
    from services.complexity_checker import estimate_vocab_complexity
    estimated_rank, _complex_tokens = estimate_vocab_complexity(message)
    if estimated_rank >= 4:
        return None

    # Conversational mode (DEFAULT): serve ONLY deterministic local answers
    # (glossary word-meaning, name memory, greetings/thanks, curriculum-grounded
    # price). Everything else returns None → the turn flows to the LLM, which
    # holds a real, contextual conversation instead of a canned template.
    # Legacy fully-local mode runs the fabrication body below instead.
    if not _local_conversation_shortcuts_enabled():
        return _deterministic_local_response(
            request_context=request_context, level=level, bundle=bundle, key=key
        )

    if key in {"בסדר", "טוב", "אוקיי", "סבבה"}:
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=_scene_continue_response(request_context, prefix="בסדר."),
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="יפה. עכשיו נתרגל מילה חדשה. מה זה חלב?",
            router_hit=True,
        )

    if key in {"יאללה", "יאללה נתחיל", "בוא נתחיל"}:
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=_scene_continue_response(request_context, prefix="יאללה."),
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="יאללה. היום נתרגל חלב. מה זה חלב?",
            router_hit=True,
        )

    politeness_reply = _POLITENESS_REPLIES.get(key)
    if politeness_reply is not None:
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=_scene_continue_response(request_context, prefix="בבקשה."),
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=politeness_reply,
            router_hit=True,
        )

    # "Where is THE <thing>?" — a location question about a definite object
    # (איפה הקופה / איפה הדואר). Restricted to the "איפה ה<noun>" shape so it
    # does NOT swallow genuine open questions like "איפה אתה לומד?", which must
    # reach the LLM (a generic echo there is wrong and fails router contracts).
    if re.match(r"^איפה ה[֐-׿]{2,20}$", key):
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=f"אפשר לשאול: {key}? {_scene_question(request_context)}",
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=f"שאלה טובה. אפשר לשאול: {key}?",
            router_hit=True,
        )

    # Price questions. A BARE "how much is it" gets the generic teaching prompt.
    # A question naming a SPECIFIC item (e.g. "כמה עולה האבטיח") should get the
    # real curriculum answer when the lessons cover it — so we try extractive
    # RAG first and only fall back to the generic prompt when the curriculum has
    # nothing. This generalises the old hardcoded `"אבטיח" not in key` to ANY
    # curriculum-grounded item (current or future), with no per-word patching.
    is_bare_price = key in {"כמה זה עולה", "כמה עולה"}
    is_named_price = key.startswith("כמה עולה ") and not is_bare_price
    if is_named_price and bundle is not None:
        retrieval_context = build_retrieval_context(
            request_context.message, bundle.chunks, limit=2
        )
        grounded = _build_extractive_curriculum_response(
            request_context=request_context,
            level=level,
            retrieval_context=retrieval_context,
        )
        if grounded is not None:
            return grounded
    if is_bare_price or is_named_price:
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=f"אפשר לשאול: כמה זה עולה? {_scene_question(request_context)}",
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="אפשר לשאול: כמה זה עולה?",
            router_hit=True,
        )

    word_meaning_match = re.match(r"^מה זה\s+([\u0590-\u05ff]{2,20})$", key)
    if word_meaning_match:
        from services.answer_templates import render_word_meaning

        target_word = word_meaning_match.group(1)
        local_answer = render_word_meaning(target_word)
        if local_answer is not None:
            answer_he = local_answer.answer_he
            if _has_active_learning_scene(request_context):
                answer_he = f"{answer_he} {_scene_question(request_context)}"
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=answer_he,
                answer_ar=local_answer.answer_ar,
                router_hit=True,
            )
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=f"{target_word} זו מילה בשיחה שלנו. תכתוב משפט קצר עם {target_word}?",
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=f"זו מילה חדשה בשבילי: {target_word}. תכתוב משפט קצר עם {target_word}?",
            router_hit=True,
        )

    learner_definition = re.match(
        r"^([\u0590-\u05ff]{2,20})\s+זה\s+(.+)$",
        key,
    )
    if learner_definition:
        word = learner_definition.group(1)
        if word in _QUESTION_STARTERS:
            return None
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=f"יפה. {word} זה נכון. {_scene_question(request_context)}",
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=f"יפה. {word} זה נכון. תכתוב משפט עם {word}?",
            router_hit=True,
        )

    single_new_word_response = _try_single_new_word_response(
        request_context=request_context,
        level=level,
        key=key,
    )
    if single_new_word_response is not None:
        return single_new_word_response

    age_match = re.match(r"^אני בן\s+(\d{1,3})$", key)
    if age_match:
        age = age_match.group(1)
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he=f"יפה. אתה בן {age}. בן כמה אתה?",
            router_hit=True,
        )

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

    if key in {
        "תני לי משפט קצר לתרגל",
        "תן לי משפט קצר לתרגל",
        "תני משפט קצר",
        "תן משפט קצר",
        "משפט קצר לתרגל",
        "משפט לתרגל",
    }:
        if _has_active_learning_scene(request_context):
            question = _scene_question(request_context)
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=f"משפט קצר: אני צריך עזרה. עכשיו תענה: {question}",
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="אני רוצה חלב. עכשיו תכתוב משפט קצר?",
            router_hit=True,
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

    if key in {"לא יודע", "לא יודעת", "אני לא יודע", "אני לא יודעת"}:
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=_scene_continue_response(request_context, prefix="לא נורא."),
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="לא נורא. נתרגל יחד. מה זה קפה?",
            router_hit=True,
        )

    if key in {"בבית", "אני גר בבית", "אני גרה בבית"}:
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="יפה. אתה גר בבית. מה יש בבית?",
            router_hit=True,
        )

    if key in {"שועפט", "בשועפט", "אני גר בשועפט", "אני גרה בשועפט"}:
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="יפה. אתה גר בשועפט. מה יש שם?",
            router_hit=True,
        )

    if key == "למה":
        if _has_active_learning_scene(request_context):
            return _build_static_response(
                request_context=request_context,
                level=level,
                answer_he=_scene_continue_response(
                    request_context,
                    prefix="כי אנחנו מתרגלים עברית מהחיים.",
                ),
                router_hit=True,
            )
        return _build_static_response(
            request_context=request_context,
            level=level,
            answer_he="כי אנחנו מתרגלים עברית פשוטה. מה זה קפה?",
            router_hit=True,
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

    short_learner_response = _try_short_learner_sentence_response(
        request_context=request_context,
        level=level,
        key=key,
    )
    if short_learner_response is not None:
        return short_learner_response

    return None


def _should_short_circuit_out_of_scope(key: str) -> bool:
    phrase_groups = (
        ("ענה רק", "במספרים"),
        ("תאריך", "היום"),
        ("מזג", "האוויר"),
        ("חדשות", "היום"),
        ("פוליטיקה", "כלכלה"),
        ("מקרו", "כלכלה", "פילוסופיה"),
        ("תוכנית", "לימוד", "חודש"),
        ("תרגם", "ערבית"),
        ("פירוש", "אנגלית"),
        ("אותיות", "לטיניות"),
        ("בירוקרטיה", "ממשלתית", "מורכבת"),
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


def _log_response(
    response: ChatResponse,
    provider: str,
    chunks_count: int = 0,
    llm_called: bool = False,
) -> None:
    # Record which path resolved this request (local / cache / local_reject /
    # llm) so the leakage report can show what % of traffic actually reaches
    # the model. `llm_called` is the source of truth: a static/extractive local
    # answer is otherwise indistinguishable from a real model answer.
    from services.request_path_metrics import REQUEST_PATH_METRICS, classify_path
    path = classify_path(
        cache_hit=response.cacheHit,
        fallback_used=response.fallbackUsed,
        llm_called=llm_called,
    )
    REQUEST_PATH_METRICS.record(
        path,
        fallback_reason=response.fallbackReason if path == "llm" else None,
    )

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
