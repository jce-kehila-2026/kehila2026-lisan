from __future__ import annotations

import asyncio
import logging
import os
import time
import jwt

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from services.analytics import get_analytics_snapshot
from services.chat_cache import get_cache_stats
from services.chat_cache import get_rate_limit_status
from services.chat_engine import generate_chat_response, stream_chat_response
from services.chat_provider import get_provider_logs
from services.chat_schemas import ChatRequest, ChatResponse, VoiceChatResponse
from services.pronunciation import assess_pronunciation
from services.text_to_speech import build_ssml
from services.vocab_tracker import track_vocab_async
from services.speech_to_text import (
    STTAuthError,
    STTCircuitOpenError,
    STTError,
    STTTimeoutError,
    transcribe_audio,
)

# Max seconds to wait for pronunciation assessment alongside chat engine
_PRON_TIMEOUT_SECONDS = 10.0

logger = logging.getLogger("lisan.chat")
router = APIRouter()


def require_internal_service_secret(
    x_internal_service_secret: str | None = Header(default=None),
) -> None:
    expected_secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()

    if not expected_secret:
        return

    if not x_internal_service_secret:
        raise HTTPException(
            status_code=401,
            detail="Missing internal service secret",
        )

    if x_internal_service_secret != expected_secret:
        raise HTTPException(
            status_code=403,
            detail="Invalid internal service secret",
        )


def verify_jwt_token(
    authorization: str | None = Header(default=None),
    x_internal_service_secret: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> dict | None:
    expected_internal_secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()
    is_internal_valid = (
        expected_internal_secret 
        and x_internal_service_secret 
        and x_internal_service_secret == expected_internal_secret
    )

    expected_jwt_secret = os.getenv("JWT_SECRET", "").strip()
    if not expected_jwt_secret:
        if not is_internal_valid:
            require_internal_service_secret(x_internal_service_secret)
        return None

    if not authorization and is_internal_valid:
        return None

    # SECURITY: previously bypassed auth when PYTEST_CURRENT_TEST was set in
    # the environment. That env var can leak into production (CI/CD, Docker
    # build args) and would silently disable JWT validation. Tests now must
    # provide either internal secret OR a valid JWT — no implicit bypass.

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header containing JWT token",
        )


    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authorization header must be Bearer token",
        )

    token = authorization[len("Bearer "):].strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing JWT token after Bearer",
        )
    try:
        decoded = jwt.decode(token, expected_jwt_secret, algorithms=["HS256"])
        jwt_uid = decoded.get("uid")
        if x_user_id and jwt_uid and x_user_id != jwt_uid:
            raise HTTPException(
                status_code=403,
                detail="User ID mismatch in request headers and JWT payload",
            )
        return decoded
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token signature",
        )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    x_internal_service_secret: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> ChatResponse:
    verify_jwt_token(
        authorization=authorization,
        x_internal_service_secret=x_internal_service_secret,
        x_user_id=x_user_id,
    )
    return await run_in_threadpool(generate_chat_response, payload)



@router.post("/chat/stream")
async def chat_stream(
    payload: ChatRequest,
    x_internal_service_secret: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> StreamingResponse:
    """
    SSE streaming endpoint — yields tokens as they arrive from the LLM.

    Event format (text/event-stream):
      data: <token text>\n\n

    Special sentinel token "\x00FALLBACK\x00<text>" signals that post-stream
    guardrails failed; the client should discard buffered tokens and show <text>.

    A final "data: [DONE]\n\n" event marks the end of the stream.
    """
    verify_jwt_token(
        authorization=authorization,
        x_internal_service_secret=x_internal_service_secret,
        x_user_id=x_user_id,
    )


    async def _sse_generator():
        def _iter():
            return stream_chat_response(payload)

        token_iter = await run_in_threadpool(_iter)
        try:
            for token in token_iter:
                escaped = token.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"
            yield "data: [DONE]\n\n"
        except GeneratorExit:
            # Client disconnected mid-stream — stop pulling tokens from the
            # underlying iterator so we don't keep paying LLM costs for a
            # response no one is listening to.
            logger.info({"event": "sse_client_disconnect"})
            try:
                token_iter.close()
            except Exception:
                pass
            raise
        finally:
            try:
                token_iter.close()
            except Exception:
                pass

    return StreamingResponse(
        _sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/cache/stats")
async def cache_stats(
    x_internal_service_secret: str | None = Header(default=None),
) -> dict[str, int]:
    require_internal_service_secret(x_internal_service_secret)
    return await run_in_threadpool(get_cache_stats)


@router.get("/analytics")
async def analytics(
    x_internal_service_secret: str | None = Header(default=None),
) -> dict[str, object]:
    """
    Aggregated runtime analytics dashboard.

    Returns:
      uptime_seconds  — seconds since service start
      cache           — hits, misses, size, hit_rate
      latency         — avg/p50/p95/p99 ms from provider logs
      providers       — per-provider success/failed/skipped counts
      fallbacks       — total + breakdown by fallback reason
      guardrails      — vocabulary_leakage_events count
      rate_limits     — active_users, throttled_users
    """
    require_internal_service_secret(x_internal_service_secret)
    return await run_in_threadpool(get_analytics_snapshot)


@router.get("/logs")
async def provider_logs(
    provider: str | None = None,
    status: str | None = None,
    limit: int = 100,
    x_internal_service_secret: str | None = Header(default=None),
) -> dict[str, object]:
    require_internal_service_secret(x_internal_service_secret)
    logs = await run_in_threadpool(get_provider_logs, provider, status, limit)
    return {
        "provider": provider,
        "status": status,
        "count": len(logs),
        "items": logs,
    }


@router.get("/rate-limit/status")
async def rate_limit_status(
    user_id: str,
    x_internal_service_secret: str | None = Header(default=None),
) -> dict[str, int | bool | str]:
    require_internal_service_secret(x_internal_service_secret)
    return await run_in_threadpool(get_rate_limit_status, user_id)


# ---------------------------------------------------------------------------
# Voice endpoint
#
# Fallback codes returned to Frontend:
#   STT_CIRCUIT_OPEN  — STT circuit tripped, too many recent failures
#   STT_TIMEOUT       — Whisper did not respond within STT_TIMEOUT_SECONDS
#   STT_FAILED        — Whisper returned an error (auth, 4xx, network)
#   STT_EMPTY         — Whisper succeeded but returned empty transcript
# ---------------------------------------------------------------------------

@router.post("/chat/voice", response_model=VoiceChatResponse)
async def chat_voice(
    audio: UploadFile = File(
        ..., description="Audio file (webm/ogg/mp3/wav/m4a)"
    ),
    level: str = Form(default="A1"),
    includeArabic: bool = Form(default=False),
    userId: str | None = Form(default=None),
    x_internal_service_secret: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> VoiceChatResponse:
    """
    Receive Hebrew audio → STT → chat engine → return JSON.

    Also fires vocab tracking (fire-and-forget) and pronunciation
    assessment (parallel) without blocking the response path.
    """
    verify_jwt_token(
        authorization=authorization,
        x_internal_service_secret=x_internal_service_secret,
        x_user_id=userId,
    )


    wall_start = time.perf_counter()

    # ── 1. Read uploaded audio ──────────────────────────────────────────────
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # ── 2. STT — Hebrew transcription (with circuit breaker) ───────────────
    transcribed_text: str | None = None
    try:
        transcribed_text = await run_in_threadpool(
            transcribe_audio, audio_bytes, audio.filename or "audio.webm"
        )
    except STTCircuitOpenError as exc:
        logger.warning({"event": "stt_circuit_open", "detail": str(exc)})
        return VoiceChatResponse(
            answerHe="",
            fallbackUsed=True,
            fallbackReason="STT_CIRCUIT_OPEN",
            latencyMs=_elapsed_ms(wall_start),
        )
    except STTTimeoutError as exc:
        logger.warning({"event": "stt_timeout", "detail": str(exc)})
        return VoiceChatResponse(
            answerHe="",
            fallbackUsed=True,
            fallbackReason="STT_TIMEOUT",
            latencyMs=_elapsed_ms(wall_start),
        )
    except STTAuthError as exc:
        logger.error({"event": "stt_auth_error", "detail": str(exc)})
        return VoiceChatResponse(
            answerHe="",
            fallbackUsed=True,
            fallbackReason="STT_FAILED",
            latencyMs=_elapsed_ms(wall_start),
        )
    except STTError as exc:
        logger.error({"event": "stt_error", "detail": str(exc)})
        return VoiceChatResponse(
            answerHe="",
            fallbackUsed=True,
            fallbackReason="STT_FAILED",
            latencyMs=_elapsed_ms(wall_start),
        )

    if not transcribed_text:
        logger.info({"event": "stt_empty_transcript"})
        return VoiceChatResponse(
            answerHe="",
            fallbackUsed=True,
            fallbackReason="STT_EMPTY",
            transcribedText="",
            latencyMs=_elapsed_ms(wall_start),
        )

    # ── 3. Chat engine + Pronunciation Assessment (parallel) ──────────────
    chat_request = ChatRequest(
        message=transcribed_text,
        level=level,
        includeArabic=includeArabic,
        voiceMode=True,
    )

    async def _run_pronunciation() -> int | None:
        """Run pronunciation assessment; return 0-100 or None on error."""
        try:
            result = await asyncio.wait_for(
                run_in_threadpool(
                    assess_pronunciation,
                    audio_bytes,
                    transcribed_text,
                    level,
                ),
                timeout=_PRON_TIMEOUT_SECONDS,
            )
            if result.get("success"):
                return int(round(result["scores"]["pronunciation"]))
        except Exception:
            pass
        return None

    chat_response, pronunciation_score = await asyncio.gather(
        run_in_threadpool(generate_chat_response, chat_request),
        _run_pronunciation(),
    )

    # ── 4. Vocab tracking — fire-and-forget, never blocks ─────────────────
    if not chat_response.fallbackUsed:
        track_vocab_async(
            transcribed_text=transcribed_text,
            user_id=userId,
            level=level,
        )

    # ── 5. Build response ──────────────────────────────────────────────────
    logger.info({
        "event": "voice_response",
        "stt_chars": len(transcribed_text),
        "chat_fallback": chat_response.fallbackReason,
        "pronunciation_score": pronunciation_score,
        "latency_ms": _elapsed_ms(wall_start),
    })

    ssml = build_ssml(
        text=chat_response.answerHe,
        is_fallback=chat_response.fallbackUsed,
        pronunciation_score=pronunciation_score,
    )

    return VoiceChatResponse(
        answerHe=chat_response.answerHe,
        answerAr=chat_response.answerAr,
        audioBase64=None,
        fallbackUsed=chat_response.fallbackUsed,
        fallbackReason=chat_response.fallbackReason,
        level=chat_response.level,
        model=chat_response.model,
        provider=chat_response.provider,
        latencyMs=_elapsed_ms(wall_start),
        transcribedText=transcribed_text,
        pronunciationScore=pronunciation_score,
        ssmlText=ssml or None,
        suggestedNextPrompts=chat_response.suggestedNextPrompts,
        inputTokens=chat_response.inputTokens,
        outputTokens=chat_response.outputTokens,
    )


# ── Health endpoint for voice services ───────────────────────────────────────

@router.get("/chat/voice/health")
async def voice_health(
    x_internal_service_secret: str | None = Header(default=None),
) -> dict[str, str]:
    """Returns the current state of STT and TTS circuit breakers."""
    require_internal_service_secret(x_internal_service_secret)
    from services.voice_circuits import stt_circuit, tts_circuit
    return {
        "stt_circuit": stt_circuit.state.value,
        "tts_circuit": tts_circuit.state.value,
    }


# ── Manual circuit-breaker reset (admin recovery) ────────────────────────────

@router.post("/admin/circuits/reset")
async def reset_circuits(
    x_internal_service_secret: str | None = Header(default=None),
) -> dict[str, object]:
    """
    Reset all circuit breakers (LLM provider, STT, TTS).

    Use when a provider has recovered but the circuit is still in OPEN
    state and you don't want to wait for the recovery timer.
    """
    require_internal_service_secret(x_internal_service_secret)
    reset_list: list[str] = []

    try:
        from services.chat_provider import (
            clear_provider_runtime_state,
            _PROVIDER_CIRCUITS,
        )
        clear_provider_runtime_state()
        reset_list.extend(_PROVIDER_CIRCUITS.keys())
    except Exception as exc:
        logger.warning({"event": "circuit_reset_llm_failed", "detail": str(exc)})

    try:
        from services.voice_circuits import stt_circuit, tts_circuit
        stt_circuit.reset()
        tts_circuit.reset()
        reset_list.extend(["stt", "tts"])
    except Exception as exc:
        logger.warning({"event": "circuit_reset_voice_failed", "detail": str(exc)})

    return {"success": True, "reset": reset_list}


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)
