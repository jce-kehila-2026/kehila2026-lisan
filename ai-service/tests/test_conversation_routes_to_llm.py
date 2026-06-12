"""
test_conversation_routes_to_llm.py

Locks in the DEFAULT product behaviour (ENABLE_LOCAL_CONVERSATION_SHORTCUTS
unset/false): free-text CONVERSATION reaches the LLM (with memory), instead of
being answered by canned local templates — while deterministic lookups stay
local and free.

The user's report: a supermarket role-play handled entirely by local templates
felt robotic. These tests guarantee conversation now goes to the model.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from services import chat_engine
from services.chat_provider import ProviderResult
from services.chat_schemas import ChatRequest


@pytest.fixture(autouse=True)
def _default_mode(monkeypatch):
    # Be explicit: default (conversational) mode, shortcuts OFF.
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)


def _stub(*args, **kwargs):
    return ProviderResult(
        answer="בטח! קפה אחד. עוד משהו?",
        latency_seconds=0.01,
        input_tokens=20,
        output_tokens=8,
        provider="gemini",
        model="gemini-2.5-flash-lite",
    )


# Free-text conversational turns — exactly the supermarket-style inputs that
# used to be answered by robotic local templates. They must now reach the LLM.
CONVERSATION_TURNS = [
    "יאללה שיחה בסופר",
    "אני רוצה לקנות חלב",
    "מסטיק",
    "אני אוהב לאכול פיצה",
    "ספר לי על ירושלים",
]


@pytest.mark.parametrize("message", CONVERSATION_TURNS)
def test_conversation_reaches_llm(message):
    calls = {"n": 0}

    def spy(*a, **k):
        calls["n"] += 1
        return _stub()

    with patch.object(chat_engine, "call_provider", side_effect=spy):
        chat_engine.generate_chat_response(
            ChatRequest(message=message, level="A1", sessionId="conv-llm")
        )
    assert calls["n"] >= 1, f"conversational turn did NOT reach the LLM: {message!r}"


# Deterministic lookups must STILL be local (no LLM) even in default mode.
def test_word_meaning_glossary_stays_local():
    with patch.object(chat_engine, "call_provider", side_effect=AssertionError("LLM!")):
        r = chat_engine.generate_chat_response(
            ChatRequest(message="מה זה בית", level="A1", sessionId="det-1")
        )
    assert r.fallbackUsed is False
    assert "בית" in r.answerHe


def test_thanks_stays_local():
    with patch.object(chat_engine, "call_provider", side_effect=AssertionError("LLM!")):
        r = chat_engine.generate_chat_response(
            ChatRequest(message="תודה", level="A1", sessionId="det-2")
        )
    assert r.fallbackUsed is False
    assert "בבקשה" in r.answerHe


def test_abstract_topic_still_rejected_at_a1():
    with patch.object(chat_engine, "call_provider", side_effect=AssertionError("LLM!")):
        r = chat_engine.generate_chat_response(
            ChatRequest(message="מה זה קריפטו", level="A1", sessionId="det-3")
        )
    assert r.fallbackUsed is True
    assert r.fallbackReason == "OUT_OF_SCOPE"
