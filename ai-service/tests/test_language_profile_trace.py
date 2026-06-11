from __future__ import annotations

import logging

from services.chat_intents import detect_intent, extract_hebrew_part
from services.chat_schemas import ChatRequest
from services.chat_engine import generate_chat_response
from services.chat_trace import ChatTrace
from services.language_profile import detect_language_profile


def test_language_profile_detects_mixed_arabic_hebrew():
    profile = detect_language_profile("شو يعني בית؟")
    assert profile.has_arabic is True
    assert profile.has_hebrew is True
    assert profile.is_mixed is True
    assert profile.primary_language == "mixed_arabic_hebrew"
    assert profile.source in {"lingua", "regex_fallback"}


def test_language_profile_falls_back_for_short_unknown_text():
    profile = detect_language_profile("123")
    assert profile.primary_language == "unknown"
    assert profile.confidence == 0.0


def test_clean_intent_detection_handles_arabic_hebrew():
    profile = detect_language_profile("ما معنى תור؟")
    intent = detect_intent("ما معنى תור؟", profile)
    assert intent is not None
    assert intent.name == "WORD_MEANING"
    assert intent.target_word == "תור"
    assert extract_hebrew_part("ما معنى תור؟") == "תור"


def test_chat_trace_logs_only_when_enabled(monkeypatch, caplog):
    monkeypatch.setenv("CHAT_DEBUG_TRACE", "true")
    profile = detect_language_profile("שלום")
    trace = ChatTrace.start(level="A1", session_id="trace-test", language_profile=profile)
    trace.add("cache_lookup", hit=False)
    with caplog.at_level(logging.INFO, logger="lisan.chat.trace"):
        trace.finish(outcome="answer", router_hit=True)
    assert "chat_trace" in caplog.text
    assert "cache_lookup" in caplog.text


def test_chat_trace_is_not_exposed_in_response(monkeypatch):
    monkeypatch.setenv("CHAT_DEBUG_TRACE", "true")
    response = generate_chat_response(ChatRequest(message="شو يعني בית؟", level="A1", includeArabic=True))
    payload = response.model_dump()
    assert "trace" not in payload
    assert response.fallbackUsed is False
    assert response.routerHit is True
