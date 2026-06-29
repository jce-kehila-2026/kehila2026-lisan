"""
STT engine selector with fallback.

The PRIMARY engine is Azure Speech (cloud, fast, low memory — needs
AZURE_SPEECH_KEY / AZURE_SPEECH_REGION). If the primary FAILS, transcription
falls back to the secondary engine (local faster-whisper).

  primary  = STT_ENGINE           ('azure' | 'whisper', default: azure)
  fallback = STT_FALLBACK_ENGINE  ('whisper' | 'azure' | '', default: whisper)
             Set STT_FALLBACK_ENGINE='' to disable fallback entirely.

Each engine has its OWN circuit breaker (stt_circuit for the primary,
whisper_circuit for whisper — see services.voice_circuits), so a failure storm
in one engine does not block the other.

Both backends expose an identical ``transcribe_audio(audio_bytes, filename)``
and raise the same STT* exception hierarchy from services.speech_to_text, so
routes/chat.py is unchanged regardless of which engine actually answers.

Engines/fallback are resolved per-call (not at import) so they can be flipped
via env without restarting.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger("lisan.stt")

_ENGINES = ("azure", "whisper")


def _normalize(name: str) -> str:
    candidate = (name or "").strip().lower()
    return candidate if candidate in _ENGINES else ""


def get_active_engine() -> str:
    """Return the normalized PRIMARY STT engine ('azure' by default)."""
    return _normalize(os.getenv("STT_ENGINE", "azure")) or "azure"


def get_fallback_engine() -> str:
    """Return the normalized FALLBACK engine ('whisper' by default).

    Returns '' when no (valid) fallback is configured.
    """
    return _normalize(os.getenv("STT_FALLBACK_ENGINE", "whisper"))


def _transcribe_with(engine: str, audio_bytes: bytes, filename: str) -> str:
    if engine == "azure":
        from services.speech_to_text import transcribe_audio as _azure_transcribe
        return _azure_transcribe(audio_bytes, filename)

    from services.whisper_stt import transcribe_audio as _whisper_transcribe
    return _whisper_transcribe(audio_bytes, filename)


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe Hebrew audio with the primary engine, falling back to the
    secondary engine on failure.

    Raises an STTError subclass if every configured engine fails (same contract
    as both backends).
    """
    # Shared exception hierarchy used by both engines.
    from services.speech_to_text import STTError

    primary = get_active_engine()
    fallback = get_fallback_engine()

    try:
        return _transcribe_with(primary, audio_bytes, filename)
    except STTError as primary_error:
        if not fallback or fallback == primary:
            raise

        logger.warning({
            "event": "stt_primary_failed_falling_back",
            "primary": primary,
            "fallback": fallback,
            "error": str(primary_error),
        })

        try:
            return _transcribe_with(fallback, audio_bytes, filename)
        except STTError as fallback_error:
            logger.error({
                "event": "stt_all_engines_failed",
                "primary": primary,
                "fallback": fallback,
                "primary_error": str(primary_error),
                "fallback_error": str(fallback_error),
            })
            # Surface the fallback failure, but keep the primary cause chained.
            raise fallback_error from primary_error


__all__ = ["transcribe_audio", "get_active_engine", "get_fallback_engine"]
