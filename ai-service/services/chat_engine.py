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
from services.chat_guardrails import (
    classify_fast_reject,
    count_hebrew_words,
    enforce_hebrew_only_scope,
    evaluate_vocabulary,
    get_fallback_text,
    is_clearly_out_of_scope,
    is_hebrew_only_answer,
    is_short_hebrew_answer,
    normalize_level,
)
from services.chat_provider import (
    AllProvidersFailedError,
    ChatProviderAuthError,
    ChatProviderError,
    ChatProviderNetworkError,
    ChatProviderQuotaError,
    ChatProviderTimeoutError,
    call_provider,
    call_provider as live_call_provider,
    get_configured_provider,
    provider_circuit,
)
from services.chat_retrieval import (
    build_retrieval_context,
)
from services.chat_router import route_message
from services.chat_schemas import ChatRequest, ChatRequestContext, ChatResponse, GuardrailReport
from services.chat_suggestions import get_suggestions

logger = logging.getLogger("lisan.chat")

BASE_DIR = Path(__file__).resolve().parents[1]
PROMPT_V2_PATH = BASE_DIR / "prompts" / "chat-system-prompt-v2.txt"
PROMPT_V1_PATH = BASE_DIR / "prompts" / "chat-system-prompt-v1.txt"


def generate_chat_response(payload: ChatRequest) -> ChatResponse:
    request_context = _build_request_context(payload)

    cached_response = get_exact_cached_response(request_context.cache_key)
    if cached_response is not None:
        hydrated_response = _hydrate_cached_response(cached_response, request_context)
        _log_response(hydrated_response, request_context.provider, 0)
        return hydrated_response

    bundle = get_level_bundle(request_context.requested_level)
    resolved_level = bundle.level
    fallback_reason = classify_fast_reject(request_context.message)

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

    if is_clearly_out_of_scope(request_context.message, set(bundle.vocab_set), set(bundle.advanced_only_tokens)):
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="OUT_OF_SCOPE",
        )
        store_exact_cached_response(request_context.cache_key, response)
        _log_response(response, request_context.provider, 0)
        return response

    retrieval_context = build_retrieval_context(request_context.message, bundle.chunks, limit=2)
    system_message = _build_system_message(
        base_prompt=_load_prompt(),
        vocabulary=build_allowed_vocabulary(bundle, _resolve_selected_chunks(bundle, retrieval_context.chunk_ids)),
        context=retrieval_context.context_text,
    )

    try:
        provider_result = call_provider(
            request_context.provider,
            request_context.model,
            system_message,
            request_context.message,
        )
        active_provider = provider_result.provider
        active_model = provider_result.model
    except AllProvidersFailedError as exc:
        active_provider = request_context.provider
        active_model = request_context.model
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
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="MODEL_ERROR",
            context_chunk_ids=retrieval_context.chunk_ids,
        )
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response

    answer_he = _split_answer(provider_result.answer)
    if not answer_he:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason="EMPTY_RESPONSE",
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            context_chunk_ids=retrieval_context.chunk_ids,
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
        )
        store_exact_cached_response(request_context.cache_key, response)
        response.retrievalScores = retrieval_context.relevance_scores
        _log_response(response, active_provider, retrieval_context.chunks_count)
        return response

    vocabulary_decision = evaluate_vocabulary(
        answer_he,
        build_allowed_vocabulary(bundle, _resolve_selected_chunks(bundle, retrieval_context.chunk_ids)),
    )
    if vocabulary_decision.fallback_used:
        response = _build_fallback_response_from_request(
            request_context=request_context,
            level=resolved_level,
            fallback_reason=vocabulary_decision.fallback_reason,
            latency_ms=int(round(provider_result.latency_seconds * 1000)),
            context_chunk_ids=retrieval_context.chunk_ids,
            blocked_tokens=vocabulary_decision.blocked_tokens,
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
    )
    store_exact_cached_response(request_context.cache_key, response)
    _log_response(response, active_provider, retrieval_context.chunks_count)
    return response


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


def _build_fallback_response_from_request(
    request_context: ChatRequestContext,
    level: str,
    fallback_reason: str,
    latency_ms: int = 0,
    context_chunk_ids: list[str] | None = None,
    blocked_tokens: list[str] | None = None,
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
