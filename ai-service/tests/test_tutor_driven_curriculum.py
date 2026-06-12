from __future__ import annotations

import pytest

from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest


@pytest.fixture(autouse=True)
def _enable_local_shortcuts(monkeypatch):
    # This file validates the OPT-IN fully-local "tutor-driven" mode (offline /
    # quota-saver). The DEFAULT production mode routes free conversation to the
    # LLM instead — see test_everyday_robustness.py and
    # test_conversation_routes_to_llm.py for the default behaviour.
    monkeypatch.setenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", "true")


def test_tutor_starts_food_practice_instead_of_asking_student_to_choose():
    response = generate_chat_response(
        ChatRequest(message="בוא נלמד אוכל", level="A1", includeArabic=False)
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert "קפה" in response.answerHe
    assert response.answerHe.endswith("?")


def test_arabic_start_request_is_tutor_driven_before_mixed_language_reject():
    response = generate_chat_response(
        ChatRequest(message="بدي أتعلم عن الطعام", level="A1", includeArabic=True)
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert "קפה" in response.answerHe
    assert response.answerAr is not None
    assert "اقترح" not in response.answerAr


def test_b1_doctor_topic_starts_health_practice():
    response = generate_chat_response(
        ChatRequest(message="שיחה עם דוקטור", level="B1", includeArabic=False)
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert "בריאות" in response.answerHe
    assert response.answerHe.endswith("?")


def test_short_practice_prompt_is_local_example():
    response = generate_chat_response(
        ChatRequest(message="תני לי משפט קצר לתרגל.", level="A1")
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert "חלב" in response.answerHe
    assert response.answerHe.endswith("?")


def test_short_place_answers_do_not_call_llm():
    for message in ["שועפט", "בבית"]:
        response = generate_chat_response(ChatRequest(message=message, level="A1"))

        assert response.fallbackUsed is False
        assert response.routerHit is True
        assert response.answerHe.endswith("?")


def test_basic_tutor_loop_stays_local_when_provider_is_quota_limited():
    cases = [
        "בסדר",
        "תלמד אותי משהו חדש",
        "שלום זה אלסלאם עליכום",
        "מה זה שלום",
        "יאללה",
        "קפה זה דבר שאנשים שותים",
    ]

    for message in cases:
        response = generate_chat_response(ChatRequest(message=message, level="A1"))

        assert response.fallbackUsed is False
        assert response.routerHit is True
        assert response.answerHe.endswith("?") or response.answerHe.endswith(".")


def test_arabic_greeting_answer_is_supported_locally():
    response = generate_chat_response(
        ChatRequest(message="السلام عليكم", level="A1", includeArabic=True)
    )

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert response.answerAr is not None


def test_any_new_word_definition_stays_local_without_known_word_list():
    cases = [
        "בננה זה פרי",
        "מחשב זה דבר בבית",
        "אופניים זה תחבורה",
    ]

    for message in cases:
        response = generate_chat_response(ChatRequest(message=message, level="A1"))

        assert response.fallbackUsed is False
        assert response.routerHit is True
        assert response.answerHe.endswith("?")


def test_unknown_word_meaning_does_not_hallucinate_or_call_llm():
    response = generate_chat_response(ChatRequest(message="מה זה אופניים", level="A1"))

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert "אופניים" in response.answerHe
    assert "מילה חדשה" in response.answerHe


def test_any_single_new_hebrew_word_gets_practice_prompt():
    for message in ["בננה", "מחשב", "אופניים"]:
        response = generate_chat_response(ChatRequest(message=message, level="A1"))

        assert response.fallbackUsed is False
        assert response.routerHit is True
        assert message in response.answerHe


def test_short_learner_sentence_with_new_word_stays_local():
    response = generate_chat_response(ChatRequest(message="אני אוהב בננה", level="A1"))

    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert "בננה" in response.answerHe


def test_scene_request_keeps_local_answers_in_same_setting():
    session_id = "scene-supermarket-regression"

    start = generate_chat_response(
        ChatRequest(
            message="בוא נעשה שיחה בסופר",
            level="A1",
            sessionId=session_id,
        )
    )
    word = generate_chat_response(
        ChatRequest(message="חלב", level="A1", sessionId=session_id)
    )
    sentence = generate_chat_response(
        ChatRequest(message="אני רוצה לחם", level="A1", sessionId=session_id)
    )
    thanks = generate_chat_response(
        ChatRequest(message="תודה", level="A1", sessionId=session_id)
    )

    assert start.fallbackUsed is False
    assert "בסופר" in start.answerHe
    assert "לקנות" in start.answerHe
    assert word.fallbackUsed is False
    assert "לקנות" in word.answerHe
    assert sentence.fallbackUsed is False
    assert "בסופר" in sentence.answerHe
    assert "לקנות" in sentence.answerHe
    assert thanks.fallbackUsed is False
    assert "בסופר" in thanks.answerHe
    assert "לקנות" in thanks.answerHe


def test_scene_cache_does_not_leak_between_different_settings():
    supermarket = "scene-cache-supermarket"
    clinic = "scene-cache-clinic"

    generate_chat_response(
        ChatRequest(message="שיחה בסופר", level="A1", sessionId=supermarket)
    )
    generate_chat_response(
        ChatRequest(message="שיחה עם דוקטור", level="B1", sessionId=clinic)
    )

    supermarket_reply = generate_chat_response(
        ChatRequest(message="בסדר", level="A1", sessionId=supermarket)
    )
    clinic_reply = generate_chat_response(
        ChatRequest(message="בסדר", level="B1", sessionId=clinic)
    )

    assert "לקנות" in supermarket_reply.answerHe
    assert "כואב" in clinic_reply.answerHe
    assert supermarket_reply.answerHe != clinic_reply.answerHe
