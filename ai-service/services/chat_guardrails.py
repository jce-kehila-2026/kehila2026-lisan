from __future__ import annotations

import re
from dataclasses import dataclass
from typing import NamedTuple

DEFAULT_LEVEL = "A1"
DEFAULT_FALLBACK_REASON = "OUT_OF_SCOPE"


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
}

_DEFAULT_CONFIG = _LEVEL_CONFIGS["A1"]


def _get_config(level: str | None) -> _LevelConfig:
    return _LEVEL_CONFIGS.get(normalize_level(level), _DEFAULT_CONFIG)

FALLBACK_RESPONSES = {
    "EMPTY_MESSAGE": "כתוב שאלה קצרה בעברית.",
    "MIXED_LANGUAGE": "נסה לשאול בעברית פשוטה.",
    "OUT_OF_SCOPE": "זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור.",
    "VOCAB_LEAKAGE": "בוא נתרגל משפט פשוט מהשיעור.",
    "MESSAGE_TOO_LONG": "נסה שוב עם שאלה קצרה.",
    "MODEL_TIMEOUT": "נסה שוב עם שאלה קצרה.",
    "MODEL_ERROR": "נסה שוב עם שאלה קצרה.",
    "EMPTY_RESPONSE": "נסה שוב עם שאלה קצרה.",
    "PROVIDER_QUOTA": "נסה שוב עם שאלה קצרה.",
    "PROVIDER_AUTH": "נסה שוב עם שאלה קצרה.",
    "PROVIDER_NETWORK": "נסה שוב עם שאלה קצרה.",
    "CIRCUIT_OPEN": "נסה שוב עוד כמה דקות.",
}
FALLBACK_CODES = frozenset(FALLBACK_RESPONSES.keys())

HEBREW_WORD_RE = re.compile(r"[\u0590-\u05FF]+(?:['-][\u0590-\u05FF]+)*")
LATIN_RE = re.compile(r"[A-Za-z]")
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
NON_HEBREW_SCRIPT_RE = re.compile(r"[^\u0590-\u05FF\s!?.,'\"()0-9\-]")
MAX_MESSAGE_LENGTH = 200
MAX_HEBREW_WORDS = 12
MAX_VOICE_WORDS = 10

# STT output sometimes includes stray punctuation or digits \u2014 only hard-reject Arabic script
_STT_ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


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


def classify_fast_reject(message: str) -> str | None:
    stripped_message = (message or "").strip()
    if not stripped_message:
        return "EMPTY_MESSAGE"
    if len(stripped_message) > MAX_MESSAGE_LENGTH:
        return "MESSAGE_TOO_LONG"
    if LATIN_RE.search(stripped_message) or ARABIC_RE.search(stripped_message):
        return "MIXED_LANGUAGE"
    if not hebrew_words(stripped_message):
        return "OUT_OF_SCOPE"
    if NON_HEBREW_SCRIPT_RE.search(stripped_message) and not hebrew_words(stripped_message):
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
    # Keep only the first sentence if multiple remain
    for sep in (".", "?", "!"):
        if sep in cleaned:
            cleaned = cleaned.split(sep)[0] + sep
            break
    return cleaned


def enforce_hebrew_only_scope(include_arabic: bool) -> bool:
    del include_arabic
    return False


def is_precise_fallback_reason(reason: str | None) -> bool:
    return bool(reason and reason in FALLBACK_CODES)


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

    known_count = sum(1 for token in tokens if token in known_vocabulary)
    advanced_count = sum(1 for token in tokens if token in advanced_only_tokens)
    unknown_count = len(tokens) - known_count

    if len(tokens) >= cfg.oos_all_unknown_min and known_count == 0:
        return True
    if len(tokens) >= cfg.oos_all_unknown_min + 1 and unknown_count / len(tokens) >= cfg.oos_unknown_ratio:
        return True
    if advanced_count >= cfg.oos_advanced_no_known and known_count == 0:
        return True
    return False


def find_blocked_tokens(answer: str, vocabulary: list[str]) -> list[str]:
    approved_tokens = set(vocabulary)
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
    return GuardrailDecision(
        fallback_used=bool(blocked_tokens),
        fallback_reason="VOCAB_LEAKAGE" if blocked_tokens else None,
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
