from __future__ import annotations

import re
from dataclasses import dataclass

DEFAULT_FALLBACK_REASON = "OUT_OF_SCOPE"
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
HEBREW_WORD_RE = re.compile(r"[\u0590-\u05FF]+(?:['-][\u0590-\u05FF]+)*")
LATIN_RE = re.compile(r"[A-Za-z]")
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
NON_HEBREW_SCRIPT_RE = re.compile(r"[^\u0590-\u05FF\s!?.,'\"()0-9\-]")
MAX_MESSAGE_LENGTH = 200
MAX_HEBREW_WORDS = 12


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
    normalized = (level or "A1").strip().upper()
    return normalized or "A1"


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
    if not hebrew_words(stripped_message) and NON_HEBREW_SCRIPT_RE.search(stripped_message):
        return "OUT_OF_SCOPE"
    return None


def is_clearly_out_of_scope(
    message: str,
    known_vocabulary: set[str],
    advanced_only_tokens: set[str],
) -> bool:
    tokens = [normalize_hebrew_token(token) for token in hebrew_words(message) if normalize_hebrew_token(token)]
    if not tokens:
        return False

    known_count = sum(1 for token in tokens if token in known_vocabulary)
    advanced_count = sum(1 for token in tokens if token in advanced_only_tokens)
    unknown_count = len(tokens) - known_count

    if len(tokens) >= 3 and known_count == 0:
        return True
    if len(tokens) >= 4 and unknown_count / len(tokens) >= 0.5:
        return True
    if advanced_count >= 2 and known_count == 0:
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


def evaluate_vocabulary(answer: str, vocabulary: list[str]) -> GuardrailDecision:
    blocked_tokens = find_blocked_tokens(answer, vocabulary)
    return GuardrailDecision(
        fallback_used=bool(blocked_tokens),
        fallback_reason="VOCAB_LEAKAGE" if blocked_tokens else None,
        blocked_tokens=blocked_tokens,
    )


def count_hebrew_words(text: str) -> int:
    return len([token for token in hebrew_words(text) if normalize_hebrew_token(token)])


def is_short_hebrew_answer(text: str, max_words: int = MAX_HEBREW_WORDS) -> bool:
    return count_hebrew_words(text) <= max_words


def get_fallback_text(reason: str | None) -> str:
    normalized_reason = reason or DEFAULT_FALLBACK_REASON
    return FALLBACK_RESPONSES.get(normalized_reason, FALLBACK_RESPONSES[DEFAULT_FALLBACK_REASON])
