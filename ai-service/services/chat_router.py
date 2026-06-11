from __future__ import annotations

from services.chat_cache import CachedLevelBundle
from services.chat_guardrails import normalize_hebrew_token
from services.chat_schemas import ChatResponse, GuardrailReport

GREETING_RESPONSES = {
    "שלום": "שלום.",
    "היי": "שלום.",
    "הי": "שלום.",
    "בוקר טוב": "בוקר טוב.",
    "ערב טוב": "ערב טוב.",
    "לילה טוב": "לילה טוב.",
}
THANKS_RESPONSES = {
    "תודה": "בבקשה.",
    "תודה רבה": "בבקשה.",
}
# The tutor must never invent a human persona (a name, a city, a job).
# Previous fabricated answers ("אני עמל", "אני גר בתל אביב") taught the
# student false facts and leaked curriculum examples as the bot's identity.
# The tutor presents itself as the teacher and turns questions back to the
# student — which is also better pedagogy.
CURRICULUM_RESPONSES = {
    "מי את": "אני המורה שלך. מי אתה?",
    "מי אתה": "אני המורה שלך. מי אתה?",
    "מה שלומך": "הכל בסדר. מה שלומך?",
    "מה נשמע": "הכל בסדר. מה נשמע?",
    "אני רוצה קפה": "בסדר. קפה אחד.",
    "איפה אתה גר": "אני המורה שלך, לא גר בעיר. איפה אתה גר?",
    "איפה את גרה": "אני המורה שלך, לא גרה בעיר. איפה את גרה?",
    "מה השם שלך": "אני המורה שלך. איך קוראים לך?",
    "מה אתה עושה": "אני מלמד עברית. מה אתה עושה?",
    "מה את עושה": "אני מלמד עברית. מה את עושה?",
    "מה זה": "על מה אתה שואל? תראה לי מילה.",
    "מה זאת": "על מה אתה שואל? תראה לי מילה.",
    "כן": "כן.",
    "לא": "לא.",
}


def route_message(
    message: str,
    bundle: CachedLevelBundle,
    level: str,
    model: str,
    include_arabic: bool,
) -> ChatResponse | None:
    del include_arabic

    normalized_message = " ".join((message or "").split())
    if not normalized_message:
        return None

    normalized_question = _normalize_question_key(normalized_message)
    if not normalized_question:
        return None

    if normalized_question in GREETING_RESPONSES:
        return _build_router_response(
            answer_he=GREETING_RESPONSES[normalized_question],
            level=level,
            model=model,
        )

    if normalized_question in THANKS_RESPONSES:
        return _build_router_response(
            answer_he=THANKS_RESPONSES[normalized_question],
            level=level,
            model=model,
        )

    # NOTE: the auto-extracted bundle.question_answer_map was intentionally
    # removed from routing. It returned raw transcript lines (e.g. broken
    # fragments ending in a colon) and short-circuited RAG, so curriculum
    # questions never reached the leading-teacher LLM. Those questions now flow
    # to RAG + the model. Only the small, curated maps below short-circuit.

    if normalized_question in CURRICULUM_RESPONSES:
        return _build_router_response(
            answer_he=CURRICULUM_RESPONSES[normalized_question],
            level=level,
            model=model,
        )

    if " " not in normalized_question and normalized_question in bundle.glossary:
        return _build_router_response(
            answer_he=bundle.glossary[normalized_question],
            level=level,
            model=model,
        )

    return None


def _build_router_response(
    answer_he: str,
    level: str,
    model: str,
) -> ChatResponse:
    return ChatResponse(
        answerHe=answer_he,
        answerAr=None,
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
    from services.chat_guardrails import HEBREW_WORD_RE
    # Only include tokens that contain at least one Hebrew character.
    # This lets mixed Arabic+Hebrew messages (e.g. "שלום مرحبا") normalise
    # to their Hebrew content ("שלום") and match greeting/curriculum entries.
    return " ".join(
        normalize_hebrew_token(part)
        for part in text.split()
        if HEBREW_WORD_RE.search(part) and normalize_hebrew_token(part)
    ).strip()

