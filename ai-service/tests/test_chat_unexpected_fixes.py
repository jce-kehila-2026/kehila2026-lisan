from __future__ import annotations

from unittest.mock import patch

from services.chat_cache import EXACT_RESPONSE_CACHE
from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest


def _no_provider(*args, **kwargs):
    raise AssertionError("provider should not be called for deterministic paths")


def test_ambiguous_short_question_asks_for_clarification_without_rag():
    with patch("services.chat_engine.call_provider", side_effect=_no_provider):
        response = generate_chat_response(ChatRequest(message="כמה?", level="A1"))

    assert response.fallbackUsed is False
    assert response.contextChunkIds == []
    assert "שואל" in response.answerHe


def test_known_curriculum_question_uses_extractive_rag_without_provider():
    with patch("services.chat_engine.call_provider", side_effect=_no_provider):
        response = generate_chat_response(
            ChatRequest(message="כמה עולה האבטיח?", level="A1")
        )

    assert response.fallbackUsed is False
    assert response.routerHit is False
    assert response.contextChunkIds
    assert "שקל" in response.answerHe


def test_exact_repeat_curriculum_question_hits_cache_after_extractive_answer():
    request = ChatRequest(message="מה יש בתיק?", level="A1")

    with patch("services.chat_engine.call_provider", side_effect=_no_provider):
        first = generate_chat_response(request)
        second = generate_chat_response(request)

    assert first.fallbackUsed is False
    assert second.fallbackUsed is False
    assert second.cacheHit is True


def test_session_name_memory_is_isolated_by_session():
    with patch("services.chat_engine.call_provider", side_effect=_no_provider):
        generate_chat_response(
            ChatRequest(message="קוראים לי רון", level="A1", sessionId="s-one")
        )
        same_session = generate_chat_response(
            ChatRequest(message="איך קוראים לי?", level="A1", sessionId="s-one")
        )
        other_session = generate_chat_response(
            ChatRequest(message="איך קוראים לי?", level="A1", sessionId="s-two")
        )

    assert "רון" in same_session.answerHe
    assert "רון" not in other_session.answerHe


def test_unknown_drink_preference_does_not_call_provider_or_guess():
    with patch("services.chat_engine.call_provider", side_effect=_no_provider):
        response = generate_chat_response(
            ChatRequest(message="מה אני רוצה לשתות?", level="A1", sessionId="drink-new")
        )

    assert response.fallbackUsed is False
    assert "קפה" not in response.answerHe
    assert "חלב" not in response.answerHe
    assert "לא יודע" in response.answerHe


def test_repeat_request_uses_previous_deterministic_turn():
    with patch("services.chat_engine.call_provider", side_effect=_no_provider):
        first = generate_chat_response(
            ChatRequest(message="איפה הדואר?", level="A1", sessionId="repeat-s")
        )
        repeated = generate_chat_response(
            ChatRequest(message="תגיד שוב", level="A1", sessionId="repeat-s")
        )

    assert first.fallbackUsed is False
    assert repeated.fallbackUsed is False
    assert repeated.answerHe == first.answerHe


def test_cached_curriculum_answer_is_remembered_for_pronoun_followup():
    EXACT_RESPONSE_CACHE.clear()

    with patch("services.chat_engine.call_provider", side_effect=_no_provider):
        seed = generate_chat_response(
            ChatRequest(message="כמה עולה האבטיח?", level="A1")
        )
        first = generate_chat_response(
            ChatRequest(
                message="כמה עולה האבטיח?",
                level="A1",
                sessionId="watermelon-cache-s",
            )
        )
        followup = generate_chat_response(
            ChatRequest(
                message="וכמה הוא עולה?",
                level="A1",
                sessionId="watermelon-cache-s",
            )
        )

    assert seed.fallbackUsed is False
    assert first.cacheHit is True
    assert followup.fallbackUsed is False
    assert "שקל" in followup.answerHe
