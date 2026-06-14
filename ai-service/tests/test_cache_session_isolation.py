"""
test_cache_session_isolation.py

Guards the cross-session cache-leak fix (the "topic jump" bug from the 50-session
audit): identical context-dependent messages (summaries, corrections, "give me a
question") in DIFFERENT conversations must NOT be served each other's cached
answer. Only stateless global lookups (word meaning, greetings) may be cached.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from services import chat_engine as ce
from services.chat_provider import ProviderResult
from services.chat_schemas import ChatRequest


def _result(answer: str) -> ProviderResult:
    return ProviderResult(
        answer=answer,
        latency_seconds=0.01,
        input_tokens=10,
        output_tokens=5,
        provider="gemini",
        model="gemini-2.5-flash-lite",
    )


# Context-dependent meta-messages that used to collide across sessions.
CONTEXT_DEPENDENT = [
    "תסכם לי שלוש מילים חשובות מהשיחה",
    "תן לי שאלה אחת על המשפחה",
    "תן לי דיאלוג קצר עם מלצר",
]


@pytest.mark.parametrize("message", CONTEXT_DEPENDENT)
def test_context_message_does_not_leak_across_sessions(monkeypatch, message):
    """Same message, two different sessions → two LLM calls, distinct answers."""
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)
    calls = {"n": 0}

    def fake_call(*args, **kwargs):
        calls["n"] += 1
        return _result(f"תשובה מספר {calls['n']} בעברית פשוטה.")

    with patch.object(ce, "call_provider", side_effect=fake_call):
        first = ce.generate_chat_response(
            ChatRequest(message=message, level="A1", sessionId="sess-A")
        )
        second = ce.generate_chat_response(
            ChatRequest(message=message, level="A1", sessionId="sess-B")
        )

    assert calls["n"] == 2, "second session was wrongly served a cached answer"
    assert second.cacheHit is False
    assert first.answerHe != second.answerHe


def test_word_meaning_is_globally_cached(monkeypatch):
    """A stateless 'מה זה X' lookup is identical across sessions and may cache."""
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)
    calls = {"n": 0}

    def fake_call(*args, **kwargs):
        calls["n"] += 1
        return _result("מקרר זה מכשיר ששומר אוכל קר.")

    with patch.object(ce, "call_provider", side_effect=fake_call):
        first = ce.generate_chat_response(
            ChatRequest(message="מה זה מקרר", level="A1", sessionId="sess-1")
        )
        second = ce.generate_chat_response(
            ChatRequest(message="מה זה מקרר", level="A1", sessionId="sess-2")
        )

    # Word meaning is context-independent → second call is served from cache
    # (or the same deterministic answer); the provider is not called twice.
    assert calls["n"] <= 1
    assert first.answerHe == second.answerHe


def test_legacy_mode_still_caches_repeats(monkeypatch):
    """With the opt-in flag, the broad repeat-question cache still works."""
    monkeypatch.setenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", "true")
    calls = {"n": 0}

    def fake_call(*args, **kwargs):
        calls["n"] += 1
        return _result("יופי. נמשיך לתרגל בעברית.")

    with patch.object(ce, "call_provider", side_effect=fake_call):
        ce.generate_chat_response(
            ChatRequest(message="תן לי שאלה אחת על המשפחה", level="B2", sessionId="L1")
        )
        second = ce.generate_chat_response(
            ChatRequest(message="תן לי שאלה אחת על המשפחה", level="B2", sessionId="L2")
        )

    # Legacy mode keeps the old behaviour: the identical repeat hits the cache.
    assert second.cacheHit is True
