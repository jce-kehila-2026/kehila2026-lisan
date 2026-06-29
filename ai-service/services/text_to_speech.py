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
from functools import lru_cache
import logging
import os
from pathlib import Path
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
_LEADING_PREROLL_MS = 300
_TTS_NIQQUD_ENGINE_ENV = "TTS_NIQQUD_ENGINE"
_DICTA_ONNX_MODEL_PATH_ENV = "DICTA_ONNX_MODEL_PATH"
_TTS_NIQQUD_CACHE_SIZE = 512
_DICTA_ONNX_ENGINE_NAMES = frozenset({"dicta", "dicta-onnx", "dicta_onnx"})

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

# Azure Hebrew TTS often defaults to masculine readings for unpointed forms.
# Lisan addresses female learners, so this layer gives Azure a TTS-only
# feminine vocalization. The visible chatbot text remains unpointed.
_FEMININE_DIRECT_FORMS = {
    # Second-person feminine pronouns and prepositional suffixes.
    "את": "אַתְּ",
    "ואת": "וְאַתְּ",
    "שאת": "שֶׁאַתְּ",
    "כשאת": "כְּשֶׁאַתְּ",
    "אותך": "אוֹתָךְ",
    "איתך": "אִתָּךְ",
    "לך": "לָךְ",
    "אליך": "אֵלַיִךְ",
    "אלייך": "אֵלַיִךְ",
    "עליך": "עָלַיִךְ",
    "עלייך": "עָלַיִךְ",
    "שלך": "שֶׁלָּךְ",
    "בך": "בָּךְ",
    "ממך": "מִמֵּךְ",
    "אצלך": "אֶצְלֵךְ",
    "בשבילך": "בִּשְׁבִילֵךְ",
    "בלעדיך": "בִּלְעָדַיִךְ",
    "בלעדייך": "בִּלְעָדַיִךְ",
    "לפניך": "לְפָנַיִךְ",
    "לפנייך": "לְפָנַיִךְ",
    "אחריך": "אַחֲרַיִךְ",
    "אחרייך": "אַחֲרַיִךְ",
    "עצמך": "עַצְמֵךְ",
    "שלומך": "שְׁלוֹמֵךְ",

    # Imperative and future forms that are already feminine in writing, but
    # still benefit from explicit niqqud for stable Azure pronunciation.
    "בואי": "בּוֹאִי",
    "נסי": "נַסִּי",
    "כתבי": "כִּתְבִי",
    "אמרי": "אִמְרִי",
    "קראי": "קִרְאִי",
    "שאלי": "שַׁאֲלִי",
    "עני": "עֲנִי",
    "עשי": "עֲשִׂי",
    "ראי": "רְאִי",
    "קני": "קְנִי",
    "שתי": "שְׁתִי",
    "לכי": "לְכִי",
    "תוכלי": "תּוּכְלִי",
    "תרצי": "תִּרְצִי",
    "תעשי": "תַּעֲשִׂי",
    "תראי": "תִּרְאִי",
    "תקני": "תִּקְנִי",
    "תשתי": "תִּשְׁתִּי",
    "תלכי": "תֵּלְכִי",
    "תבואי": "תָּבוֹאִי",
    "תלמדי": "תִּלְמְדִי",
    "תדברי": "תְּדַבְּרִי",
    "תשאלי": "תִּשְׁאֲלִי",
    "תעני": "תַּעֲנִי",
    "תנסי": "תְּנַסִּי",
    "תחכי": "תְּחַכִּי",
    "תקווי": "תְּקַוִּי",
}

_FEMININE_CONTEXTUAL_FORMS = {
    # Same spelling, different masculine/feminine present-tense reading.
    "רוצה": "רוֹצָה",
    "רואה": "רוֹאָה",
    "עושה": "עוֹשָׂה",
    "קונה": "קוֹנָה",
    "שותה": "שׁוֹתָה",
    "בונה": "בּוֹנָה",
    "פונה": "פּוֹנָה",
    "עונה": "עוֹנָה",
    "עולה": "עוֹלָה",
    "מנסה": "מְנַסָּה",
    "מחכה": "מְחַכָּה",
    "מקווה": "מְקַוָּה",
    "מראה": "מַרְאָה",

    # Same spelling, different masculine/feminine adjective or role reading.
    "יפה": "יָפָה",
    "קשה": "קָשָׁה",
    "חולה": "חוֹלָה",
    "שונה": "שׁוֹנָה",
    "דומה": "דּוֹמָה",
    "מרוצה": "מְרוּצָה",
    "מורה": "מוֹרָה",
    "המורה": "הַמּוֹרָה",

    # Common second-person feminine past forms; unpointed Azure may read the
    # final ת as masculine. These are TTS-only and preserve visible text.
    "אמרת": "אָמַרְתְּ",
    "כתבת": "כָּתַבְתְּ",
    "למדת": "לָמַדְתְּ",
    "עבדת": "עָבַדְתְּ",
    "שאלת": "שָׁאַלְתְּ",
    "חשבת": "חָשַׁבְתְּ",
    "אהבת": "אָהַבְתְּ",
    "זכרת": "זָכַרְתְּ",
    "סגרת": "סָגַרְתְּ",
    "פתחת": "פָּתַחְתְּ",
    "לקחת": "לָקַחְתְּ",
    "שלחת": "שָׁלַחְתְּ",
    "שמעת": "שָׁמַעְתְּ",
    "נסעת": "נָסַעְתְּ",
    "ידעת": "יָדַעְתְּ",
    "גרת": "גַּרְתְּ",
    "אכלת": "אָכַלְתְּ",
    "דיברת": "דִּבַּרְתְּ",
    "שילמת": "שִׁלַּמְתְּ",
    "ביקשת": "בִּקַּשְׁתְּ",
    "קיבלת": "קִבַּלְתְּ",
    "הרגשת": "הִרְגַּשְׁתְּ",
    "הבנת": "הֵבַנְתְּ",
    "הכנת": "הֵכַנְתְּ",
    "הזמנת": "הִזְמַנְתְּ",
    "התקשרת": "הִתְקַשַּׁרְתְּ",
    "התחלת": "הִתְחַלְתְּ",
    "סיימת": "סִיַּמְתְּ",
    "חזרת": "חָזַרְתְּ",
    "נשארת": "נִשְׁאַרְתְּ",
    "עשית": "עָשִׂית",
    "ראית": "רָאִית",
    "רצית": "רָצִית",
    "שתית": "שָׁתִית",
    "קנית": "קָנִית",
    "חיכית": "חִכִּית",
    "ניסית": "נִסִּית",
    "בנית": "בָּנִית",
    "פנית": "פָּנִית",
    "ענית": "עָנִית",
    "עלית": "עָלִית",
    "באת": "בָּאת",
}

_MASCULINE_CONTEXT_TOKENS = {
    "הוא",
    "אתה",
    "אבא",
    "אח",
    "אחיך",
    "הילד",
    "ילד",
    "איש",
    "האיש",
    "סבא",
}

_CONTEXTUAL_PREFIX_NIQQUD = {
    "ו": "וְ",
    "ש": "שֶׁ",
    "כש": "כְּשֶׁ",
}

_NIQQUD_RE = re.compile(r"[\u0591-\u05C7]")
_HEBREW_WORD_RE = re.compile(r"[\u0590-\u05FF]+")


def _prepare_hebrew_for_feminine_tts(text: str) -> str:
    """Add TTS-only niqqud for feminine Hebrew address before synthesis."""
    engine = os.getenv(_TTS_NIQQUD_ENGINE_ENV, "lexicon").strip().lower()
    model_path = os.getenv(_DICTA_ONNX_MODEL_PATH_ENV, "").strip()
    return _prepare_hebrew_for_feminine_tts_cached(text, engine, model_path)


@lru_cache(maxsize=_TTS_NIQQUD_CACHE_SIZE)
def _prepare_hebrew_for_feminine_tts_cached(
    text: str,
    engine: str,
    model_path: str,
) -> str:
    if engine == "off":
        return text

    prepared = text
    if engine in _DICTA_ONNX_ENGINE_NAMES:
        prepared = _dicta_onnx_diacritize(text, model_path)

    # This always runs after Dicta. If Dicta picks a masculine reading for a
    # shared spelling, Lisan's TTS layer still forces the learner-facing
    # feminine form before Azure sees the SSML.
    return _force_feminine_tts_forms(prepared)


def _dicta_onnx_diacritize(text: str, model_path: str) -> str:
    if not model_path:
        logger.warning({
            "event": "dicta_onnx_model_path_missing",
            "env": _DICTA_ONNX_MODEL_PATH_ENV,
        })
        return text

    if len(text) > 2048:
        logger.warning({
            "event": "dicta_onnx_text_too_long",
            "text_length": len(text),
        })
        return text

    resolved_model_path = Path(model_path).expanduser()
    if not resolved_model_path.is_file():
        logger.warning({
            "event": "dicta_onnx_model_missing",
            "model_path": str(resolved_model_path),
        })
        return text

    try:
        dicta = _get_dicta_onnx_model(str(resolved_model_path))
        pointed = dicta.add_diacritics(text)
    except Exception as exc:
        logger.warning({
            "event": "dicta_onnx_failed",
            "error": str(exc),
        })
        return text

    return pointed or text


@lru_cache(maxsize=2)
def _get_dicta_onnx_model(model_path: str):
    from dicta_onnx import Dicta

    return Dicta(model_path)


def _force_feminine_tts_forms(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        raw = _strip_niqqud(token)

        direct = _FEMININE_DIRECT_FORMS.get(raw)
        if direct:
            return direct

        contextual = _contextual_feminine_replacement(
            raw,
            _previous_hebrew_token(text, match.start()),
        )
        return contextual or token

    return _HEBREW_WORD_RE.sub(replace, text)


def _contextual_feminine_replacement(raw: str, previous: str) -> str | None:
    if previous in _MASCULINE_CONTEXT_TOKENS:
        return None

    pointed = _FEMININE_CONTEXTUAL_FORMS.get(raw)
    if pointed:
        return pointed

    for prefix, pointed_prefix in _CONTEXTUAL_PREFIX_NIQQUD.items():
        if raw.startswith(prefix):
            base = raw[len(prefix):]
            pointed = _FEMININE_CONTEXTUAL_FORMS.get(base)
            if pointed:
                return f"{pointed_prefix}{pointed}"

    return None


def _previous_hebrew_token(text: str, end: int) -> str:
    previous = ""
    for match in _HEBREW_WORD_RE.finditer(text[:end]):
        previous = match.group(0)
    return _strip_niqqud(previous)


def _strip_niqqud(text: str) -> str:
    return _NIQQUD_RE.sub("", text)


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
    - Pause: 250 ms before speech starts, so playback hardware is audible
    - Pause: 250 ms before sentence end marker
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

    # Azure neural voices TRIM a plain leading <break>, so the first word got
    # clipped by the player's audio-output startup latency. mstts:silence with
    # type="Leading-exact" is the dedicated, un-trimmed leading silence — but it
    # must live INSIDE <voice>. Only when no explicit voice is set (mstts then
    # unavailable) do we fall back to a best-effort <break>.
    leading = (
        '<mstts:silence type="Leading-exact" '
        f'value="{_LEADING_PREROLL_MS}ms"/>'
    )
    if voice:
        voice_attr = html.escape(voice, quote=True)
        body = f'<voice name="{voice_attr}">{leading}{prosody}</voice>'
    else:
        body = f'<break time="{_LEADING_PREROLL_MS}ms"/>{prosody}'

    ssml = (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="http://www.w3.org/2001/mstts" '
        'xml:lang="he-IL">'
        f'{body}'
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
            details = speechsdk.CancellationDetails(result)
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
