from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache


ARABIC_SCRIPT_RE = re.compile(r"[\u0600-\u06ff]")
HEBREW_SCRIPT_RE = re.compile(r"[\u0590-\u05ff]")
LATIN_SCRIPT_RE = re.compile(r"[A-Za-z]")


@dataclass(frozen=True)
class LanguageProfile:
    primary_language: str
    has_arabic: bool
    has_hebrew: bool
    has_latin: bool
    is_mixed: bool
    confidence: float
    source: str

    def as_log_dict(self) -> dict[str, object]:
        return {
            "primaryLanguage": self.primary_language,
            "hasArabic": self.has_arabic,
            "hasHebrew": self.has_hebrew,
            "hasLatin": self.has_latin,
            "isMixed": self.is_mixed,
            "confidence": round(self.confidence, 4),
            "source": self.source,
        }


def detect_language_profile(text: str) -> LanguageProfile:
    value = text or ""
    regex_profile = _regex_profile(value)
    lingua_profile = _lingua_profile(value, regex_profile)
    if lingua_profile is None:
        return regex_profile
    return lingua_profile


def _regex_profile(text: str) -> LanguageProfile:
    has_arabic = bool(ARABIC_SCRIPT_RE.search(text))
    has_hebrew = bool(HEBREW_SCRIPT_RE.search(text))
    has_latin = bool(LATIN_SCRIPT_RE.search(text))
    scripts_count = sum([has_arabic, has_hebrew, has_latin])
    if has_arabic and has_hebrew:
        primary = "mixed_arabic_hebrew"
        confidence = 0.95
    elif has_hebrew:
        primary = "hebrew"
        confidence = 0.9
    elif has_arabic:
        primary = "arabic"
        confidence = 0.9
    elif has_latin:
        primary = "latin"
        confidence = 0.65
    else:
        primary = "unknown"
        confidence = 0.0
    return LanguageProfile(
        primary_language=primary,
        has_arabic=has_arabic,
        has_hebrew=has_hebrew,
        has_latin=has_latin,
        is_mixed=scripts_count >= 2,
        confidence=confidence,
        source="regex_fallback",
    )


def _lingua_profile(text: str, regex_profile: LanguageProfile) -> LanguageProfile | None:
    stripped = (text or "").strip()
    if len(stripped) < 8:
        return None
    detector = _lingua_detector()
    if detector is None:
        return None
    try:
        confidence_values = detector.compute_language_confidence_values(stripped)
    except Exception:
        return None
    if not confidence_values:
        return None

    best = confidence_values[0]
    best_name = str(best.language.name).lower()
    best_confidence = float(best.value)
    lingua_language = {
        "arabic": "arabic",
        "hebrew": "hebrew",
        "english": "latin",
    }.get(best_name, best_name)

    if regex_profile.has_arabic and regex_profile.has_hebrew:
        primary = "mixed_arabic_hebrew"
        confidence = max(regex_profile.confidence, best_confidence)
    elif regex_profile.has_hebrew:
        primary = "hebrew"
        confidence = max(0.75, best_confidence)
    elif regex_profile.has_arabic:
        primary = "arabic"
        confidence = max(0.75, best_confidence)
    else:
        primary = lingua_language
        confidence = best_confidence

    return LanguageProfile(
        primary_language=primary,
        has_arabic=regex_profile.has_arabic,
        has_hebrew=regex_profile.has_hebrew,
        has_latin=regex_profile.has_latin,
        is_mixed=regex_profile.is_mixed,
        confidence=confidence,
        source="lingua",
    )


@lru_cache(maxsize=1)
def _lingua_detector():
    try:
        from lingua import Language, LanguageDetectorBuilder  # type: ignore
    except Exception:
        return None
    try:
        return (
            LanguageDetectorBuilder
            .from_languages(Language.ARABIC, Language.HEBREW, Language.ENGLISH)
            .with_preloaded_language_models()
            .build()
        )
    except Exception:
        return None
