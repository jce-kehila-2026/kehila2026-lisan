from __future__ import annotations

import pytest

from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest


@pytest.fixture(autouse=True)
def _enable_local_shortcuts(monkeypatch):
    # Validates the opt-in fully-local mode (deterministic, no LLM). Default
    # mode routes free conversation to the LLM (test_conversation_routes_to_llm).
    monkeypatch.setenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", "true")


def _chat(message: str, *, include_arabic: bool = False, session_id: str = "reported-bugs"):
    return generate_chat_response(
        ChatRequest(
            message=message,
            level="A1",
            includeArabic=include_arabic,
            sessionId=session_id,
            userId=session_id,
        )
    )


def test_arabic_only_rejection_includes_arabic_guidance():
    response = _chat("\u0645\u0631\u062d\u0628\u0627", include_arabic=True, session_id="reported-ar-only")

    assert response.fallbackUsed is True
    assert response.fallbackReason == "MIXED_LANGUAGE"
    assert response.answerAr


def test_arabic_word_meaning_includes_arabic_answer():
    response = _chat(
        "\u0634\u0648 \u064a\u0639\u0646\u064a \u05d1\u05d9\u05ea?",
        include_arabic=True,
        session_id="reported-ar-meaning",
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert response.answerAr


def test_hebrew_sentence_with_number_is_local_and_not_vocab_leakage():
    response = _chat("\u05d0\u05e0\u05d9 \u05d1\u05df 25", session_id="reported-number")

    assert response.fallbackUsed is False
    assert response.fallbackReason is None
    assert response.routerHit is True
    assert response.latencyMs == 0
    assert "25" in response.answerHe


def test_single_hebrew_letter_does_not_reach_llm():
    response = _chat("\u05d0", session_id="reported-single-letter")

    assert response.fallbackUsed is True
    assert response.fallbackReason == "EMPTY_MESSAGE"
    assert response.routerHit is False
    assert response.latencyMs == 0


def test_punctuation_only_is_empty_message():
    response = _chat("?", session_id="reported-question-only")

    assert response.fallbackUsed is True
    assert response.fallbackReason == "EMPTY_MESSAGE"


def test_repeated_greeting_routes_locally():
    response = _chat(
        "\u05e9\u05dc\u05d5\u05dd \u05e9\u05dc\u05d5\u05dd \u05e9\u05dc\u05d5\u05dd",
        session_id="reported-repeated-greeting",
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert response.latencyMs == 0


def test_local_teaching_answers_end_with_followup_question():
    correction = _chat(
        "\u05d0\u05e0\u05d9 \u05e8\u05d5\u05e6\u05d4 \u05de\u05d9\u05dd",
        session_id="reported-followup-correction",
    )
    meaning = _chat(
        "\u05de\u05d4 \u05d6\u05d4 \u05d0\u05d5\u05de\u05e8 \u05d1\u05d9\u05ea?",
        session_id="reported-followup-meaning",
    )

    assert correction.fallbackUsed is False
    assert "?" in correction.answerHe
    assert meaning.fallbackUsed is False
    assert "?" in meaning.answerHe
