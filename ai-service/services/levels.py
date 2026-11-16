"""
Single source of truth for student level normalization in the ai-service.

The canonical (content) level is always a CEFR code: A1 | A2 | B1 | B2.

Admins pick Hebrew display labels in the dashboard (א1, א2, ב1, ב2, ג), and
some legacy records store values such as "beginner". Every one of those must
map to a CEFR code here. Label "ג" has no content of its own: it maps to B2.

Unknown / empty values map to A1 (the safest, most lenient level) — never A2.
"""

from __future__ import annotations

CEFR_LEVELS = ("A1", "A2", "B1", "B2")
DEFAULT_CEFR_LEVEL = "A1"
BEGINNER_LEVELS = frozenset({"A1", "A2"})

_ALIASES: dict[str, str] = {
    # CEFR codes
    "A1": "A1",
    "A2": "A2",
    "B1": "B1",
    "B2": "B2",
    # Hebrew display labels (admin dashboard)
    "א1": "A1",
    "א2": "A2",
    "ב1": "B1",
    "ב2": "B2",
    "ג": "B2",
    "א": "A1",
    "ב": "B1",
    # Legacy English words
    "BEGINNER": "A1",
    "ELEMENTARY": "A2",
    "INTERMEDIATE": "B1",
    "ADVANCED": "B2",
}


def _clean(value: object) -> str:
    text = str(value or "").strip()
    # Drop geresh / gershayim / quotes / spaces / dashes: "א'1", "ב-2", "ג׳"
    for ch in ("'", '"', "׳", "״", " ", "-", "_", "."):
        text = text.replace(ch, "")
    return text.upper()


def normalize_cefr_level(level: object) -> str:
    """Map any stored/display level to a CEFR code (A1|A2|B1|B2)."""
    return _ALIASES.get(_clean(level), DEFAULT_CEFR_LEVEL)


def is_beginner_level(level: object) -> bool:
    return normalize_cefr_level(level) in BEGINNER_LEVELS
