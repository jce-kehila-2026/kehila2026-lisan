from __future__ import annotations

import re
from dataclasses import dataclass

from services.curriculum import level_rank, normalize_level, word_complexity


HEBREW_WORD_RE = re.compile(r"[\u0590-\u05FF]+(?:['-][\u0590-\u05FF]+)*")

# These are not "forbidden topics". They are terms whose vocabulary load is
# above beginner levels. B2 can discuss them; A1 should be redirected to simpler
# curriculum language.
TERM_COMPLEXITY: dict[str, int] = {
    "רופא": 2,
    "מרפאה": 2,
    "תור": 2,
    "חולה": 2,
    "בריאות": 3,
    "דוקטור": 3,
    "תרופה": 3,
    "בדיקה": 3,
    "בירוקרטיה": 4,
    "ממשלתית": 4,
    "מורכבת": 4,
    "בורסה": 4,
    "קריפטו": 4,
    "מניות": 4,
    "השקעות": 4,
    "ביטקוין": 4,
    "פוליטיקה": 4,
    "כלכלה": 4,
    "מקרו": 4,
    "פילוסופיה": 4,
    "אלגוריתמים": 4,
    "נוירונים": 4,
}

QUESTION_HELPERS = {
    "מה", "זה", "מי", "איפה", "איך", "כמה", "למה", "מתי", "אני", "רוצה",
    "לדבר", "על", "עם", "שיחה", "תן", "דוגמה", "תרגם", "תקן", "לי",
}


@dataclass(frozen=True)
class ComplexityDecision:
    level: str
    allowed_rank: int
    estimated_rank: int
    too_complex: bool
    complex_tokens: list[str]


def _normalize_token(token: str) -> str:
    return token.strip(".,!?\"'():;[]{}").replace("׳", "").replace("״", "").strip()


def hebrew_tokens(message: str) -> list[str]:
    return [
        normalized
        for token in HEBREW_WORD_RE.findall(message or "")
        if (normalized := _normalize_token(token))
    ]


def token_complexity(token: str) -> int | None:
    if token in QUESTION_HELPERS:
        return 1
    curriculum_rank = word_complexity(token)
    if curriculum_rank is not None:
        return curriculum_rank
    return TERM_COMPLEXITY.get(token)


def estimate_vocab_complexity(message: str) -> tuple[int, list[str]]:
    tokens = hebrew_tokens(message)
    if not tokens:
        return 1, []

    estimated = 1
    complex_tokens: list[str] = []
    for token in tokens:
        rank = token_complexity(token)
        if rank is None:
            # Unknown words are handled by the older ratio-based guardrails,
            # which know the active bundle vocabulary. Complexity only handles
            # known cross-level terms, so ordinary names/inflections do not
            # become false positives here.
            rank = 1
        if rank > estimated:
            estimated = rank
        if rank >= 3 and token not in complex_tokens:
            complex_tokens.append(token)

    return estimated, complex_tokens


def check_complexity(message: str, level: str | None = None) -> ComplexityDecision:
    resolved_level = normalize_level(level)
    allowed_rank = level_rank(resolved_level)
    estimated_rank, complex_tokens = estimate_vocab_complexity(message)
    return ComplexityDecision(
        level=resolved_level,
        allowed_rank=allowed_rank,
        estimated_rank=estimated_rank,
        too_complex=estimated_rank > allowed_rank,
        complex_tokens=complex_tokens,
    )


def is_too_complex_for_level(message: str, level: str | None = None) -> bool:
    return check_complexity(message, level).too_complex


def canonical_complexity_target(message: str, level: str | None = None) -> str | None:
    decision = check_complexity(message, level)
    if not decision.too_complex:
        return None
    if decision.complex_tokens:
        return sorted(decision.complex_tokens)[0]
    tokens = hebrew_tokens(message)
    return " ".join(tokens) if tokens else None
