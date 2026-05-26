from __future__ import annotations

import logging
import os
import time

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from services.chat_cache import get_cache_stats
from services.chat_cache import get_rate_limit_status
from services.chat_engine import generate_chat_response
from services.chat_provider import get_provider_logs
from services.chat_schemas import ChatRequest, ChatResponse, VoiceChatResponse
from services.speech_to_text import (
    STTAuthError,
    STTCircuitOpenError,
    STTError,
    STTTimeoutError,
    transcribe_audio,
)

logger = logging.getLogger("lisan.chat")
router = APIRouter()


def require_internal_service_secret(
    x_internal_service_secret: str | None = Header(default=None),
) -> None:
    expected_secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()

    if not expected_secret:
        return

    if not x_internal_service_secret:
        raise HTTPException(status_code=401, detail="Missing internal service secret")

    if x_internal_service_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid internal service secret")


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    x_internal_service_secret: str | None = Header(default=None),
) -> ChatResponse:
    require_internal_service_secret(x_internal_service_secret)
    return await run_in_threadpool(generate_chat_response, payload)


@router.get("/cache/stats")
async def cache_stats(
    x_internal_service_secret: str | None = Header(default=None),
) -> dict[str, int]:
    require_internal_service_secret(x_internal_service_secret)
    return await run_in_threadpool(get_cache_stats)


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
# Voice endpoint — Tasks 1 & 4 of CLAUDE_BACKEND_AI_PLAN.md
#
# Fallback codes returned to Frontend:
#   STT_CIRCUIT_OPEN  — STT circuit tripped, too many recent failures
#   STT_TIMEOUT       — Whisper did not respond within STT_TIMEOUT_SECONDS
#   STT_FAILED        — Whisper returned an error (auth, 4xx, network)
#   STT_EMPTY         — Whisper succeeded but returned empty transcript
#   TTS_CIRCUIT_OPEN  — TTS circuit tripped (text-only graceful degradation)
#   TTS_TIMEOUT       — TTS did not respond in time (text-only)
#   TTS_FAILED        — TTS returned an error (text-only)
# ---------------------------------------------------------------------------

@router.post("/chat/voice", response_model=VoiceChatResponse)
async def chat_voice(
    audio: UploadFile = File(..., description="Audio file (webm/ogg/mp3/wav/m4a)"),
    level: str = Form(default="A1"),
    includeArabic: bool = Form(default=False),
    x_internal_service_secret: str | None = Header(default=None),
) -> VoiceChatResponse:
    """
    Receive Hebrew audio → STT → chat engine → TTS → return JSON.

    Reliability (Task 4):
      - STT failure → fallbackUsed=True, answerHe="" with specific fallbackReason code.
      - TTS failure → fallbackUsed stays from chat engine, audioBase64=null (text-only).
      - Circuit breakers prevent hammering a broken service.
    """
    require_internal_service_secret(x_internal_service_secret)

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

    # ── 3. Chat engine (RAG + Guardrails) ──────────────────────────────────
    chat_request = ChatRequest(
        message=transcribed_text,
        level=level,
        includeArabic=includeArabic,
    )
    chat_response: ChatResponse = await run_in_threadpool(
        generate_chat_response, chat_request
    )

    # ── 4. Build response ───────────────────────────────────────────────────
    # TTS is handled by the browser (window.speechSynthesis) — audioBase64
    # is always null. The frontend reads answerHe aloud via Web Speech API.
    logger.info({
        "event": "voice_response",
        "stt_chars": len(transcribed_text),
        "chat_fallback": chat_response.fallbackReason,
        "latency_ms": _elapsed_ms(wall_start),
    })

    return VoiceChatResponse(
        answerHe=chat_response.answerHe,
        answerAr=chat_response.answerAr,
        audioBase64=None,                            # browser handles TTS
        fallbackUsed=chat_response.fallbackUsed,
        fallbackReason=chat_response.fallbackReason,
        level=chat_response.level,
        model=chat_response.model,
        provider=chat_response.provider,
        latencyMs=_elapsed_ms(wall_start),
        transcribedText=transcribed_text,
        suggestedNextPrompts=chat_response.suggestedNextPrompts,
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


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)
