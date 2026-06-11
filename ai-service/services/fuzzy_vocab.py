from __future__ import annotations

import re

from services.chat_guardrails import is_known_token, normalize_hebrew_token

HEBREW_WORD_RE = re.compile(r"^[\u0590-\u05ff]{2,}$")

try:  # optional free dependency
    from rapidfuzz import fuzz as rapidfuzz_fuzz  # type: ignore
except Exception:  # pragma: no cover - depends on local install
    rapidfuzz_fuzz = None

# Typo correction must be CONSERVATIVE. Permissive matching rewrote VALID
# words into vocabulary lookalikes (measured live: "\u05d5\u05db\u05de\u05d4 \u05d4\u05d5\u05d0 \u05e2\u05d5\u05dc\u05d4?" reached
# the LLM as "\u05de\u05d4 \u05d4\u05d5\u05d0 \u05e2\u05d5\u05dc\u05d4?"), silently changing the student's question and
# breaking every exact-match deterministic handler downstream. Constraints:
#   - never touch a word that is already known (morphology-aware: prefixes,
#     suffixes, proper nouns \u2014 not just exact membership)
#   - only words of 4+ letters (short words are too easy to "match")
#   - candidate must share the first letter (typos rarely change it)
#   - ONLY insertion/deletion typos (doubled or dropped letter). Same-length
#     substitutions are rejected: swapping one letter usually produces a
#     DIFFERENT real word (measured live: תגיד "say" was rewritten to תמיד
#     "always", silently changing the student's request).
_MIN_TYPO_LEN = 4


def _is_one_insert_or_delete_away(left: str, right: str) -> bool:
    """True when one string is the other with a single letter added/removed."""
    if abs(len(left) - len(right)) != 1:
        return False
    from rapidfuzz.distance import Levenshtein
    return Levenshtein.distance(left, right) == 1


def best_vocab_match(word: str, vocabulary: set[str], min_score: float | None = None) -> str | None:
    del min_score  # kept for call-site compatibility; edit distance rules now
    normalized = normalize_hebrew_token(word)
    if not normalized or not HEBREW_WORD_RE.fullmatch(normalized):
        return None
    if len(normalized) < _MIN_TYPO_LEN:
        return None
    if is_known_token(normalized, vocabulary):
        return None
    for candidate in vocabulary:
        if not candidate or not HEBREW_WORD_RE.fullmatch(candidate):
            continue
        if candidate[0] != normalized[0]:
            continue
        if _is_one_insert_or_delete_away(normalized, candidate):
            return candidate
    return None


def correct_known_tokens(message: str, vocabulary: set[str]) -> tuple[str, dict[str, str]]:
    replacements: dict[str, str] = {}
    corrected_parts: list[str] = []
    for part in (message or "").split():
        normalized = normalize_hebrew_token(part)
        if not HEBREW_WORD_RE.fullmatch(normalized or ""):
            corrected_parts.append(part)
            continue
        match = best_vocab_match(normalized, vocabulary)
        if match and normalized and match != normalized:
            replacements[normalized] = match
            corrected_parts.append(part.replace(normalized, match))
        else:
            corrected_parts.append(part)
    return " ".join(corrected_parts), replacements
