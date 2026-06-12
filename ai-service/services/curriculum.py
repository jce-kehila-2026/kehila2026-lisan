from __future__ import annotations

import re
from dataclasses import dataclass


LEVEL_RANKS = {"A1": 1, "A2": 2, "B1": 3, "B2": 4}


@dataclass(frozen=True)
class CurriculumLevel:
    level: str
    words_by_topic: dict[str, list[str]]
    conversation_topics: list[str]


CURRICULUM: dict[str, CurriculumLevel] = {
    "A1": CurriculumLevel(
        level="A1",
        words_by_topic={
            "greetings": ["שלום", "תודה", "בוקר", "ערב"],
            "food": ["קפה", "מים", "לחם", "תפוח"],
            "supermarket": ["חלב", "לחם", "מים", "תפוח"],
            "places": ["בית", "חנות", "דואר", "כיתה"],
            "people": ["אני", "אתה", "היא", "שם"],
        },
        conversation_topics=["food", "supermarket", "greetings", "names", "places"],
    ),
    "A2": CurriculumLevel(
        level="A2",
        words_by_topic={
            "food": ["ארוחה", "חלב", "סוכר", "שוק"],
            "places": ["תחנה", "רחוב", "מרכז", "מרפאה"],
            "health": ["רופא", "תור", "כואב", "חולה"],
            "time": ["היום", "מחר", "שעה", "בוקר"],
        },
        conversation_topics=["shopping", "directions", "simple_health", "daily_schedule"],
    ),
    "B1": CurriculumLevel(
        level="B1",
        words_by_topic={
            "health": ["בריאות", "דוקטור", "מרפאה", "תרופה", "בדיקה"],
            "work": ["עבודה", "משרד", "פגישה", "מכתב"],
            "services": ["בנק", "עירייה", "טופס", "תור"],
        },
        conversation_topics=["doctor_visits", "work", "public_services"],
    ),
    "B2": CurriculumLevel(
        level="B2",
        words_by_topic={
            "public_life": ["כלכלה", "פוליטיקה", "חברה", "חוק"],
            "finance": ["בורסה", "מניות", "השקעות", "ביטקוין"],
            "abstract": ["פילוסופיה", "אלגוריתמים", "טכנולוגיה", "מחקר"],
        },
        conversation_topics=["public_life", "finance", "abstract_discussion"],
    ),
}

TOPIC_ALIASES = {
    "food": {"food", "אוכל", "מסעדה", "קפה", "طعام", "اكل", "أكل", "مطعم", "قهوة"},
    "supermarket": {"supermarket", "סופר", "סופרמרקט", "שוק", "קניות", "بقالة", "سوبر", "سوبرماركت", "مشتريات"},
    "health": {"health", "בריאות", "רופא", "דוקטור", "מרפאה", "طبيب", "دكتور", "صحة", "عيادة"},
    "places": {"places", "מקום", "בית", "חנות", "أماكن", "مكان", "بيت"},
    "greetings": {"greetings", "שלום", "تحية", "سلام"},
}

_ARABIC_START_RE = re.compile(r"(?:ابد[اأ]؟|بلش|علمني|علّم|اتعلم|تعلم|ندرس|نتدرب|موضوع|درس)")
_HEBREW_START_RE = re.compile(r"(?:בוא נלמד|תלמד|נתרגל|נלמד|שיעור|נושא|שיחה)")


def normalize_level(level: str | None) -> str:
    normalized = (level or "A1").strip().upper()
    return normalized if normalized in LEVEL_RANKS else "A1"


def level_rank(level: str | None) -> int:
    return LEVEL_RANKS[normalize_level(level)]


def get_curriculum(level: str | None) -> CurriculumLevel:
    return CURRICULUM[normalize_level(level)]


def _find_requested_topic(message: str) -> str | None:
    lowered = (message or "").lower()
    for topic, aliases in TOPIC_ALIASES.items():
        if any(alias.lower() in lowered for alias in aliases):
            return topic
    return None


def looks_like_tutor_driven_request(message: str) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if _HEBREW_START_RE.search(text):
        return True
    if _ARABIC_START_RE.search(text) and _find_requested_topic(text) is not None:
        return True
    return _find_requested_topic(text) is not None and any(
        marker in text for marker in ("שיחה", "ללמוד", "תרגול", "محادثة", "تعلم", "درس")
    )


def allowed_words_up_to(level: str | None) -> set[str]:
    max_rank = level_rank(level)
    words: set[str] = set()
    for curr_level, curriculum in CURRICULUM.items():
        if LEVEL_RANKS[curr_level] <= max_rank:
            for topic_words in curriculum.words_by_topic.values():
                words.update(topic_words)
    return words


def word_complexity(word: str) -> int | None:
    for curr_level, curriculum in CURRICULUM.items():
        for topic_words in curriculum.words_by_topic.values():
            if word in topic_words:
                return LEVEL_RANKS[curr_level]
    return None


def build_tutor_prompt(level: str | None, message: str) -> tuple[str, str | None]:
    resolved_level = normalize_level(level)
    curriculum = get_curriculum(resolved_level)
    requested_topic = _find_requested_topic(message)
    topic = requested_topic if requested_topic in curriculum.words_by_topic else curriculum.conversation_topics[0]
    words = curriculum.words_by_topic.get(topic)
    if not words:
        first_topic = next(iter(curriculum.words_by_topic))
        topic = first_topic
        words = curriculum.words_by_topic[first_topic]

    word = words[0]
    answer_he = f"היום נתרגל {word}. מה זה {word}?"
    answer_ar = None
    if re.search(r"[\u0600-\u06FF]", message or ""):
        answer_ar = f"اليوم أنا أختار لك كلمة مناسبة لمستواك: {word}. حاول تجاوب بالعبرية."
    return answer_he, answer_ar
