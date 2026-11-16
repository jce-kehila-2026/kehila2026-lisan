from __future__ import annotations

from services.chat_cache import CachedLevelBundle
from services.chat_guardrails import normalize_hebrew_token
from services.chat_schemas import ChatResponse, GuardrailReport

GREETING_RESPONSES = {
    # Every opener ends with an easy question so the learner always has a
    # next turn (a bare "שלום." left her nothing to answer).
    "שלום": "שלום! מה שלומך היום?",
    "היי": "היי! מה שלומך היום?",
    "הי": "היי! מה שלומך היום?",
    "בוקר טוב": "בוקר טוב! מה את עושה הבוקר?",
    "ערב טוב": "ערב טוב! איך היה היום שלך?",
    "לילה טוב": "לילה טוב! מה עשית היום?",
}
THANKS_RESPONSES = {
    "תודה": "בבקשה! על מה עוד את רוצה לדבר?",
    "תודה רבה": "בבקשה! על מה עוד את רוצה לדבר?",
}
# The tutor must never invent a human persona (a name, a city, a job).
# Previous fabricated answers ("אני עמל", "אני גר בתל אביב") taught the
# student false facts and leaked curriculum examples as the bot's identity.
# The tutor presents itself as the teacher and turns questions back to the
# student — which is also better pedagogy.
CURRICULUM_RESPONSES = {
    "מי את": "אני המורה שלך. ואת, איך קוראים לך?",
    "מי אתה": "אני המורה שלך. ואת, איך קוראים לך?",
    "מה שלומך": "הכל בסדר, תודה. ומה שלומך?",
    "מה נשמע": "הכל בסדר, תודה. ומה נשמע אצלך?",
    "אני רוצה קפה": "בסדר, קפה אחד. את רוצה קפה עם חלב?",
    "איפה אתה גר": "אני המורה שלך. ואת, איפה את גרה?",
    "איפה את גרה": "אני המורה שלך. ואת, איפה את גרה?",
    "מה השם שלך": "אני המורה שלך. איך קוראים לך?",
    "מה אתה עושה": "אני מלמדת עברית. ומה את עושה?",
    "מה את עושה": "אני מלמדת עברית. ומה את עושה?",
    "מה זה": "על מה את שואלת? כתבי לי מילה.",
    "מה זאת": "על מה את שואלת? כתבי לי מילה.",
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
    tokens = [
        normalize_hebrew_token(part)
        for part in text.split()
        if HEBREW_WORD_RE.search(part) and normalize_hebrew_token(part)
    ]
    if tokens and len(set(tokens)) == 1:
        return tokens[0]
    return " ".join(tokens).strip()

