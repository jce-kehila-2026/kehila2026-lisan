"""
chat_suggestions.py
====================
Zero-cost suggestion engine for the Lisan A1 chat.

Design constraints
------------------
- No LLM call — all suggestions are static, curated per topic cluster.
- Every suggestion is a valid A1 Hebrew sentence (≤ 8 words).
- Topic detection is purely lexical: we scan the engine's answer and the
  original user message for known keyword clusters, then pick the matching
  suggestion pack.  Falls back to a level-appropriate generic pack.
- Public surface:  get_suggestions(answer_he, message, level) -> list[str]
"""

from __future__ import annotations

import re

# ── Hebrew unicode range regex ────────────────────────────────────────────
_HEBREW_RE = re.compile(r"[֐-׿]+")

_STRIP_CHARS = ".,!?\"'():;"


def _he_tokens(text: str) -> frozenset[str]:
    """Lowercase-normalised set of Hebrew tokens in *text*."""
    return frozenset(
        m.group().strip(_STRIP_CHARS)
        for m in _HEBREW_RE.finditer(text or "")
    )


# ─────────────────────────────────────────────────────────────────────────
# Topic → keyword clusters
# Each cluster is a frozenset of Hebrew tokens. The detector picks the
# topic whose cluster has the highest overlap with (answer ∪ message).
#
# Keywords are chosen for uniqueness — words that strongly identify ONE
# topic win over generic words like "אני" or "מה".
# Score = len(combined_tokens ∩ keywords); highest wins.
# ─────────────────────────────────────────────────────────────────────────
_TOPIC_KEYWORDS: dict[str, frozenset[str]] = {
    # ── Social ────────────────────────────────────────────────────────
    "greeting": frozenset({
        "שלום", "היי", "הי", "נשמע", "שלומך",
        "להתראות", "יום", "בוקר", "ערב",
    }),
    "thanks": frozenset({
        "תודה", "בבקשה", "סליחה", "כיף", "נעים",
    }),
    # ── Personal identity ─────────────────────────────────────────────
    "identity": frozenset({
        "שם", "מי", "סטודנט", "מורה",
        "עמל", "עידו", "איה", "מאיפה", "ישראלי",
    }),
    # ── Where people live ─────────────────────────────────────────────
    "location": frozenset({
        "גר", "גרה", "גרים", "גרות",
        "ירושלים", "תל", "אביב", "חיפה", "לוד",
        "נצרת", "באר", "שבע", "עיר", "כפר", "שכונה",
    }),
    # ── Work / profession ─────────────────────────────────────────────
    "work": frozenset({
        "עובד", "עובדת", "עובדים", "עבודה",
        "משרד", "בנק", "אוניברסיטה",
        "מפעל", "מרפאה", "מקצוע",
    }),
    # ── Family ────────────────────────────────────────────────────────
    "family": frozenset({
        "אמא", "אבא", "ילד", "ילדים", "ילדה",
        "אח", "אחות", "משפחה", "בן", "בת",
        "בעל", "אישה", "סבא", "סבתא", "נכד",
    }),
    # ── Café / drinks ─────────────────────────────────────────────────
    "cafe": frozenset({
        "קפה", "תה", "מיץ", "שותה", "שותים",
        "חלב", "סוכר", "אספרסו", "לאטה",
    }),
    # ── Restaurant / food ─────────────────────────────────────────────
    "restaurant": frozenset({
        "אוכל", "אוכלת", "אוכלים", "סלט", "פיתה",
        "חומוס", "שקשוקה", "מנה", "ארוחה",
        "תפריט", "מסעדה", "מרק", "לחם", "ביצה",
    }),
    # ── Shopping / prices ─────────────────────────────────────────────
    "shopping": frozenset({
        "עולה", "שקל", "שקלים", "חנות", "שוק",
        "מחיר", "יקר", "זול", "קנה", "קניתי", "תשלום",
    }),
    # ── Home / apartment ──────────────────────────────────────────────
    "home": frozenset({
        "דירה", "חדר", "חדרים", "מטבח", "סלון",
        "שירותים", "מרפסת", "מזגן", "שכר",
        "שכירות", "קומה", "מעלית", "חניה",
    }),
    # ── Directions / finding places ───────────────────────────────────
    "directions": frozenset({
        "דואר", "רחוב", "קרוב", "רחוק",
        "ימין", "שמאל", "ישר", "פינה",
        "ליד", "מול", "סופרמרקט", "תחנה",
    }),
    # ── Numbers ───────────────────────────────────────────────────────
    "numbers": frozenset({
        "אחד", "שניים", "שלושה", "ארבעה",
        "חמישה", "שש", "שבעה", "שמונה",
        "תשעה", "עשרה", "מספר", "כמה",
    }),
    # ── Time / schedule ───────────────────────────────────────────────
    "time": frozenset({
        "צהריים", "עכשיו", "מחר", "אתמול",
        "היום", "שעה", "מתי", "בשעה",
    }),
    # ── Studying / language ───────────────────────────────────────────
    "study": frozenset({
        "לומד", "לומדת", "לומדים", "עברית",
        "ערבית", "אנגלית", "שיעור", "קורס",
        "מילה", "כיתה", "ספר", "לימוד",
    }),
    # ── Phone / making plans ──────────────────────────────────────────
    "phone": frozenset({
        "טלפון", "פגישה", "נפגש", "נפגשת",
        "ים", "פארק", "בא", "באה", "באים",
    }),
}

# ─────────────────────────────────────────────────────────────────────────
# Suggestion packs: topic → 3 curated A1 suggestions
# Rules:
#   • ≤ 8 Hebrew words per suggestion
#   • Only common A1 vocabulary
#   • Natural question or statement a student would realistically say
#   • Ordered: most pedagogically useful first
# ─────────────────────────────────────────────────────────────────────────
_SUGGESTIONS: dict[str, list[str]] = {
    "greeting": [
        "מה שלומך?",
        "מה נשמע?",
        "בוקר טוב!",
    ],
    "identity": [
        "מה השם שלך?",
        "אתה סטודנט?",
        "מאיפה אתה?",
    ],
    "location": [
        "איפה אתה גר?",
        "את גרה בירושלים?",
        "זאת עיר גדולה?",
    ],
    "work": [
        "איפה אתה עובד?",
        "אתה עובד בבוקר?",
        "מה אתה עושה?",
    ],
    "family": [
        "יש לך ילדים?",
        "כמה ילדים יש לך?",
        "מי זאת?",
    ],
    "cafe": [
        "את רוצה קפה עם חלב?",
        "יש לכם תה?",
        "כמה זה עולה?",
    ],
    "restaurant": [
        "כמה זה עולה?",
        "יש לכם חומוס?",
        "אני רוצה מים, בבקשה.",
    ],
    "shopping": [
        "כמה זה עולה?",
        "זה יקר.",
        "יש לכם גדול יותר?",
    ],
    "home": [
        "כמה חדרים יש בדירה?",
        "יש מזגן בדירה?",
        "כמה שכר הדירה?",
    ],
    "directions": [
        "איפה הדואר?",
        "הדואר קרוב?",
        "תודה רבה!",
    ],
    "thanks": [
        "שלום!",
        "להתראות.",
        "יום טוב!",
    ],
    "numbers": [
        "כמה זה עולה?",
        "יש לך עוד אחד?",
        "שלושה, בבקשה.",
    ],
    "time": [
        "מתי אתה בא?",
        "עכשיו?",
        "בוקר טוב!",
    ],
    "study": [
        "מה אתה לומד?",
        "איפה אתה לומד עברית?",
        "עברית קשה?",
    ],
    "phone": [
        "מה המספר שלך?",
        "מתי אתה בא?",
        "איפה אנחנו נפגש?",
    ],
}

# Generic pack used when no topic cluster matches (or fallback was fired).
_GENERIC_A1: list[str] = [
    "מה שלומך?",
    "מאיפה אתה?",
    "מה אתה עושה?",
]

# Suggestions offered after a fallback response — encourage the student to
# retry with something the engine can actually handle.
_FALLBACK_RECOVERY: list[str] = [
    "מה השם שלך?",
    "איפה אתה גר?",
    "שלום!",
]

# Max suggestions returned
_MAX_SUGGESTIONS = 3


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def get_suggestions(
    answer_he: str,
    message: str,
    level: str,
    fallback_used: bool = False,
) -> list[str]:
    """
    Return up to ``_MAX_SUGGESTIONS`` A1-appropriate Hebrew prompts.

    Parameters
    ----------
    answer_he     : The Hebrew answer produced by the engine.
    message       : The original user message (used for extra topic signals).
    level         : Language level string, e.g. ``"A1"``.  Currently only A1
                    is supported; other levels silently fall back to A1 packs.
    fallback_used : When ``True`` the engine returned a fallback — return
                    recovery suggestions instead of topic suggestions.
    """
    if fallback_used:
        return list(_FALLBACK_RECOVERY)

    topic = _detect_topic(answer_he, message)
    pack = _SUGGESTIONS.get(topic, _GENERIC_A1)

    # Deduplicate against the user's own message so we don't suggest
    # what they just said.
    message_tokens = _he_tokens(message)
    filtered: list[str] = []
    for suggestion in pack:
        suggestion_tokens = _he_tokens(suggestion)
        # Skip suggestion if it is token-identical to the user message.
        if suggestion_tokens and suggestion_tokens == message_tokens:
            continue
        filtered.append(suggestion)
        if len(filtered) >= _MAX_SUGGESTIONS:
            break

    # If filtering emptied the list, return the generic pack.
    return filtered or list(_GENERIC_A1)[:_MAX_SUGGESTIONS]


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _detect_topic(answer_he: str, message: str) -> str:
    """
    Pick the topic whose keyword cluster overlaps most with the combined
    tokens of *answer_he* and *message*.

    Returns the topic name string, or ``"generic"`` if nothing matches.
    """
    combined_tokens = _he_tokens(answer_he) | _he_tokens(message)
    if not combined_tokens:
        return "generic"

    best_topic = "generic"
    best_score = 0

    for topic, keywords in _TOPIC_KEYWORDS.items():
        score = len(combined_tokens & keywords)
        if score > best_score:
            best_score = score
            best_topic = topic

    # Require at least one keyword match; otherwise stay generic.
    return best_topic if best_score > 0 else "generic"
