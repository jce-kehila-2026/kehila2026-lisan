"""
Day 1 acceptance tests for the chat endpoint.
Tests cover: schema validation, fallback behavior, guardrails, and no-crash guarantee.

Run:
    cd ai-service
    python -m pytest tests/test_day1_chat_endpoint.py -v

Requires:
    pip install pytest httpx
    GEMINI_API_KEY set in .env (for live LLM tests)
"""

from __future__ import annotations

import time
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
CHAT_URL = "/api/ai/chat"

REQUIRED_FIELDS = {
    "answerHe", "answerAr", "fallbackUsed", "fallbackReason",
    "level", "model", "latencyMs", "contextChunkIds", "guardrail",
}
GUARDRAIL_FIELDS = {"vocabularyLeakage", "blockedTokens"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def post_chat(message: str, level: str = "A1", includeArabic: bool = False):
    return client.post(CHAT_URL, json={
        "message": message,
        "level": level,
        "includeArabic": includeArabic,
    })


def assert_valid_schema(data: dict):
    """Every response — success or fallback — must have the full schema."""
    missing = REQUIRED_FIELDS - set(data.keys())
    assert not missing, f"Missing fields: {missing}"
    assert isinstance(data["answerHe"], str) and len(data["answerHe"]) > 0
    assert isinstance(data["fallbackUsed"], bool)
    assert isinstance(data["latencyMs"], int) and data["latencyMs"] >= 0
    assert isinstance(data["contextChunkIds"], list)
    assert isinstance(data["guardrail"], dict)
    guardrail_missing = GUARDRAIL_FIELDS - set(data["guardrail"].keys())
    assert not guardrail_missing, f"Missing guardrail fields: {guardrail_missing}"
    assert isinstance(data["guardrail"]["vocabularyLeakage"], bool)
    assert isinstance(data["guardrail"]["blockedTokens"], list)
    if data["fallbackUsed"]:
        assert data["fallbackReason"] is not None
    else:
        assert data["fallbackReason"] is None


# ===========================================================================
# 1. SCHEMA TESTS — every response must match the contract
# ===========================================================================

class TestSchema:
    """The JSON contract must hold for every type of response."""

    def test_valid_hebrew_question_returns_full_schema(self):
        r = post_chat("מה השם שלך?")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_fallback_response_has_full_schema(self):
        r = post_chat("")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_level_field_matches_request(self):
        r = post_chat("שלום", level="A1")
        assert r.json()["level"] == "A1"

    def test_model_field_is_not_empty(self):
        r = post_chat("שלום")
        assert len(r.json()["model"]) > 0


# ===========================================================================
# 2. FALLBACK TESTS — bad inputs must trigger fallback, not crash
# ===========================================================================

class TestFallback:
    """Fast-reject and guardrail paths must return fallback, never 500."""

    def test_empty_message_triggers_fallback(self):
        r = post_chat("")
        data = r.json()
        assert r.status_code == 200
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "EMPTY_MESSAGE"

    def test_whitespace_only_triggers_fallback(self):
        r = post_chat("   ")
        data = r.json()
        assert r.status_code == 200
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "EMPTY_MESSAGE"

    def test_english_triggers_fallback(self):
        r = post_chat("Hello, how are you?")
        data = r.json()
        assert r.status_code == 200
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MIXED_LANGUAGE"

    def test_arabic_triggers_fallback(self):
        r = post_chat("مرحبا كيف حالك؟")
        data = r.json()
        assert r.status_code == 200
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MIXED_LANGUAGE"

    def test_mixed_hebrew_english_triggers_fallback(self):
        r = post_chat("שלום hello")
        data = r.json()
        assert r.status_code == 200
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MIXED_LANGUAGE"

    def test_fallback_latency_is_zero_for_fast_reject(self):
        r = post_chat("")
        data = r.json()
        assert data["latencyMs"] == 0, "Fast reject should not call LLM"

    def test_fallback_has_no_vocabulary_leakage(self):
        r = post_chat("")
        data = r.json()
        assert data["guardrail"]["vocabularyLeakage"] is False
        assert data["guardrail"]["blockedTokens"] == []


# ===========================================================================
# 3. VALID HEBREW QUESTIONS — LLM is called, answer is checked
# ===========================================================================

VALID_HEBREW_QUESTIONS = [
    "מה השם שלך?",
    "מאיפה אתה?",
    "מה שלומך?",
    "איפה אתה גר?",
    "מה אתה עושה?",
    "מי את?",
    "מי אתה?",
    "שלום",
    "תודה",
    "מה זה?",
]


class TestValidQuestions:
    """10 valid Hebrew questions — all must return 200 with stable JSON."""

    @pytest.mark.parametrize("question", VALID_HEBREW_QUESTIONS)
    def test_valid_question_returns_200(self, question: str):
        r = post_chat(question)
        assert r.status_code == 200, f"Question '{question}' returned {r.status_code}"
        assert_valid_schema(r.json())

    @pytest.mark.parametrize("question", VALID_HEBREW_QUESTIONS)
    def test_valid_question_has_hebrew_answer(self, question: str):
        r = post_chat(question)
        data = r.json()
        if not data["fallbackUsed"]:
            import re
            assert re.search(r"[֐-׿]", data["answerHe"]), \
                f"Non-fallback answer has no Hebrew: {data['answerHe']}"

    @pytest.mark.parametrize("question", VALID_HEBREW_QUESTIONS)
    def test_valid_question_no_vocabulary_leakage(self, question: str):
        r = post_chat(question)
        data = r.json()
        assert data["guardrail"]["vocabularyLeakage"] is False, \
            f"Leakage detected: {data['guardrail']['blockedTokens']}"


# ===========================================================================
# 4. NO-CRASH TESTS — weird inputs must not cause 500
# ===========================================================================

class TestNoCrash:
    """The endpoint must never return 500, regardless of input."""

    def test_very_long_message(self):
        r = post_chat("שלום " * 500)
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_special_characters(self):
        r = post_chat("!@#$%^&*()")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_numbers_only(self):
        r = post_chat("12345")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_emoji(self):
        r = post_chat("😀🎉🔥")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_newlines_and_tabs(self):
        r = post_chat("שלום\n\n\tמה שלומך")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_single_hebrew_letter(self):
        r = post_chat("א")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_unknown_level(self):
        r = post_chat("שלום", level="C2")
        assert r.status_code == 200
        assert_valid_schema(r.json())

    def test_invalid_level_format(self):
        r = post_chat("שלום", level="xyz!!!")
        assert r.status_code == 200
        assert_valid_schema(r.json())


# ===========================================================================
# 5. INCLUDE-ARABIC FLAG
# ===========================================================================

class TestArabicFlag:
    """Hebrew-only scope: answerAr must stay null even when includeArabic=true."""

    def test_arabic_false_returns_null_ar(self):
        r = post_chat("שלום", includeArabic=False)
        data = r.json()
        if not data["fallbackUsed"]:
            assert data["answerAr"] is None

    def test_arabic_true_returns_200(self):
        r = post_chat("שלום", includeArabic=True)
        assert r.status_code == 200
        data = r.json()
        assert_valid_schema(data)
        assert data["answerAr"] is None


# ===========================================================================
# 6. REQUEST VALIDATION — bad request bodies
# ===========================================================================

class TestRequestValidation:
    """Malformed requests should return 422, not 500."""

    def test_missing_message_field(self):
        r = client.post(CHAT_URL, json={"level": "A1"})
        assert r.status_code == 422

    def test_wrong_type_message(self):
        r = client.post(CHAT_URL, json={"message": 12345})
        assert r.status_code == 422  # Pydantic rejects non-string message

    def test_empty_json_body(self):
        r = client.post(CHAT_URL, json={})
        assert r.status_code == 422

    def test_no_body(self):
        r = client.post(CHAT_URL)
        assert r.status_code == 422


# ===========================================================================
# 7. HEALTH & ROOT
# ===========================================================================

class TestHealth:
    def test_root(self):
        r = client.get("/")
        assert r.status_code == 200
        assert r.json()["status"] == "running"

    def test_health(self):
        r = client.get("/api/ai/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ===========================================================================
# 8. CONTEXT CHUNK IDS — valid questions should return chunk references
# ===========================================================================

class TestContextChunks:
    def test_valid_question_returns_chunk_ids(self):
        r = post_chat("מה השם שלך?")
        data = r.json()
        if not data["fallbackUsed"] and not data.get("routerHit", False):
            assert len(data["contextChunkIds"]) > 0, "Expected at least one chunk ID"
            for cid in data["contextChunkIds"]:
                assert isinstance(cid, str) and len(cid) > 0

    def test_fallback_may_have_empty_chunks(self):
        r = post_chat("")
        data = r.json()
        assert isinstance(data["contextChunkIds"], list)
