from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from services.chat_guardrails import normalize_hebrew_token
from services.chat_intents import extract_hebrew_part


BASE_DIR = Path(__file__).resolve().parents[1]
QUALITY_DIR = BASE_DIR / "data" / "chatbot_quality"
LOCAL_MEANINGS_PATH = QUALITY_DIR / "local_word_meanings.json"
KNOWN_PHRASES_PATH = QUALITY_DIR / "known_phrases.json"


@dataclass(frozen=True)
class TemplateAnswer:
    answer_he: str
    answer_ar: str | None = None
    reason: str = "TEMPLATE"
    cache_intent: str | None = None


def render_word_meaning(word: str | None) -> TemplateAnswer | None:
    normalized = normalize_hebrew_token(word or "")
    if not normalized:
        return None
    entry = local_word_meanings().get(normalized)
    if not entry:
        return None
    he = str(entry.get("he") or "").strip()
    ar = str(entry.get("ar") or "").strip() or None
    if not he:
        return None
    answer_he = f"{normalized}: {he}. לדוגמה: {normalized} טוב. תוכל לכתוב משפט עם {normalized}?"
    answer_ar = f"{normalized}: {ar}" if ar else None
    return TemplateAnswer(answer_he=answer_he, answer_ar=answer_ar, reason="LOCAL_WORD_MEANING", cache_intent=f"meaning:{normalized}")


def render_known_phrase(message: str, level: str) -> TemplateAnswer | None:
    normalized = _compact(extract_hebrew_part(message) or message)
    if not normalized:
        return None
    for phrase in known_phrases_for_level(level):
        if _compact(phrase) == normalized:
            if phrase == "תודה":
                answer_he = "בבקשה."
            else:
                answer_he = f"{phrase}."
            return TemplateAnswer(
                answer_he=answer_he,
                answer_ar=None,
                reason="KNOWN_PHRASE",
                cache_intent=f"phrase:{level.upper()}:{phrase}",
            )
    return None


def render_translation(message: str, target_word: str | None = None) -> TemplateAnswer | None:
    word = normalize_hebrew_token(target_word or _last_hebrew_word(message) or "")
    if not word:
        return None
    meaning = render_word_meaning(word)
    if meaning:
        return TemplateAnswer(
            answer_he=f"בערבית אומרים: {meaning.answer_ar or word}.",
            answer_ar=meaning.answer_ar,
            reason="LOCAL_TRANSLATION",
            cache_intent=f"translate:{word}",
        )
    return None


def render_correction(message: str) -> TemplateAnswer | None:
    normalized = _compact(extract_hebrew_part(message) or message)
    corrections = {
        "אני רוצים": "אומרים: אני רוצה.",
        "אני רוצה מים": "נכון: אני רוצה מים.",
        "היא גר בבית": "אומרים: היא גרה בבית.",
        "אתה גרה": "אומרים: אתה גר.",
        "את גר": "אומרים: את גרה.",
    }
    for wrong, answer in corrections.items():
        if _compact(wrong) in normalized:
            return TemplateAnswer(
                answer_he=_with_followup(answer),
                reason="LOCAL_CORRECTION",
                cache_intent=f"correction:{wrong}",
            )
    return None


def render_example(word: str | None) -> TemplateAnswer | None:
    normalized = normalize_hebrew_token(word or "")
    if not normalized:
        return None
    examples = {
        "בית": "הבית שלי בירושלים.",
        "תור": "יש לי תור לרופא.",
        "רופא": "הרופא מדבר לאט.",
        "מים": "אני רוצה מים.",
        "קפה": "אני רוצה קפה.",
    }
    answer = examples.get(normalized)
    if not answer:
        return None
    return TemplateAnswer(answer_he=f"דוגמה: {answer}", reason="LOCAL_EXAMPLE", cache_intent=f"example:{normalized}")


def render_ask_me(level: str) -> TemplateAnswer:
    questions = {
        "A1": "איפה אתה גר?",
        "A2": "מה אתה רוצה לשתות?",
        "B1": "איך קובעים תור בטלפון?",
        "B2": "איך מבקשים מנציג שירות לדבר לאט?",
    }
    return TemplateAnswer(answer_he=questions.get(level.upper(), questions["A1"]), reason="LOCAL_QUESTION", cache_intent=f"ask_me:{level.upper()}")


def render_formal_draft(message: str, level: str) -> TemplateAnswer | None:
    if level.upper() not in {"B1", "B2"}:
        return None
    if not re.search(r"(איחור|תור|בקשה|ערעור|רשמי|פורמלי|رسمي)", message or ""):
        return None
    answer = "אפשר לכתוב: שלום, אני מבקש/ת לעדכן שלא אוכל להגיע בזמן. תודה."
    return TemplateAnswer(answer_he=answer, reason="LOCAL_FORMAL_DRAFT", cache_intent=f"formal:{level.upper()}")


@lru_cache(maxsize=1)
def local_word_meanings() -> dict[str, dict[str, str]]:
    return _load_json_dict(LOCAL_MEANINGS_PATH)


@lru_cache(maxsize=1)
def known_phrases() -> dict[str, list[str]]:
    raw = _load_json_dict(KNOWN_PHRASES_PATH)
    return {
        str(level).upper(): [str(item) for item in values if str(item).strip()]
        for level, values in raw.items()
        if isinstance(values, list)
    }


def known_phrases_for_level(level: str) -> list[str]:
    levels = ["A1", "A2", "B1", "B2"]
    requested = (level or "A1").upper()
    upto = levels.index(requested) if requested in levels else 0
    phrases: list[str] = []
    for item_level in levels[: upto + 1]:
        phrases.extend(known_phrases().get(item_level, []))
    return phrases


def _load_json_dict(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _last_hebrew_word(text: str) -> str | None:
    words = re.findall(r"[\u0590-\u05ff]+", text or "")
    return words[-1] if words else None


def _compact(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _with_followup(answer: str) -> str:
    clean = (answer or "").strip()
    if not clean or "?" in clean:
        return clean
    return f"{clean} עכשיו תנסה משפט דומה?"
