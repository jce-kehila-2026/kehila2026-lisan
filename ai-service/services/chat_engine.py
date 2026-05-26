from __future__ import annotations

import json
import logging
from pathlib import Path

from services.chat_cache import (
    build_allowed_vocabulary,
    build_cache_key,
    get_exact_cached_response,
    get_level_bundle,
    store_exact_cached_response,
)
from services.chat_circuit_breaker import provider_circuit
from services.chat_guardrails import (
    classify_fast_reject,
    count_hebrew_words,
    evaluate_vocabulary,
    get_fallback_text,
    is_clearly_out_of_scope,
    is_hebrew_only_answer,
    is_short_hebrew_answer,
    normalize_level,
)
from services.chat_provider import (
    ChatProviderAuthError,
    ChatProviderError,
    ChatProviderNetworkError,
    ChatProviderQuotaError,
    ChatProviderTimeoutError,
    call_provider,
    get_configured_provider,
)
from services.chat_retrieval import (
    render_context,
    retrieve_relevant_chunks,
)
from services.chat_router import route_message
from services.chat_schemas import ChatRequest, ChatResponse, GuardrailReport
from services.chat_suggestions import get_suggestions

logger = logging.getLogger("lisan.chat")

BASE_DIR = Path(__file__).resolve().parents[1]
PROMPT_V2_PATH = BASE_DIR / "prompts" / "chat-system-prompt-v2.txt"
PROMPT_V1_PATH = BASE_DIR / "prompts" / "chat-system-prompt-v1.txt"


def generate_chat_response(payload: ChatRequest) -> ChatResponse:
    provider, model = get_configured_provider()
    requested_level = normalize_level(payload.level)
    # Current product scope is Hebrew-only. Ignore caller Arabic requests until
    # the Arabic explanation path has its own quality pass and eval coverage.
    include_arabic = False
    cache_key = build_cache_key(payload.message, requested_level, include_arabic)

    cached_response = get_exact_cached_response(cache_key)
    if cached_response is not None:
        cached_response.cacheHit = True
        cached_response.latencyMs = 0
        cached_response.provider = provider
        # Re-attach suggestions in case the cached entry pre-dates this field.
        if not cached_response.suggestedNextPrompts:
            cached_response.suggestedNextPrompts = get_suggestions(
                answer_he=cached_response.answerHe,
                message=payload.message,
                level=requested_level,
                fallback_used=cached_response.fallbackUsed,
            )
        _log_response(cached_response, provider, 0)
        return cached_response

    bundle = get_level_bundle(requested_level)
    resolved_level = bundle.level
    fallback_reason = classify_fast_reject(payload.message)

    if fallback_reason:
        response = _build_fallback_response(
            level=requested_level,
            model=model,
            provider=provider,
            fallback_reason=fallback_reason,
            message=payload.message,
        )
        store_exact_cached_response(cache_key, response)
        _log_response(response, provider, 0)
        return response

    routed_response = route_message(
        message=payload.message.strip(),
        bundle=bundle,
        level=resolved_level,
        model=model,
        include_arabic=include_arabic,
    )
    if routed_response is not None:
        routed_response.provider = provider
        routed_response.suggestedNextPrompts = get_suggestions(
            answer_he=routed_response.answerHe,
            message=payload.message,
            level=resolved_level,
        )
        store_exact_cached_response(cache_key, routed_response)
        _log_response(routed_response, provider, 0)
        return routed_response

    if is_clearly_out_of_scope(payload.message, set(bundle.vocab_set), set(bundle.advanced_only_tokens)):
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="OUT_OF_SCOPE",
            message=payload.message,
        )
        store_exact_cached_response(cache_key, response)
        _log_response(response, provider, 0)
        return response

    selected_chunks = retrieve_relevant_chunks(payload.message, bundle.chunks, limit=2)
    chunk_ids = [chunk.chunk_id for chunk in selected_chunks]
    context = render_context(selected_chunks)
    system_message = _build_system_message(
        base_prompt=_load_prompt(),
        vocabulary=build_allowed_vocabulary(bundle, selected_chunks),
        context=context,
    )

    if not provider_circuit.allow_request():
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="CIRCUIT_OPEN",
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        _log_response(response, provider, len(selected_chunks))
        return response

    try:
        provider_result = call_provider(provider, model, system_message, payload.message)
        provider_circuit.record_success()
    except ChatProviderTimeoutError:
        provider_circuit.record_failure()
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="MODEL_TIMEOUT",
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        store_exact_cached_response(cache_key, response)
        _log_response(response, provider, len(selected_chunks))
        return response
    except ChatProviderQuotaError:
        provider_circuit.record_failure()
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="PROVIDER_QUOTA",
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        _log_response(response, provider, len(selected_chunks))
        return response
    except ChatProviderAuthError:
        provider_circuit.record_failure()
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="PROVIDER_AUTH",
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        _log_response(response, provider, len(selected_chunks))
        return response
    except ChatProviderNetworkError:
        provider_circuit.record_failure()
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="PROVIDER_NETWORK",
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        _log_response(response, provider, len(selected_chunks))
        return response
    except ChatProviderError:
        provider_circuit.record_failure()
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="MODEL_ERROR",
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        store_exact_cached_response(cache_key, response)
        _log_response(response, provider, len(selected_chunks))
        return response

    answer_he = _split_answer(provider_result.answer)
    if not answer_he:
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="EMPTY_RESPONSE",
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        store_exact_cached_response(cache_key, response)
        _log_response(response, provider, len(selected_chunks))
        return response

    if not is_hebrew_only_answer(answer_he):
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason="VOCAB_LEAKAGE",
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            context_chunk_ids=chunk_ids,
            message=payload.message,
        )
        store_exact_cached_response(cache_key, response)
        _log_response(response, provider, len(selected_chunks))
        return response

    vocabulary_decision = evaluate_vocabulary(answer_he, build_allowed_vocabulary(bundle, selected_chunks))
    if vocabulary_decision.fallback_used:
        response = _build_fallback_response(
            level=resolved_level,
            model=model,
            provider=provider,
            fallback_reason=vocabulary_decision.fallback_reason,
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            context_chunk_ids=chunk_ids,
            blocked_tokens=vocabulary_decision.blocked_tokens,
            message=payload.message,
        )
        store_exact_cached_response(cache_key, response)
        _log_response(response, provider, len(selected_chunks))
        return response

    response = ChatResponse(
        answerHe=answer_he,
        answerAr=None,
        fallbackUsed=False,
        fallbackReason=None,
        level=resolved_level,
        model=model,
        provider=provider,
        latencyMs=int(round(provider_result.latency_seconds * 1000)),
        cacheHit=False,
        routerHit=False,
        contextChunkIds=chunk_ids,
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
        suggestedNextPrompts=get_suggestions(
            answer_he=answer_he,
            message=payload.message,
            level=resolved_level,
        ),
    )
    store_exact_cached_response(cache_key, response)
    _log_response(response, provider, len(selected_chunks))
    return response


def _load_prompt() -> str:
    prompt_path = PROMPT_V2_PATH if PROMPT_V2_PATH.exists() else PROMPT_V1_PATH
    return prompt_path.read_text(encoding="utf-8").strip()


def _build_system_message(
    base_prompt: str,
    vocabulary: list[str],
    context: str,
) -> str:
    vocabulary_block = ", ".join(vocabulary)
    return (
        f"{base_prompt}\n"
        "Answer in one short Hebrew sentence.\n"
        "Maximum 12 Hebrew words.\n"
        "Use Hebrew only. Do not add Arabic or English.\n"
        "No explanations, translations, second lines, lists, or notes.\n\n"
        f"Approved vocabulary:\n{vocabulary_block}\n\n"
        f"Approved curriculum context:\n{context}"
    )


def _split_answer(answer: str) -> str:
    lines = [line.strip() for line in (answer or "").splitlines() if line.strip()]
    if not lines:
        return ""

    answer_he = lines[0]

    if not is_short_hebrew_answer(answer_he):
        trimmed_tokens: list[str] = []
        for token in answer_he.split():
            trimmed_tokens.append(token)
            if count_hebrew_words(" ".join(trimmed_tokens)) >= 12:
                break
        answer_he = " ".join(trimmed_tokens).strip()
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
    )


def _log_response(response: ChatResponse, provider: str, chunks_count: int = 0) -> None:
    logger.info(
        json.dumps(
            {
                "event": "chat_response",
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
