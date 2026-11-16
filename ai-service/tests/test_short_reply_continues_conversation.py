"""Short answers mid-conversation must reach the LLM, not a canned reply.

Regression (verified live 2026-11-16): tutor asked "איזו פיצה את הכי אוהבת?",
student answered "כן" and got back the fixed "כן."; "לא" → "לא.";
"תודה" → "בבקשה! נמשיך לתרגל. מה זה חלב?" (topic jump). The conversation died.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from services import chat_engine as ce
from services.chat_provider import ProviderResult
from services.chat_schemas import ChatRequest


def _result(answer: str) -> ProviderResult:
    return ProviderResult(answer=answer, latency_seconds=0.01, input_tokens=10,
                          output_tokens=5, provider="openrouter", model="m")


@pytest.mark.parametrize("short", ["כן", "לא", "תודה", "שלום", "בסדר"])
def test_short_reply_after_tutor_question_goes_to_llm(monkeypatch, short):
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)
    calls = []

    def fake_call(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            return _result("פיצה זה טעים! את רוצה פיצה עם זיתים?")
        return _result("יופי! ואיזה משקה את רוצה עם הפיצה?")

    sid = f"sess-continue-{short}"
    with patch.object(ce, "call_provider", side_effect=fake_call):
        ce.generate_chat_response(ChatRequest(message="אני אוהבת פיצה", level="A1", sessionId=sid))
        reply = ce.generate_chat_response(ChatRequest(message=short, level="A1", sessionId=sid))

    assert len(calls) == 2, f"'{short}' was answered by a canned reply: {reply.answerHe!r}"
    assert reply.answerHe.endswith("?")


def test_first_message_greeting_can_stay_local(monkeypatch):
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)
    with patch.object(ce, "call_provider", side_effect=AssertionError("no LLM for a fresh greeting")):
        reply = ce.generate_chat_response(ChatRequest(message="שלום", level="A1", sessionId="fresh-greeting"))
    assert reply.answerHe
