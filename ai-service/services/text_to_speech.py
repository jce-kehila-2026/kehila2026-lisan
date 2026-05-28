"""
Text-to-Speech service.

TTS is handled by the browser (window.speechSynthesis) to keep server
costs at zero.  synthesize_speech() always raises TTSError so the voice
endpoint returns audioBase64: null and the frontend reads answerHe aloud.

build_ssml() is provided so the frontend (or a future server TTS) can
use SSML markup for a friendlier teacher voice without changing the
plain-text answerHe contract.
"""
from __future__ import annotations

import html
import logging
import re

logger = logging.getLogger("lisan.tts")


# ── Exception hierarchy ───────────────────────────────────────────────────────

class TTSError(Exception):
    """TTS is disabled — caller returns audioBase64: null."""
    fallback_code: str = "TTS_DISABLED"


class TTSTimeoutError(TTSError):
    fallback_code = "TTS_DISABLED"


class TTSAuthError(TTSError):
    fallback_code = "TTS_DISABLED"


class TTSCircuitOpenError(TTSError):
    fallback_code = "TTS_DISABLED"


# ── SSML builder ─────────────────────────────────────────────────────────────

# Slow, clear rate for beginner Hebrew learners
_VOICE_RATE = "slow"
_VOICE_PITCH = "medium"

# Encouraging teacher pitch for correct/positive responses
_POSITIVE_KEYWORDS = frozenset([
    "כן",       # yes
    "נכון",     # correct
    "מצוין",    # excellent
    "יפה",      # nice / beautiful
    "טוב",      # good
    "ממש טוב",  # really good
    "בסדר",     # okay
    "תודה",     # thank you
    "בבקשה",    # please / you're welcome
    "שלום",     # hello / goodbye
])

_SENTENCE_END_RE = re.compile(r"([.?!])\s*$")


def build_ssml(
    text: str,
    is_fallback: bool = False,
    pronunciation_score: int | None = None,
) -> str:
    """
    Wrap Hebrew TTS text in SSML for a warm, encouraging teacher voice.

    Rules applied:
    - Rate: slow (A1 learners need time to process)
    - Pitch: medium normally; high on encouraging responses
    - Pause: 300 ms before sentence end marker
    - Fallback answers use softer pitch and slower rate
    - High pronunciation score (>=80) → extra encouraging pitch

    Compatible with Azure Cognitive Services Speech SDK SSML format
    (he-IL locale, neural voice).

    Returns an empty string when text is empty or None.
    """
    clean = (text or "").strip()
    if not clean:
        return ""

    escaped = html.escape(clean)

    # Choose pitch based on context
    if is_fallback:
        pitch = "x-low"
        rate = "x-slow"
    elif pronunciation_score is not None and pronunciation_score >= 80:
        pitch = "high"
        rate = _VOICE_RATE
    elif _is_encouraging(clean):
        pitch = "high"
        rate = _VOICE_RATE
    else:
        pitch = _VOICE_PITCH
        rate = _VOICE_RATE

    # Add a short pause before terminal punctuation so the sentence
    # doesn't end abruptly when spoken aloud
    if _SENTENCE_END_RE.search(escaped):
        terminal = escaped[-1]
        body = escaped[:-1].rstrip()
        spoken = (
            f'{body}'
            f'<break time="250ms"/>'
            f'{terminal}'
        )
    else:
        spoken = escaped

    ssml = (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        'xml:lang="he-IL">'
        f'<prosody rate="{rate}" pitch="{pitch}">'
        f'{spoken}'
        '</prosody>'
        '</speak>'
    )
    return ssml


def _is_encouraging(text: str) -> bool:
    """Return True if the answer contains an encouraging keyword."""
    words = {w.strip(".,!?;:") for w in text.split()}
    return bool(words & _POSITIVE_KEYWORDS)


# ── Public API ────────────────────────────────────────────────────────────────

def synthesize_speech(text: str, voice: str = "shimmer") -> bytes:
    """
    Server-side TTS is disabled — browser handles speech via speechSynthesis.
    Always raises TTSError so the voice endpoint returns audioBase64: null.
    """
    raise TTSError("Server TTS disabled — browser handles speech synthesis")
