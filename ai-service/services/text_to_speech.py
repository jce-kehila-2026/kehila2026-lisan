"""
Text-to-Speech service.

synthesize_speech() renders the Hebrew answer to MP3 audio, returned to the
client as audioBase64, with a pluggable provider:

  TTS_PROVIDER           azure (default) | elevenlabs
  TTS_FALLBACK_PROVIDER  default azure when elevenlabs is primary; '' = none

Each provider has its own circuit breaker (services.voice_circuits). If every
configured provider fails it raises a TTSError subclass so the voice endpoint
falls back to audioBase64: null and the browser reads answerHe aloud.

Azure: build_ssml() wraps the text in Azure-compatible SSML for a warm,
encouraging teacher voice (slow rate for A1 learners). Configure the voice
via AZURE_TTS_VOICE (default: he-IL-HilaNeural).

ElevenLabs: plain prepared text (no SSML) + voice_settings.speed for the
learner-friendly pace. See the ElevenLabs provider section below.

Both providers get the same TTS-only feminine niqqud preprocessing
(TTS_NIQQUD_ENGINE = lexicon | dicta | off). Successful audio is kept in a
small in-memory LRU cache (TTS_CACHE_MAX_ENTRIES / TTS_CACHE_MAX_BYTES).
"""
from __future__ import annotations

from collections import OrderedDict
import html
from functools import lru_cache
import logging
import os
from pathlib import Path
import re
import threading
import time

logger = logging.getLogger("lisan.tts")


# ── Exception hierarchy ───────────────────────────────────────────────────────

class TTSError(Exception):
    """TTS is disabled — caller returns audioBase64: null."""
    fallback_code: str = "TTS_DISABLED"

    def __init__(self, message: str = "", *, reason: str | None = None):
        super().__init__(message)
        self.reason = reason


class TTSTimeoutError(TTSError):
    fallback_code = "TTS_DISABLED"


class TTSAuthError(TTSError):
    fallback_code = "TTS_DISABLED"


class TTSRateLimitError(TTSError):
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



# ── Provider selection ───────────────────────────────────────────────────────
#
#   primary  = TTS_PROVIDER           ('azure' | 'elevenlabs', default: azure)
#   fallback = TTS_FALLBACK_PROVIDER  ('azure' | 'elevenlabs' | '')
#              default: 'azure' when the primary is elevenlabs, else none.
#              Set TTS_FALLBACK_PROVIDER='' to disable fallback entirely.
#
# Resolved per call (not at import) so it can be flipped via env without a
# restart — same pattern as services/stt.py. Each provider has its own
# circuit breaker (services.voice_circuits.TTS_CIRCUITS).

_TTS_PROVIDERS = ("azure", "elevenlabs")


def _normalize_provider(name: str | None) -> str:
    candidate = (name or "").strip().lower()
    return candidate if candidate in _TTS_PROVIDERS else ""


def get_tts_provider() -> str:
    """Return the normalized PRIMARY TTS provider ('azure' by default)."""
    return _normalize_provider(os.getenv("TTS_PROVIDER", "azure")) or "azure"


def get_tts_fallback_provider() -> str:
    """Return the normalized FALLBACK provider, or '' when none applies."""
    primary = get_tts_provider()
    raw = os.getenv("TTS_FALLBACK_PROVIDER")
    if raw is None:
        fallback = "azure" if primary == "elevenlabs" else ""
    else:
        fallback = _normalize_provider(raw)
    return "" if fallback == primary else fallback


def build_tts_markup(
    text: str,
    is_fallback: bool = False,
    pronunciation_score: int | None = None,
) -> str:
    """What the routes return as `ssmlText` for the active provider.

    Azure → full SSML (unchanged). ElevenLabs takes no SSML, so the
    prepared (niqqud / feminine) text actually sent to the API is returned.
    """
    clean = (text or "").strip()
    if not clean:
        return ""
    if get_tts_provider() == "elevenlabs":
        return _prepare_hebrew_for_feminine_tts(clean)
    return build_ssml(
        clean,
        is_fallback=is_fallback,
        pronunciation_score=pronunciation_score,
    )


# ── In-memory LRU audio cache ────────────────────────────────────────────────
#
# Vocab-game phrases repeat a lot and ElevenLabs bills per character, so
# successful syntheses are cached by
# (provider, voice, model, speed/prosody, prepared text).
# Per-process, bounded by TTS_CACHE_MAX_ENTRIES (default 256, 0 = off) and
# TTS_CACHE_MAX_BYTES (default 16 MB). Failures are never cached.

_DEFAULT_CACHE_MAX_ENTRIES = 256
_DEFAULT_CACHE_MAX_BYTES = 16 * 1024 * 1024

_audio_cache: "OrderedDict[tuple, bytes]" = OrderedDict()
_audio_cache_bytes = 0
_audio_cache_lock = threading.Lock()


def _cache_limits() -> tuple[int, int]:
    def _int(name: str, default: int) -> int:
        try:
            return max(0, int(os.getenv(name, str(default))))
        except ValueError:
            return default

    return (
        _int("TTS_CACHE_MAX_ENTRIES", _DEFAULT_CACHE_MAX_ENTRIES),
        _int("TTS_CACHE_MAX_BYTES", _DEFAULT_CACHE_MAX_BYTES),
    )


def _cache_get(key: tuple) -> bytes | None:
    with _audio_cache_lock:
        audio = _audio_cache.get(key)
        if audio is not None:
            _audio_cache.move_to_end(key)
        return audio


def _cache_put(key: tuple, audio: bytes) -> None:
    global _audio_cache_bytes
    max_entries, max_bytes = _cache_limits()
    if max_entries <= 0 or not audio or len(audio) > max_bytes:
        return
    with _audio_cache_lock:
        previous = _audio_cache.pop(key, None)
        if previous is not None:
            _audio_cache_bytes -= len(previous)
        _audio_cache[key] = audio
        _audio_cache_bytes += len(audio)
        while _audio_cache and (
            len(_audio_cache) > max_entries or _audio_cache_bytes > max_bytes
        ):
            _, evicted = _audio_cache.popitem(last=False)
            _audio_cache_bytes -= len(evicted)


def clear_tts_audio_cache() -> None:
    global _audio_cache_bytes
    with _audio_cache_lock:
        _audio_cache.clear()
        _audio_cache_bytes = 0


def tts_audio_cache_size() -> int:
    with _audio_cache_lock:
        return len(_audio_cache)


# ── Public API ────────────────────────────────────────────────────────────────

def synthesize_speech(
    text: str,
    *,
    is_fallback: bool = False,
    pronunciation_score: int | None = None,
    voice: str | None = None,
) -> bytes:
    """Synthesize Hebrew speech; see synthesize_speech_with_provider."""
    audio, _provider = synthesize_speech_with_provider(
        text,
        is_fallback=is_fallback,
        pronunciation_score=pronunciation_score,
        voice=voice,
    )
    return audio


def synthesize_speech_with_provider(
    text: str,
    *,
    is_fallback: bool = False,
    pronunciation_score: int | None = None,
    voice: str | None = None,
) -> tuple[bytes, str]:
    """
    Synthesize Hebrew speech with the configured TTS provider.

    Returns (MP3 audio bytes, provider that produced them). Raises a TTSError subclass when every configured
    provider fails, so the voice endpoint can fall back to audioBase64: null
    (browser TTS).

      - TTS_PROVIDER picks the primary (azure | elevenlabs; default azure).
      - On a TTSError from the primary, TTS_FALLBACK_PROVIDER is tried.
      - Each provider has its own circuit breaker.
      - `voice` is an Azure voice name override; it only applies to Azure.
      - Caller wraps this in run_in_threadpool + a timeout.
    """
    clean = (text or "").strip()
    if not clean:
        raise TTSError("Empty TTS text")

    primary = get_tts_provider()
    fallback = get_tts_fallback_provider()

    try:
        return (
            _synthesize_with(
                primary,
                clean,
                is_fallback=is_fallback,
                pronunciation_score=pronunciation_score,
                voice=voice,
            ),
            primary,
        )
    except TTSError as primary_error:
        if not fallback:
            raise
        logger.warning({
            "event": "tts_primary_failed_falling_back",
            "primary": primary,
            "fallback": fallback,
            "error": str(primary_error),
        })
        try:
            return (
                _synthesize_with(
                    fallback,
                    clean,
                    is_fallback=is_fallback,
                    pronunciation_score=pronunciation_score,
                    voice=voice,
                ),
                fallback,
            )
        except TTSError as fallback_error:
            logger.error({
                "event": "tts_all_providers_failed",
                "primary": primary,
                "fallback": fallback,
                "primary_error": str(primary_error),
                "fallback_error": str(fallback_error),
            })
            raise fallback_error from primary_error


def _synthesize_with(
    provider: str,
    clean: str,
    *,
    is_fallback: bool,
    pronunciation_score: int | None,
    voice: str | None,
) -> bytes:
    """Run one provider with cache lookup, timing and structured logs."""
    if provider == "elevenlabs":
        cfg = _elevenlabs_config(is_fallback=is_fallback)
        prepared = _prepare_hebrew_for_feminine_tts(clean)
        cache_key = (
            "elevenlabs", cfg["voice_id"], cfg["model_id"], cfg["speed"],
            prepared,
        )
        chars = len(prepared)
    else:
        voice_name = _azure_voice_name(voice)
        ssml = build_ssml(
            clean,
            is_fallback=is_fallback,
            pronunciation_score=pronunciation_score,
            voice=voice_name,
        )
        # The SSML already encodes voice, rate/pitch and the prepared text.
        cache_key = ("azure", voice_name, _AZURE_OUTPUT_FORMAT_NAME, ssml)
        chars = len(_prepare_hebrew_for_feminine_tts(clean))

    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info({
            "event": "tts_cache_hit",
            "provider": provider,
            "chars": chars,
        })
        return cached

    started = time.perf_counter()
    try:
        if provider == "elevenlabs":
            audio = _synthesize_elevenlabs(prepared, cfg)
        else:
            audio = _synthesize_azure(
                clean,
                is_fallback=is_fallback,
                pronunciation_score=pronunciation_score,
                voice=voice,
            )
    except TTSError as exc:
        logger.warning({
            "event": "tts_provider_failed",
            "provider": provider,
            "reason": getattr(exc, "reason", None) or _reason_for(exc),
            "latency_ms": _elapsed_ms(started),
        })
        raise

    logger.info({
        "event": "tts_ok",
        "provider": provider,
        "chars": chars,
        "latency_ms": _elapsed_ms(started),
    })
    _cache_put(cache_key, audio)
    return audio


def _reason_for(exc: TTSError) -> str:
    if isinstance(exc, TTSCircuitOpenError):
        return "circuit_open"
    if isinstance(exc, TTSAuthError):
        return "auth"
    if isinstance(exc, TTSTimeoutError):
        return "timeout"
    if isinstance(exc, TTSRateLimitError):
        return "rate_limited"
    return "error"


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


# ── ElevenLabs provider ──────────────────────────────────────────────────────
#
# REST: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
#       header xi-api-key, query output_format, JSON body
#       {text, model_id, language_code, voice_settings{stability,
#        similarity_boost, style, use_speaker_boost, speed}}
#
# Model: eleven_v3 — per the ElevenLabs models overview it lists Hebrew (he);
# multilingual_v2 / flash_v2_5 / turbo_v2_5 do NOT. (eleven_v4 also lists
# Hebrew but is documented as Text-to-Dialogue API only.)
# eleven_v3 ignores SSML <break> tags, so no SSML is sent — the Azure SSML's
# pedagogy (slow / x-slow rate) is mapped to voice_settings.speed, which
# ElevenLabs documents in the range 0.7–1.2 (default 1.0).

ELEVENLABS_API_BASE = "https://api.elevenlabs.io"
DEFAULT_ELEVENLABS_MODEL_ID = "eleven_v3"
# Owner-selected Hebrew female tutor voice (voice IDs are not secrets).
DEFAULT_ELEVENLABS_VOICE_ID = "s0T0DT6EAPeX57MQpn3I"
# 22.05 kHz / 32 kbps MP3: closest to Azure's 16 kHz / 32 kbps, keeps the
# base64 payload small; available on every tier (192 kbps needs Creator+).
ELEVENLABS_OUTPUT_FORMAT = "mp3_22050_32"
_ELEVENLABS_SPEED_MIN = 0.7
_ELEVENLABS_SPEED_MAX = 1.2
_DEFAULT_ELEVENLABS_SPEED = 0.9            # ≈ Azure rate="slow" for A1
_DEFAULT_ELEVENLABS_FALLBACK_SPEED = 0.8   # ≈ Azure rate="x-slow"

# Tests inject an httpx.MockTransport here; None = real network.
_ELEVENLABS_TRANSPORT = None


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _clamp_speed(value: float) -> float:
    return round(min(_ELEVENLABS_SPEED_MAX, max(_ELEVENLABS_SPEED_MIN, value)), 2)


def _elevenlabs_config(*, is_fallback: bool) -> dict:
    if is_fallback:
        speed = _float_env(
            "ELEVENLABS_FALLBACK_SPEED", _DEFAULT_ELEVENLABS_FALLBACK_SPEED
        )
    else:
        speed = _float_env("ELEVENLABS_SPEED", _DEFAULT_ELEVENLABS_SPEED)
    return {
        "api_key": os.getenv("ELEVENLABS_API_KEY", "").strip(),
        "voice_id": (
            os.getenv("ELEVENLABS_VOICE_ID", "").strip()
            or DEFAULT_ELEVENLABS_VOICE_ID
        ),
        "model_id": (
            os.getenv("ELEVENLABS_MODEL_ID", "").strip()
            or DEFAULT_ELEVENLABS_MODEL_ID
        ),
        "speed": _clamp_speed(speed),
        "timeout": _float_env("ELEVENLABS_TIMEOUT_SECONDS", 8.0),
        "stability": _float_env("ELEVENLABS_STABILITY", 0.5),
        "similarity_boost": _float_env("ELEVENLABS_SIMILARITY_BOOST", 0.75),
    }


def _synthesize_elevenlabs(prepared_text: str, cfg: dict) -> bytes:
    import httpx
    from services.voice_circuits import elevenlabs_tts_circuit as circuit

    if not circuit.allow_request():
        raise TTSCircuitOpenError("ElevenLabs TTS circuit is open")

    if not cfg["api_key"]:
        circuit.record_failure()
        raise TTSAuthError("ELEVENLABS_API_KEY not set", reason="not_configured")

    url = f"{ELEVENLABS_API_BASE}/v1/text-to-speech/{cfg['voice_id']}"
    payload = {
        "text": prepared_text,
        "model_id": cfg["model_id"],
        "language_code": "he",
        "voice_settings": {
            "stability": cfg["stability"],
            "similarity_boost": cfg["similarity_boost"],
            "style": 0.0,
            "use_speaker_boost": True,
            "speed": cfg["speed"],
        },
    }
    headers = {
        "xi-api-key": cfg["api_key"],
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    try:
        with httpx.Client(
            timeout=cfg["timeout"],
            transport=_ELEVENLABS_TRANSPORT,
        ) as client:
            response = client.post(
                url,
                params={"output_format": ELEVENLABS_OUTPUT_FORMAT},
                json=payload,
                headers=headers,
            )
    except httpx.TimeoutException as exc:
        circuit.record_failure()
        raise TTSTimeoutError(
            f"ElevenLabs TTS timeout: {exc}", reason="timeout"
        ) from exc
    except httpx.HTTPError as exc:
        circuit.record_failure()
        raise TTSError(f"ElevenLabs TTS network error: {exc}", reason="network") from exc

    status = response.status_code
    if status == 200:
        audio = response.content or b""
        if not audio:
            circuit.record_failure()
            raise TTSError("ElevenLabs TTS returned empty audio", reason="empty_audio")
        circuit.record_success()
        return audio

    circuit.record_failure()
    detail = _elevenlabs_error_detail(response)
    if status in (401, 403):
        # 401 also covers quota_exceeded — detail says which.
        raise TTSAuthError(f"ElevenLabs TTS {status}: {detail}", reason="auth")
    if status == 429:
        raise TTSRateLimitError(
            f"ElevenLabs TTS 429: {detail}", reason="rate_limited"
        )
    if status >= 500:
        raise TTSError(f"ElevenLabs TTS {status}: {detail}", reason="server_error")
    raise TTSError(f"ElevenLabs TTS {status}: {detail}", reason="bad_request")


def _elevenlabs_error_detail(response) -> str:
    try:
        body = response.json()
    except Exception:
        return (response.text or "")[:200]
    detail = body.get("detail") if isinstance(body, dict) else body
    if isinstance(detail, dict):
        return str(detail.get("status") or detail.get("message") or detail)[:200]
    return str(detail)[:200]


# ── Azure provider ───────────────────────────────────────────────────────────

_AZURE_OUTPUT_FORMAT_NAME = "Audio16Khz32KBitRateMonoMp3"


def _azure_voice_name(voice: str | None) -> str:
    return (
        voice
        or os.getenv("AZURE_TTS_VOICE", "he-IL-HilaNeural").strip()
        or "he-IL-HilaNeural"
    )


def _synthesize_azure(
    clean: str,
    *,
    is_fallback: bool,
    pronunciation_score: int | None,
    voice: str | None,
) -> bytes:
    """Azure Speech (he-IL neural voice) → MP3 16 kHz. Behaviour unchanged."""
    from services.voice_circuits import tts_circuit

    if not tts_circuit.allow_request():
        logger.warning({"event": "tts_circuit_open"})
        raise TTSCircuitOpenError("TTS circuit is open — too many failures")

    speech_key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    speech_region = os.getenv("AZURE_SPEECH_REGION", "").strip()
    if not speech_key or not speech_region:
        tts_circuit.record_failure()
        raise TTSAuthError(
            "AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not set",
            reason="not_configured",
        )

    voice_name = _azure_voice_name(voice)

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
