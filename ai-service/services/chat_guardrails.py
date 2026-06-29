from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

logger = logging.getLogger("lisan.chat")

DEFAULT_LEVEL = "A1"
DEFAULT_FALLBACK_REASON = "OUT_OF_SCOPE"

# Vocab-leak tolerance (env-tunable). A proactive tutor that corrects and asks
# questions naturally uses a few words beyond the small A1 whitelist
# (כמעט, אומרים, נסה ...). Zero-tolerance nuked whole replies and caused the
# canned-fallback loop, so we only treat a reply as a leak when it is
# DOMINATED by unknown vocabulary, not when a couple of words slip in.
VOCAB_LEAK_MAX_UNKNOWN = int(os.getenv("VOCAB_LEAK_MAX_UNKNOWN", "3"))
VOCAB_LEAK_MAX_RATIO = float(os.getenv("VOCAB_LEAK_MAX_RATIO", "0.5"))


class _LevelConfig(NamedTuple):
    max_hebrew_words: int        # cap on answer word count
    max_message_length: int      # max input chars before MESSAGE_TOO_LONG
    oos_all_unknown_min: int     # min tokens before "all unknown → OOS"
    oos_unknown_ratio: float     # unknown/total ratio threshold
    oos_advanced_no_known: int   # advanced-only tokens with zero known → OOS
    vocab_strict: bool           # True → enforce exact vocab list on output


_LEVEL_CONFIGS: dict[str, _LevelConfig] = {
    "A1": _LevelConfig(
        max_hebrew_words=12,
        max_message_length=200,
        oos_all_unknown_min=3,
        # FUTURE TUNING: 0.50 is conservative — flags 2 unknown / 2 known
        # as OOS. Real-world A1 students often try to use one new word
        # alongside known vocab. Track OOS false-positive rate in prod
        # analytics; raise to 0.55-0.65 once data confirms the regression.
        # NOTE: changing this requires updating tests in
        # test_day3_prompt_and_fallback.py FALLBACK_FAST_REJECT_DATASET.
        oos_unknown_ratio=0.50,
        oos_advanced_no_known=2,
        vocab_strict=True,
    ),
    "A2": _LevelConfig(
        max_hebrew_words=20,
        max_message_length=400,
        oos_all_unknown_min=5,
        oos_unknown_ratio=0.75,
        oos_advanced_no_known=4,
        vocab_strict=False,
    ),
    # B levels exist so formal/workplace/municipality content is allowed at
    # the level it belongs to. Before these configs, B1/B2 requests silently
    # fell back to the STRICTEST A1 config — the exact opposite of intent —
    # rejecting legitimate B-level messages as out-of-scope.
    "B1": _LevelConfig(
        max_hebrew_words=35,
        max_message_length=600,
        oos_all_unknown_min=7,
        oos_unknown_ratio=0.85,
        oos_advanced_no_known=8,
        vocab_strict=False,
    ),
    "B2": _LevelConfig(
        max_hebrew_words=50,
        max_message_length=800,
        oos_all_unknown_min=9,
        oos_unknown_ratio=0.92,
        oos_advanced_no_known=12,
        vocab_strict=False,
    ),
}

_DEFAULT_CONFIG = _LEVEL_CONFIGS["A1"]


def _get_config(level: str | None) -> _LevelConfig:
    return _LEVEL_CONFIGS.get(normalize_level(level), _DEFAULT_CONFIG)

# All learners on this platform are FEMALE — every imperative here uses the
# feminine form (כתבי / נסי / בואי), never masculine.
FALLBACK_RESPONSES = {
    "EMPTY_MESSAGE": "כתבי שאלה קצרה בעברית. למשל: מה זה בית?",
    "MIXED_LANGUAGE": "נסי לכתוב בעברית. אפשר מילה אחת, למשל: שלום.",
    # Teaching fallback: tell the learner HOW to fix the question, with a
    # concrete example, instead of a bare rejection.
    "OUT_OF_SCOPE": "זה לא בחומר שלנו עכשיו. נסי שאלה פשוטה, למשל: מה זה בית?",
    "VOCAB_LEAKAGE": "בואי נתרגל משפט פשוט מהשיעור. למשל: אני רוצה קפה.",
    "MESSAGE_TOO_LONG": "נסי שוב עם שאלה קצרה.",
    "MODEL_TIMEOUT": "נסי שוב עם שאלה קצרה.",
    "MODEL_ERROR": "נסי שוב עם שאלה קצרה.",
    "EMPTY_RESPONSE": "נסי שוב עם שאלה קצרה.",
    # Quota is a server-side condition, not a user error — the message must
    # not blame the question ("try a shorter question" was misleading).
    "PROVIDER_QUOTA": "יש עומס עכשיו. נסי שוב עוד מעט.",
    "PROVIDER_AUTH": "נסי שוב עם שאלה קצרה.",
    "PROVIDER_NETWORK": "נסי שוב עם שאלה קצרה.",
    "CIRCUIT_OPEN": "נסי שוב עוד כמה דקות.",
    # Per-user LLM budget exhausted — a soft, self-resetting rate limit, not an
    # error. Same learner-facing wording as a server-side quota.
    "LLM_RATE_LIMITED": "יש עומס עכשיו. נסי שוב עוד מעט.",
}
# Arabic translations of the fallback texts. Served in answerAr ONLY when
# the student's own message contained Arabic script — a learner who writes
# Arabic demonstrably reads it, and a Hebrew-only rejection they cannot
# understand teaches nothing.
FALLBACK_RESPONSES_AR = {
    "EMPTY_MESSAGE": "اكتب سؤالًا قصيرًا بالعبرية. مثلًا: מה זה בית؟",
    "MIXED_LANGUAGE": "حاول أن تكتب بالعبرية. كلمة واحدة تكفي، مثلًا: שלום.",
    "OUT_OF_SCOPE": "هذا ليس ضمن دروسنا الآن. جرّب سؤالًا بسيطًا، مثلًا: מה זה בית؟",
    "VOCAB_LEAKAGE": "هيا نتدرّب على جملة بسيطة من الدرس. مثلًا: אני רוצה קפה.",
    "MESSAGE_TOO_LONG": "حاول مرة أخرى بسؤال أقصر.",
    "MODEL_TIMEOUT": "حاول مرة أخرى بسؤال قصير.",
    "MODEL_ERROR": "حاول مرة أخرى بسؤال قصير.",
    "EMPTY_RESPONSE": "حاول مرة أخرى بسؤال قصير.",
    "PROVIDER_QUOTA": "الخدمة مشغولة الآن. حاول مرة أخرى بعد قليل.",
    "PROVIDER_AUTH": "حاول مرة أخرى بسؤال قصير.",
    "PROVIDER_NETWORK": "حاول مرة أخرى بسؤال قصير.",
    "CIRCUIT_OPEN": "حاول مرة أخرى بعد بضع دقائق.",
    "LLM_RATE_LIMITED": "الخدمة مشغولة الآن. حاول مرة أخرى بعد قليل.",
}
FALLBACK_CODES = frozenset(FALLBACK_RESPONSES.keys())

HEBREW_WORD_RE = re.compile(r"[\u0590-\u05FF]+(?:['-][\u0590-\u05FF]+)*")
LATIN_RE = re.compile(r"[A-Za-z]")
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
NON_HEBREW_SCRIPT_RE = re.compile(r"[^\u0590-\u05FF\s!?.,'\"()0-9\-]")
# Any alphabetic letter that is NOT Hebrew (Latin, Cyrillic, Greek, CJK, ...).
# Catches homoglyph/lookalike attacks (e.g. a Cyrillic "\u0430" next to Hebrew)
# that the Latin/Arabic-only checks used to miss.
NON_HEBREW_LETTER_RE = re.compile(r"[^\W\d_\u0590-\u05FF]", re.UNICODE)
# Invisible characters used to smuggle hidden text or split words:
# zero-width (ZWSP/ZWNJ/ZWJ/word-joiner/BOM) and bidi/directional marks.
_ZERO_WIDTH_RE = re.compile(r"[\u200B\u200C\u200D\u2060\uFEFF]")
_DIRECTIONAL_RE = re.compile(r"[\u200E\u200F\u202A-\u202E\u2066-\u2069]")
_HEBREW_MAQAF = "\u05BE"  # \u05BE \u2014 Hebrew hyphen; treat as a word separator
MAX_MESSAGE_LENGTH = 200
MAX_HEBREW_WORDS = 12
MAX_VOICE_WORDS = 10

# STT output sometimes includes stray punctuation or digits \u2014 only hard-reject Arabic script
_STT_ARABIC_RE = re.compile(r"[\u0600-\u06FF]")

# ── Back-compat topic-policy helpers ────────────────────────────────────────
# Static topic blocking was replaced by level-aware complexity checks. These
# helpers remain for older tests/tools that import them directly, but the chat
# pipeline no longer rejects merely because a topic word appears.
_TOPIC_POLICY_PATH = (
    Path(__file__).resolve().parents[1]
    / "data" / "chatbot_quality" / "topic_policy.json"
)

_FALLBACK_BLOCKED_TOPIC_TERMS = {
    "בורסה", "קריפטו", "מניות", "השקעות", "ביטקוין",
    "פוליטיקה", "פילוסופיה", "אלגוריתמים", "נוירונים",
}


def _load_topic_policy() -> dict:
    try:
        with open(_TOPIC_POLICY_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.warning(
            f"topic_policy.json unreadable ({exc}); using built-in fallback."
        )
        return {}


def _flatten_blocked_terms(policy: dict) -> set[str]:
    groups = policy.get("blocked_topics")
    if not isinstance(groups, dict):
        return set(_FALLBACK_BLOCKED_TOPIC_TERMS)
    terms: set[str] = set()
    for group_terms in groups.values():
        if isinstance(group_terms, list):
            terms.update(t for t in group_terms if isinstance(t, str) and t.strip())
    # Never let an empty/malformed file disable the guardrail entirely.
    return terms or set(_FALLBACK_BLOCKED_TOPIC_TERMS)


_TOPIC_POLICY = _load_topic_policy()
_BLOCKED_TOPIC_TERMS = _flatten_blocked_terms(_TOPIC_POLICY)
_LEVEL_TOPIC_EXCEPTIONS = {
    (level or "").strip().upper(): {t for t in terms if isinstance(t, str)}
    for level, terms in (_TOPIC_POLICY.get("level_exceptions") or {}).items()
    if isinstance(terms, list)
}


def blocked_topic_terms(level: str | None = None) -> set[str]:
    """Legacy term list kept for compatibility.

    New code should use services.complexity_checker; this set is not a topic
    blacklist anymore.
    """
    if not level:
        return set(_BLOCKED_TOPIC_TERMS)
    exceptions = _LEVEL_TOPIC_EXCEPTIONS.get(level.strip().upper(), set())
    return _BLOCKED_TOPIC_TERMS - exceptions


@dataclass
class GuardrailDecision:
    fallback_used: bool
    fallback_reason: str | None
    blocked_tokens: list[str]


def hebrew_words(text: str) -> list[str]:
    return HEBREW_WORD_RE.findall(text or "")


def normalize_hebrew_token(token: str) -> str:
    return token.strip(".,!?\"'():;[]{}").replace("׳", "").replace("״", "").strip()


def normalize_level(level: str | None) -> str:
    normalized = (level or DEFAULT_LEVEL).strip().upper()
    return normalized or DEFAULT_LEVEL


def sanitize_input(text: str) -> str:
    """
    Normalize raw user input before any guardrail/routing/LLM step.

    Removes invisible smuggling characters (zero-width + bidi/directional
    marks) that can hide foreign text or split Hebrew words, converts the
    Hebrew maqaf to a space, and collapses whitespace. This closes the
    Unicode edge cases the hardening audit caught (e.g. "ש‍לום" with a
    zero-width joiner, or "איפה־הדואר" with a maqaf).
    """
    if not text:
        return ""
    try:
        import ftfy  # type: ignore
        fixed = ftfy.fix_text(text)
    except Exception:
        fixed = text
    cleaned = _ZERO_WIDTH_RE.sub("", fixed)
    cleaned = _DIRECTIONAL_RE.sub("", cleaned)
    cleaned = cleaned.replace(_HEBREW_MAQAF, " ")
    return re.sub(r"\s+", " ", cleaned).strip()


def classify_fast_reject(message: str, level: str | None = None) -> str | None:
    stripped_message = (message or "").strip()
    if not stripped_message:
        return "EMPTY_MESSAGE"
    if len(stripped_message) > MAX_MESSAGE_LENGTH:
        return "MESSAGE_TOO_LONG"
    if re.fullmatch(r"[\?\u061f]+", stripped_message):
        return "EMPTY_MESSAGE"
    has_arabic = bool(ARABIC_RE.search(stripped_message))
    has_hebrew = bool(hebrew_words(stripped_message))
    # Arabic+Hebrew mixed messages (e.g. "شو يعني בית?") are a valid learning
    # pattern — the student writes their L1 Arabic alongside the Hebrew word
    # they're asking about.  Let these through to the intent router; only
    # pure-Arabic or Arabic-without-Hebrew messages are rejected here.
    if has_arabic and not has_hebrew:
        return "MIXED_LANGUAGE"
    # Non-Hebrew scripts other than Arabic (Latin, Cyrillic, Greek, ...)
    if not has_arabic and NON_HEBREW_LETTER_RE.search(stripped_message):
        return "MIXED_LANGUAGE"
    if not has_hebrew:
        return "OUT_OF_SCOPE"
    tokens = [normalize_hebrew_token(token) for token in hebrew_words(stripped_message) if normalize_hebrew_token(token)]
    if len(tokens) == 1 and len(tokens[0]) == 1:
        return "EMPTY_MESSAGE"
    from services.complexity_checker import is_too_complex_for_level
    if is_too_complex_for_level(stripped_message, level):
        return "OUT_OF_SCOPE"
    return None


def classify_fast_reject_voice(message: str) -> str | None:
    """
    Lenient fast-reject for STT-transcribed input.

    STT output for Hebrew may include stray digits, punctuation, or mixed
    casing from the recogniser. We only hard-reject on:
      - empty / too-long transcript
      - Arabic script in the reply (the student spoke Arabic instead of Hebrew)
    We do NOT reject on Latin characters because some STT engines emit
    transliteration noise alongside the Hebrew transcript.
    """
    stripped_message = (message or "").strip()
    if not stripped_message:
        return "EMPTY_MESSAGE"
    if len(stripped_message) > MAX_MESSAGE_LENGTH:
        return "MESSAGE_TOO_LONG"
    if _STT_ARABIC_RE.search(stripped_message):
        return "MIXED_LANGUAGE"
    if not hebrew_words(stripped_message):
        return "OUT_OF_SCOPE"
    return None


def strip_non_tts_chars(text: str) -> str:
    """
    Remove characters that would sound bad when read aloud by a TTS engine:
    parentheses, brackets, slashes, dashes used as separators, digits.
    Keeps Hebrew letters, spaces, and a single terminal punctuation mark.
    """
    # Remove digits and common non-speech symbols
    cleaned = re.sub(r"[\d()\[\]{}/\\|@#$%^&*+=<>~`]", "", text)
    # Collapse multiple spaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Keep up to the first TWO sentences so a spoken tutor turn (a gentle
    # correction followed by a question) isn't cut down to a single fragment.
    parts = re.split(r"([.?!])", cleaned)
    sentences: list[str] = []
    for i in range(0, len(parts) - 1, 2):
        segment = (parts[i] + parts[i + 1]).strip()
        if segment:
            sentences.append(segment)
    if sentences:
        cleaned = " ".join(sentences[:2])
    return cleaned


def enforce_hebrew_only_scope(include_arabic: bool) -> bool:
    return bool(include_arabic)


def is_precise_fallback_reason(reason: str | None) -> bool:
    return bool(reason and reason in FALLBACK_CODES)


# Hebrew bound prefixes (definite article, conjunction, prepositions):
# ו (and), ה (the), ב (in), ל (to), מ (from), כ (as), ש (that).
# They attach directly to the word: הבית = ה+בית, בנצרת = ב+נצרת.
# Vocabulary matching must strip them, otherwise every prefixed form of a
# known curriculum word counts as "unknown" and inflates the OOS ratio.
HEBREW_PREFIX_LETTERS = "והבלמכש"
_MAX_PREFIX_STRIP = 2  # e.g. וה / וב / שה stacks

# Common inflection suffixes (plural, possessive, feminine, 1st person).
# Stripping ONE of these for the "is this word known?" check lets natural
# conjugations match their base form (ילדים → ילד, ספרי → ספר). This is the
# benefit-of-the-doubt direction only: a false "known" merely sends the
# message to the LLM, whose OUTPUT is still vocabulary-guarded.
_HEBREW_SUFFIXES = ("ים", "ות", "תי", "נו", "כם", "כן", "הם", "הן", "ה", "י", "ך", "ו", "ת")

# Proper nouns every Israeli learner uses from day one: cities and towns.
# Hebrew has no capitalization, so a gazetteer is the only reliable way to
# keep place names from counting as "unknown vocabulary" (live evals showed
# נצרת/עכו/חיפה pushing legitimate sentences over the out-of-scope ratio).
KNOWN_PROPER_NOUNS = frozenset({
    "ישראל", "ירושלים", "אביב", "חיפה", "נצרת", "עכו", "לוד", "רמלה",
    "חולון", "אשדוד", "אשקלון", "אילת", "טבריה", "צפת", "חדרה", "נתניה",
    "רעננה", "הרצליה", "באר", "שבע", "יפו", "בת", "ים", "רמת", "גן",
    "כרמיאל", "עפולה", "שפרעם", "סכנין", "טמרה", "אום", "אלפחם",
})


def is_known_token(token: str, vocabulary: set[str]) -> bool:
    """
    Morphology-aware vocabulary membership for a normalized Hebrew token:
    exact match, known proper noun, bound-prefix stripping (up to 2), and
    one inflection-suffix strip on each prefix variant.
    """
    variants = [token]
    stripped = token
    for _ in range(_MAX_PREFIX_STRIP):
        if len(stripped) > 2 and stripped[0] in HEBREW_PREFIX_LETTERS:
            stripped = stripped[1:]
            variants.append(stripped)
        else:
            break

    for variant in variants:
        if variant in vocabulary or variant in KNOWN_PROPER_NOUNS:
            return True
        for suffix in _HEBREW_SUFFIXES:
            # Base must keep >= 3 letters: shorter remainders over-match
            # (e.g. prefix-stripping כלכלה to כלה, then suffix-stripping to
            # כל — "economics" must not count as the known word "all").
            if len(variant) - len(suffix) >= 3 and variant.endswith(suffix):
                base = variant[: -len(suffix)]
                if base in vocabulary or base in KNOWN_PROPER_NOUNS:
                    return True
    return False


def is_clearly_out_of_scope(
    message: str,
    known_vocabulary: set[str],
    advanced_only_tokens: set[str],
    level: str | None = None,
) -> bool:
    cfg = _get_config(level)
    tokens = [normalize_hebrew_token(token) for token in hebrew_words(message) if normalize_hebrew_token(token)]
    if not tokens:
        return False

    from services.complexity_checker import is_too_complex_for_level
    if is_too_complex_for_level(message, level):
        return True

    known_count = sum(1 for token in tokens if is_known_token(token, known_vocabulary))
    advanced_count = sum(1 for token in tokens if token in advanced_only_tokens)
    unknown_count = len(tokens) - known_count

    if len(tokens) >= cfg.oos_all_unknown_min and known_count == 0:
        return True
    # Strictly greater: "dominated by unknown vocabulary" means MORE than the
    # threshold. At exactly 50% (e.g. a known greeting + an unknown proper
    # name) the message gets the benefit of the doubt — output-side vocab
    # guardrails still constrain whatever the model answers.
    if len(tokens) >= cfg.oos_all_unknown_min + 1 and unknown_count / len(tokens) > cfg.oos_unknown_ratio:
        return True
    if advanced_count >= cfg.oos_advanced_no_known and known_count == 0:
        return True
    return False


def find_blocked_tokens(answer: str, vocabulary: list[str]) -> list[str]:
    approved_tokens = set(vocabulary)
    # Place names are always sayable — the tutor must be able to echo the
    # city a student mentioned without tripping the vocabulary guard.
    approved_tokens.update(KNOWN_PROPER_NOUNS)
    for fallback_text in FALLBACK_RESPONSES.values():
        approved_tokens.update(hebrew_words(fallback_text))

    blocked_tokens: list[str] = []
    for token in hebrew_words(answer):
        normalized = normalize_hebrew_token(token)
        if normalized and normalized not in approved_tokens and normalized not in blocked_tokens:
            blocked_tokens.append(normalized)
    return blocked_tokens


def evaluate_vocabulary(answer: str, vocabulary: list[str], level: str | None = None) -> GuardrailDecision:
    cfg = _get_config(level)
    if not cfg.vocab_strict:
        return GuardrailDecision(fallback_used=False, fallback_reason=None, blocked_tokens=[])
    blocked_tokens = find_blocked_tokens(answer, vocabulary)
    if not blocked_tokens:
        return GuardrailDecision(fallback_used=False, fallback_reason=None, blocked_tokens=[])

    # Tolerant check: only treat the reply as a real leak when it is DOMINATED
    # by unknown vocabulary. A few natural teaching words slipping in is fine —
    # zero-tolerance was nuking whole corrections and looping the fallback.
    total_words = count_hebrew_words(answer) or len(blocked_tokens)
    unknown_ratio = len(blocked_tokens) / total_words
    leaked = (
        len(blocked_tokens) > VOCAB_LEAK_MAX_UNKNOWN
        and unknown_ratio > VOCAB_LEAK_MAX_RATIO
    )
    return GuardrailDecision(
        fallback_used=leaked,
        fallback_reason="VOCAB_LEAKAGE" if leaked else None,
        blocked_tokens=blocked_tokens,
    )


def is_hebrew_only_answer(answer: str) -> bool:
    stripped_answer = (answer or "").strip()
    if not stripped_answer:
        return False
    if LATIN_RE.search(stripped_answer) or ARABIC_RE.search(stripped_answer):
        return False
    return bool(hebrew_words(stripped_answer))


def count_hebrew_words(text: str) -> int:
    return len([token for token in hebrew_words(text) if normalize_hebrew_token(token)])


def is_short_hebrew_answer(text: str, max_words: int = MAX_HEBREW_WORDS) -> bool:
    return count_hebrew_words(text) <= max_words


def get_max_words_for_level(level: str | None) -> int:
    """Return the max-answer-word cap for the given level."""
    return _get_config(level).max_hebrew_words


def get_max_message_length_for_level(level: str | None) -> int:
    """Return the max-input-character limit for the given level."""
    return _get_config(level).max_message_length


def get_fallback_text(reason: str | None) -> str:
    normalized_reason = reason if is_precise_fallback_reason(reason) else DEFAULT_FALLBACK_REASON
    return FALLBACK_RESPONSES.get(normalized_reason, FALLBACK_RESPONSES[DEFAULT_FALLBACK_REASON])


def get_fallback_text_ar(reason: str | None) -> str:
    normalized_reason = reason if is_precise_fallback_reason(reason) else DEFAULT_FALLBACK_REASON
    return FALLBACK_RESPONSES_AR.get(normalized_reason, FALLBACK_RESPONSES_AR[DEFAULT_FALLBACK_REASON])
