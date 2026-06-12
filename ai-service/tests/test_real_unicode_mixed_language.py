from __future__ import annotations

from services.chat_engine import generate_chat_response
from services.chat_intents import detect_intent, extract_hebrew_part, has_arabic
from services.chat_schemas import ChatRequest
from services.language_profile import detect_language_profile


AR_SHO_YAANI_BAYIT = "\u0634\u0648 \u064a\u0639\u0646\u064a \u05d1\u05d9\u05ea\u061f"
AR_MA_MAANA_TOR = "\u0645\u0627 \u0645\u0639\u0646\u0649 \u05ea\u05d5\u05e8\u061f"
AR_FINANCE_CRYPTO = (
    "\u0634\u0648 \u0623\u062e\u0628\u0627\u0631 "
    "\u0627\u0644\u0628\u0648\u0631\u0635\u0629 \u0648\u05e7\u05e8\u05d9\u05e4\u05d8\u05d5\u061f"
)


def test_real_unicode_arabic_hebrew_profile_and_intent():
    profile = detect_language_profile(AR_SHO_YAANI_BAYIT)
    intent = detect_intent(AR_SHO_YAANI_BAYIT, profile)

    assert profile.has_arabic is True
    assert profile.has_hebrew is True
    assert profile.is_mixed is True
    assert intent is not None
    assert intent.name == "WORD_MEANING"
    assert intent.target_word == "\u05d1\u05d9\u05ea"
    assert has_arabic(AR_SHO_YAANI_BAYIT)
    assert extract_hebrew_part(AR_SHO_YAANI_BAYIT) == "\u05d1\u05d9\u05ea"


def test_real_unicode_arabic_hebrew_word_meaning_skips_llm():
    response = generate_chat_response(
        ChatRequest(
            message=AR_MA_MAANA_TOR,
            level="A1",
            includeArabic=True,
            sessionId="real-unicode-word-meaning",
        )
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert response.answerAr


def test_real_unicode_off_topic_mixed_prompt_is_rejected_without_llm():
    response = generate_chat_response(
        ChatRequest(
            message=AR_FINANCE_CRYPTO,
            level="A1",
            includeArabic=True,
            sessionId="real-unicode-oos-finance",
        )
    )

    assert response.fallbackUsed is True
    assert response.fallbackReason == "OUT_OF_SCOPE"
    assert response.routerHit is False
