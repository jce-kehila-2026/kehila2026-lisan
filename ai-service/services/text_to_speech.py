"""
Text-to-Speech service.

synthesize_speech() uses Azure Speech (he-IL neural voice) to render the
Hebrew answer to MP3 audio, returned to the client as audioBase64. On any
failure it raises a TTSError subclass so the voice endpoint falls back
to audioBase64: null and the browser reads answerHe aloud.

build_ssml() wraps the text in Azure-compatible SSML for a warm,
encouraging teacher voice (slow rate for A1 learners). Configure the
voice via the AZURE_TTS_VOICE env var (default: he-IL-HilaNeural).
"""
from __future__ import annotations

import html
import logging
import os
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

# Azure Hebrew TTS can guess masculine readings for unpointed second-person
# forms. Lisan addresses female learners, so point the ambiguous forms in SSML
# only; the visible chatbot text remains unchanged.
_FEMININE_TTS_FORMS = (
    ("אותך", "אוֹתָךְ"),
    ("איתך", "אִתָּךְ"),
    ("לך", "לָךְ"),
    ("שלך", "שֶׁלָּךְ"),
    ("בך", "בָּךְ"),
    ("ממך", "מִמֵּךְ"),
    ("אצלך", "אֶצְלֵךְ"),
    ("בשבילך", "בִּשְׁבִילֵךְ"),
    ("שלומך", "שְׁלוֹמֵךְ"),
)


def _prepare_hebrew_for_feminine_tts(text: str) -> str:
    """Add niqqud for ambiguous feminine address before Azure synthesis."""
    prepared = text
    for raw, pointed in _FEMININE_TTS_FORMS:
        prepared = re.sub(
            rf"(?<![\u0590-\u05FF]){re.escape(raw)}(?![\u0590-\u05FF])",
            pointed,
            prepared,
        )
    return prepared


def build_ssml(
    text: str,
    is_fallback: bool = False,
    pronunciation_score: int | None = None,
    voice: str | None = None,
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

    spoken_text = _prepare_hebrew_for_feminine_tts(clean)
    escaped = html.escape(spoken_text)

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

    prosody = (
        f'<prosody rate="{rate}" pitch="{pitch}">'
        f'{spoken}'
        '</prosody>'
    )

    # When a voice is supplied, wrap the prosody so speak_ssml_async picks
    # the exact he-IL neural voice (otherwise Azure falls back to a default).
    if voice:
        voice_attr = html.escape(voice, quote=True)
        prosody = f'<voice name="{voice_attr}">{prosody}</voice>'

    ssml = (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        'xml:lang="he-IL">'
        f'{prosody}'
        '</speak>'
    )
    return ssml


def _is_encouraging(text: str) -> bool:
    """Return True if the answer contains an encouraging keyword."""
    words = {w.strip(".,!?;:") for w in text.split()}
    return bool(words & _POSITIVE_KEYWORDS)


# ── Public API ────────────────────────────────────────────────────────────────

def synthesize_speech(
    text: str,
    *,
    is_fallback: bool = False,
    pronunciation_score: int | None = None,
    voice: str | None = None,
) -> bytes:
    """
    Synthesize Hebrew speech with Azure Speech (he-IL neural voice).

    Returns MP3 audio bytes. Raises a TTSError subclass on any failure so
    the voice endpoint can fall back to audioBase64: null (browser TTS).

    Reliability mirrors the STT path:
      - tts_circuit breaker: skip Azure entirely after repeated failures.
      - Caller wraps this in run_in_threadpool + a timeout.
    """
    clean = (text or "").strip()
    if not clean:
        raise TTSError("Empty TTS text")

    from services.voice_circuits import tts_circuit

    if not tts_circuit.allow_request():
        logger.warning({"event": "tts_circuit_open"})
        raise TTSCircuitOpenError("TTS circuit is open — too many failures")

    speech_key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    speech_region = os.getenv("AZURE_SPEECH_REGION", "").strip()
    if not speech_key or not speech_region:
        tts_circuit.record_failure()
        raise TTSAuthError("AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not set")

    voice_name = (
        voice
        or os.getenv("AZURE_TTS_VOICE", "he-IL-HilaNeural").strip()
        or "he-IL-HilaNeural"
    )

    try:
        import azure.cognitiveservices.speech as speechsdk

        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key,
            region=speech_region,
        )
        speech_config.speech_synthesis_voice_name = voice_name
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat
            .Audio16Khz32KBitRateMonoMp3
        )

        # audio_config=None → audio returned in result.audio_data,
        # nothing is played to a server speaker.
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=None,
        )

        ssml = build_ssml(
            clean,
            is_fallback=is_fallback,
            pronunciation_score=pronunciation_score,
            voice=voice_name,
        )

        result = synthesizer.speak_ssml_async(ssml).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            audio = bytes(result.audio_data or b"")
            if not audio:
                tts_circuit.record_failure()
                raise TTSError("Azure TTS returned empty audio")
            tts_circuit.record_success()
            return audio

        if result.reason == speechsdk.ResultReason.Canceled:
            details = speechsdk.CancellationDetails.from_result(result)
            tts_circuit.record_failure()
            error_details = (details.error_details or "").lower()
            if "authentication" in error_details or "401" in error_details:
                raise TTSAuthError(
                    f"Azure TTS auth failed: {details.error_details}"
                )
            raise TTSError(f"Azure TTS canceled: {details.error_details}")

        tts_circuit.record_failure()
        raise TTSError(f"Azure TTS unexpected reason: {result.reason}")

    except TTSError:
        raise
    except Exception as exc:
        tts_circuit.record_failure()
        raise TTSError(f"Azure TTS error: {exc}") from exc
