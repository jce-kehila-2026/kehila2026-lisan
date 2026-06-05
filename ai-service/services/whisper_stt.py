"""
Speech-to-Text via faster-whisper (local, free, no per-minute quota).

Replaces the Azure Speech STT engine. Hebrew transcription runs entirely
on the local machine — zero cost, no 5-hour/month cap.

Reliability (mirrors the old Azure path so routes/chat.py is unchanged):
  - Reuses the STT* exception hierarchy from services.speech_to_text.
  - Reuses stt_circuit (CircuitBreaker) from services.voice_circuits.
  - Hard timeout: STT_TIMEOUT_SECONDS (default 30 s — Whisper is slower
    than a cloud API, so the budget is wider than Azure's 15 s).

Config (env):
  WHISPER_MODEL          base | small | medium | large-v3   (default: small)
  WHISPER_DEVICE         cpu | cuda                          (default: cpu)
  WHISPER_COMPUTE_TYPE   int8 | int8_float16 | float16 ...   (default: int8)
  WHISPER_BEAM_SIZE      decoding beam size                  (default: 5)
  STT_TIMEOUT_SECONDS    hard timeout per clip               (default: 30)

The faster-whisper package and ctranslate2 are imported lazily so the
service still boots (and other endpoints work) even if they aren't
installed — the first voice request then fails cleanly with STT_FAILED
instead of crashing the whole process at import time.
"""
from __future__ import annotations

import logging
import os
import queue
import tempfile
import threading
import time

# Reuse the exact exception hierarchy the voice route already handles.
from services.speech_to_text import (
    STTAuthError,
    STTCircuitOpenError,
    STTError,
    STTTimeoutError,
)

logger = logging.getLogger("lisan.whisper")

# Lazily-loaded singleton model (loading is expensive; do it once).
_MODEL = None
_MODEL_LOCK = threading.Lock()


def _get_model():
    """Load the WhisperModel once and cache it. Thread-safe."""
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    with _MODEL_LOCK:
        if _MODEL is not None:
            return _MODEL
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise STTError(
                "faster-whisper is not installed. Run "
                "pip install -r requirements.txt"
            ) from exc

        model_size = os.getenv("WHISPER_MODEL", "small").strip() or "small"
        device = os.getenv("WHISPER_DEVICE", "cpu").strip() or "cpu"
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8").strip() or "int8"

        logger.info({
            "event": "whisper_model_loading",
            "model": model_size,
            "device": device,
            "compute_type": compute_type,
        })
        t0 = time.perf_counter()
        _MODEL = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info({
            "event": "whisper_model_loaded",
            "load_ms": int((time.perf_counter() - t0) * 1000),
        })
        return _MODEL


def _transcribe_sync(audio_path: str) -> str:
    """Blocking transcription — runs inside a worker thread."""
    model = _get_model()
    beam_size = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
    segments, _info = model.transcribe(
        audio_path,
        language="he",        # Hebrew — don't waste time auto-detecting
        beam_size=beam_size,
        vad_filter=True,      # drop silence/noise → faster + cleaner text
    )
    # segments is a generator; iterating it does the real work.
    return "".join(segment.text for segment in segments).strip()


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe Hebrew audio bytes using faster-whisper.

    Drop-in replacement for the old Azure transcribe_audio():
    same signature, same return type, same exception hierarchy.

    Raises an STTError subclass on failure — never a naked exception.
    """
    from services.voice_circuits import stt_circuit

    # ── Circuit open? Skip the expensive call entirely ────────────────────
    if not stt_circuit.allow_request():
        logger.warning({"event": "stt_circuit_open", "state": str(stt_circuit.state)})
        raise STTCircuitOpenError("STT circuit is open — too many recent failures")

    timeout = float(os.getenv("STT_TIMEOUT_SECONDS", "30"))

    # faster-whisper decodes via PyAV/ffmpeg, so it needs a real file path.
    suffix = _get_suffix(filename)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    t0 = time.perf_counter()
    result_queue: queue.Queue = queue.Queue(maxsize=1)

    def _runner() -> None:
        try:
            result_queue.put(("ok", _transcribe_sync(tmp_path)))
        except Exception as exc:  # mirrored to caller
            result_queue.put(("err", exc))

    worker = threading.Thread(target=_runner, daemon=True)
    worker.start()

    try:
        try:
            kind, payload = result_queue.get(timeout=timeout)
        except queue.Empty:
            stt_circuit.record_failure()
            raise STTTimeoutError(
                f"Whisper did not finish within {timeout} s"
            )

        if kind == "err":
            stt_circuit.record_failure()
            exc = payload
            if isinstance(exc, STTError):
                raise exc
            raise STTError(f"Whisper STT error: {exc}") from exc

        transcript = payload
        latency_ms = int((time.perf_counter() - t0) * 1000)
        stt_circuit.record_success()
        logger.info({
            "event": "stt_success",
            "engine": "whisper",
            "latency_ms": latency_ms,
            "chars": len(transcript),
        })
        return transcript
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _get_suffix(filename: str) -> str:
    """Return file extension with leading dot for tempfile."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "webm"
    return f".{ext}"


__all__ = [
    "transcribe_audio",
    "STTError",
    "STTTimeoutError",
    "STTCircuitOpenError",
    "STTAuthError",
]
