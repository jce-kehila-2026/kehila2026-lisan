"""
STT engine selector.

Picks the transcription backend at call time from the STT_ENGINE env var:

  whisper (default)  → services.whisper_stt    (local faster-whisper; free,
                       no API key, but ~3-10 s latency on CPU)
  azure              → services.speech_to_text  (Azure Speech he-IL; cloud,
                       needs AZURE_SPEECH_KEY/REGION, but typically <2 s)

Both backends expose an identical ``transcribe_audio(audio_bytes, filename)``
and raise the same STT* exception hierarchy from services.speech_to_text, so
routes/chat.py is unchanged regardless of which engine is active.

Default is ``whisper`` so the service stays free and behaviour is unchanged
until an operator explicitly opts into a paid cloud engine. Switching is a
config change (set STT_ENGINE + the engine's keys) — no code edit or redeploy.

The engine is resolved per-call (not at import) so it can be flipped via env
without restarting in environments that reload env between requests.
"""
from __future__ import annotations

import os


def get_active_engine() -> str:
    """Return the normalized STT engine name ('whisper' | 'azure')."""
    return os.getenv("STT_ENGINE", "whisper").strip().lower() or "whisper"


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe Hebrew audio using the engine selected by STT_ENGINE.

    Raises an STTError subclass on failure (same contract as both backends).
    """
    if get_active_engine() == "azure":
        from services.speech_to_text import transcribe_audio as _azure_transcribe
        return _azure_transcribe(audio_bytes, filename)

    from services.whisper_stt import transcribe_audio as _whisper_transcribe
    return _whisper_transcribe(audio_bytes, filename)


__all__ = ["transcribe_audio", "get_active_engine"]
