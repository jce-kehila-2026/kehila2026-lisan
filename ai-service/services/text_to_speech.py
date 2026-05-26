"""
Text-to-Speech — disabled on the server side.

TTS is handled entirely by the browser (window.speechSynthesis) to keep
server costs at zero.  The voice endpoint returns answerHe as plain text
and the frontend reads it aloud using the Web Speech API.

The module is kept so imports in routes/chat.py don't break, but
synthesize_speech() always raises TTSError immediately — the caller
degrades gracefully to text-only (audioBase64: null) which is exactly
what we want.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("lisan.tts")


# ── Exception hierarchy (kept for import compatibility) ───────────────────────

class TTSError(Exception):
    """TTS is disabled — caller returns audioBase64: null."""
    fallback_code: str = "TTS_DISABLED"


class TTSTimeoutError(TTSError):
    fallback_code = "TTS_DISABLED"


class TTSAuthError(TTSError):
    fallback_code = "TTS_DISABLED"


class TTSCircuitOpenError(TTSError):
    fallback_code = "TTS_DISABLED"


# ── Public API ────────────────────────────────────────────────────────────────

def synthesize_speech(text: str, voice: str = "shimmer") -> bytes:
    """
    Server-side TTS is disabled — browser handles speech via speechSynthesis.
    Always raises TTSError so the voice endpoint returns audioBase64: null.
    The frontend then calls window.speechSynthesis.speak() with answerHe.
    """
    raise TTSError("Server TTS disabled — browser handles speech synthesis")
