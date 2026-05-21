from __future__ import annotations

from services.chat_cache import CachedLevelBundle
from services.chat_guardrails import normalize_hebrew_token
from services.chat_schemas import ChatResponse, GuardrailReport

GREETING_RESPONSES = {
    "שלום": ("שלום.", "مرحبا."),
    "היי": ("שלום.", "مرحبا."),
    "הי": ("שלום.", "مرحبا."),
}
THANKS_RESPONSES = {
    "תודה": ("בבקשה.", "العفو."),
    "תודה רבה": ("בבקשה.", "العفو."),
}
CURRICULUM_RESPONSES = {
    "מי את": "אני עמל.",
    "מי אתה": "אני עידו.",
    "מה שלומך": "הכל בסדר. תודה.",
    "איפה הדואר": "הדואר ליד החנות.",
    "אני רוצה קפה": "בסדר. קפה אחד.",
    "איפה אתה גר": "אני גר בתל אביב.",
    "מה השם שלך": "אני עמל.",
    "מה אתה עושה": "אני עובד.",
    "מה זה": "זה ספר.",
}


def route_message(
    message: str,
    bundle: CachedLevelBundle,
    level: str,
    model: str,
    include_arabic: bool,
) -> ChatResponse | None:
    normalized_message = " ".join((message or "").split())
    if not normalized_message:
        return None

    if normalized_message in GREETING_RESPONSES:
        answer_he, answer_ar = GREETING_RESPONSES[normalized_message]
        return _build_router_response(
            answer_he=answer_he,
            answer_ar=answer_ar if include_arabic else None,
            level=level,
            model=model,
        )

    if normalized_message in THANKS_RESPONSES:
        answer_he, answer_ar = THANKS_RESPONSES[normalized_message]
        return _build_router_response(
            answer_he=answer_he,
            answer_ar=answer_ar if include_arabic else None,
            level=level,
            model=model,
        )

    normalized_question = _normalize_question_key(normalized_message)
    if normalized_question and normalized_question in bundle.question_answer_map:
        return _build_router_response(
            answer_he=bundle.question_answer_map[normalized_question],
            answer_ar=None,
            level=level,
            model=model,
        )

    if normalized_question and normalized_question in CURRICULUM_RESPONSES:
        return _build_router_response(
            answer_he=CURRICULUM_RESPONSES[normalized_question],
            answer_ar=None,
            level=level,
            model=model,
        )

    if " " not in normalized_message and normalized_message in bundle.glossary:
        return _build_router_response(
            answer_he=normalized_message,
            answer_ar=bundle.glossary[normalized_message] if include_arabic else None,
            level=level,
            model=model,
        )

    return None


def _build_router_response(
    answer_he: str,
    answer_ar: str | None,
    level: str,
    model: str,
) -> ChatResponse:
    return ChatResponse(
        answerHe=answer_he,
        answerAr=answer_ar,
        fallbackUsed=False,
        fallbackReason=None,
        level=level,
        model=model,
        latencyMs=0,
        cacheHit=False,
        routerHit=True,
        contextChunkIds=[],
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
    )


def _normalize_question_key(text: str) -> str:
    return " ".join(
        normalize_hebrew_token(part)
        for part in text.split()
        if normalize_hebrew_token(part)
    ).strip()
