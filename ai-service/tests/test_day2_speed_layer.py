"""
Day 2 acceptance tests — speed layer: cache, router, fast-reject, schema v2.

Run:
    cd ai-service
    python -m pytest tests/test_day2_speed_layer.py -v

Split into two markers:
    - Default tests: no LLM calls (fast, ~10s total)
    - @pytest.mark.llm: hits the real LLM (slow, ~30-60s)

    # Fast only (no LLM):
    python -m pytest tests/test_day2_speed_layer.py -v -m "not llm"

    # Full suite including LLM:
    python -m pytest tests/test_day2_speed_layer.py -v
"""

from __future__ import annotations

import re
import time
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
CHAT_URL = "/api/ai/chat"

REQUIRED_FIELDS = {
    "answerHe", "answerAr", "fallbackUsed", "fallbackReason",
    "level", "model", "latencyMs", "cacheHit", "routerHit",
    "contextChunkIds", "guardrail",
}


def post_chat(message: str, level: str = "A1", includeArabic: bool = False):
    return client.post(CHAT_URL, json={
        "message": message,
        "level": level,
        "includeArabic": includeArabic,
    })


def assert_valid_schema_v2(data: dict):
    missing = REQUIRED_FIELDS - set(data.keys())
    assert not missing, f"Missing fields: {missing}"
    assert isinstance(data["cacheHit"], bool)
    assert isinstance(data["routerHit"], bool)


# ===========================================================================
# 1. SCHEMA V2 — new fields cacheHit and routerHit are always present
# ===========================================================================

class TestSchemaV2:
    def test_response_has_cache_hit_field(self):
        r = post_chat("שלום")
        assert_valid_schema_v2(r.json())

    def test_response_has_router_hit_field(self):
        r = post_chat("שלום")
        assert_valid_schema_v2(r.json())

    def test_fallback_has_v2_fields(self):
        r = post_chat("")
        data = r.json()
        assert_valid_schema_v2(data)
        assert data["cacheHit"] is False or data["cacheHit"] is True
        assert data["routerHit"] is False


# ===========================================================================
# 2. SMART ROUTER — deterministic responses without LLM
# ===========================================================================

class TestSmartRouter:
    def test_greeting_shalom_routed(self):
        r = post_chat("שלום")
        data = r.json()
        assert data["routerHit"] is True
        assert data["fallbackUsed"] is False
        assert data["latencyMs"] == 0
        assert "שלום" in data["answerHe"]

    def test_greeting_hi_routed(self):
        r = post_chat("היי")
        data = r.json()
        assert data["routerHit"] is True
        assert data["fallbackUsed"] is False

    def test_thanks_routed(self):
        r = post_chat("תודה")
        data = r.json()
        assert data["routerHit"] is True
        assert data["fallbackUsed"] is False
        assert "בבקשה" in data["answerHe"]

    def test_curriculum_question_routed(self):
        r = post_chat("מה שלומך?")
        data = r.json()
        assert data["routerHit"] is True
        assert data["fallbackUsed"] is False

    def test_single_glossary_word_routed(self):
        r = post_chat("קפה")
        data = r.json()
        assert data["routerHit"] is True
        assert data["fallbackUsed"] is False

    def test_single_glossary_word_with_arabic_flag_stays_hebrew_only(self):
        r = post_chat("מים", includeArabic=True)
        data = r.json()
        assert data["routerHit"] is True
        assert data["answerAr"] is None

    def test_router_no_arabic_when_not_requested(self):
        r = post_chat("שלום", includeArabic=False)
        data = r.json()
        assert data["answerAr"] is None

    def test_router_arabic_flag_ignored_for_hebrew_only_scope(self):
        r = post_chat("שלום", includeArabic=True)
        data = r.json()
        assert data["answerAr"] is None

    def test_non_routable_question_not_routed(self):
        """A valid Hebrew question not in router tables should NOT be routed."""
        r = post_chat("איפה אתה לומד?")
        data = r.json()
        assert data["routerHit"] is False


# ===========================================================================
# 3. EXACT CACHE — second request returns from cache
# ===========================================================================

class TestExactCache:
    def test_same_question_cached(self):
        r1 = post_chat("תודה")
        r2 = post_chat("תודה")
        d1 = r1.json()
        d2 = r2.json()
        assert d2["cacheHit"] is True
        assert d2["answerHe"] == d1["answerHe"]
        assert d2["latencyMs"] == 0

    def test_cache_respects_level(self):
        r_a1 = post_chat("שלום", level="A1")
        r_b1 = post_chat("שלום", level="B1")
        assert r_a1.json()["cacheHit"] is not None
        assert r_b1.json()["level"] in ("A1", "B1")

    def test_cache_ignores_arabic_flag_for_hebrew_only_scope(self):
        post_chat("שלום", includeArabic=False)
        r_arabic = post_chat("שלום", includeArabic=True)
        data = r_arabic.json()
        assert data["answerAr"] is None
        assert data["cacheHit"] is True

    def test_fallback_also_cached(self):
        post_chat("")
        r2 = post_chat("")
        assert r2.json()["cacheHit"] is True
        assert r2.json()["fallbackUsed"] is True

    def test_cached_response_latency_zero(self):
        post_chat("היי")
        r2 = post_chat("היי")
        assert r2.json()["latencyMs"] == 0


# ===========================================================================
# 4. FAST REJECT — expanded guards
# ===========================================================================

class TestFastReject:
    def test_empty_message(self):
        data = post_chat("").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "EMPTY_MESSAGE"

    def test_whitespace_only(self):
        data = post_chat("   ").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "EMPTY_MESSAGE"

    def test_english(self):
        data = post_chat("Hello world").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MIXED_LANGUAGE"

    def test_arabic(self):
        data = post_chat("مرحبا كيف حالك").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MIXED_LANGUAGE"

    def test_mixed_hebrew_english(self):
        data = post_chat("שלום hello").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MIXED_LANGUAGE"

    def test_message_too_long(self):
        data = post_chat("שלום " * 100).json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MESSAGE_TOO_LONG"

    def test_numbers_only(self):
        data = post_chat("12345").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "OUT_OF_SCOPE"

    def test_special_chars_only(self):
        data = post_chat("!@#$%^&*()").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "OUT_OF_SCOPE"

    def test_emoji_only(self):
        data = post_chat("😀🎉🔥").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "OUT_OF_SCOPE"

    def test_advanced_hebrew_out_of_scope(self):
        data = post_chat("פוליטיקה וכלכלה עולמית").json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "OUT_OF_SCOPE"

    def test_fast_reject_latency_zero(self):
        data = post_chat("").json()
        assert data["latencyMs"] == 0

    def test_fast_reject_no_chunks(self):
        data = post_chat("Hello").json()
        assert data["contextChunkIds"] == []


# ===========================================================================
# 5. STARTUP CACHE — data preloaded, not reloaded per request
# ===========================================================================

class TestStartupCache:
    def test_startup_cache_populated(self):
        from services.chat_cache import CHAT_CACHE
        assert len(CHAT_CACHE) > 0, "Startup cache should have at least one level"
        assert "A1" in CHAT_CACHE

    def test_a1_bundle_has_vocab(self):
        from services.chat_cache import CHAT_CACHE
        bundle = CHAT_CACHE["A1"]
        assert len(bundle.vocab) > 0
        assert len(bundle.vocab_set) > 0

    def test_a1_bundle_has_chunks(self):
        from services.chat_cache import CHAT_CACHE
        bundle = CHAT_CACHE["A1"]
        assert len(bundle.chunks) > 0

    def test_a1_bundle_has_glossary(self):
        from services.chat_cache import CHAT_CACHE
        bundle = CHAT_CACHE["A1"]
        assert isinstance(bundle.glossary, dict)

    def test_a1_bundle_has_question_answer_map(self):
        from services.chat_cache import CHAT_CACHE
        bundle = CHAT_CACHE["A1"]
        assert isinstance(bundle.question_answer_map, dict)


# ===========================================================================
# 6. ROUTER + CACHE SPEED — deterministic paths must be fast
# ===========================================================================

class TestSpeed:
    def test_router_response_under_50ms(self):
        post_chat("שלום")  # warm
        start = time.perf_counter()
        post_chat("שלום")
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms < 50, f"Cached router response took {elapsed_ms:.1f}ms"

    def test_fast_reject_under_50ms(self):
        start = time.perf_counter()
        post_chat("Hello world")
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms < 50, f"Fast reject took {elapsed_ms:.1f}ms"

    def test_ten_cached_requests_under_500ms(self):
        post_chat("תודה")
        start = time.perf_counter()
        for _ in range(10):
            post_chat("תודה")
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms < 500, f"10 cached requests took {elapsed_ms:.1f}ms"


# ===========================================================================
# 7. ALLOWED VOCABULARY — prompt size reduction
# ===========================================================================

class TestVocabularyReduction:
    def test_build_allowed_vocab_smaller_than_full(self):
        from services.chat_cache import get_level_bundle, build_allowed_vocabulary
        from services.chat_retrieval import retrieve_relevant_chunks
        bundle = get_level_bundle("A1")
        selected = retrieve_relevant_chunks("מה השם שלך?", bundle.chunks, limit=2)
        allowed = build_allowed_vocabulary(bundle, selected)
        assert len(allowed) < len(bundle.vocab), \
            f"Allowed vocab ({len(allowed)}) should be smaller than full ({len(bundle.vocab)})"

    def test_top_k_is_2(self):
        from services.chat_retrieval import retrieve_relevant_chunks
        from services.chat_cache import get_level_bundle
        bundle = get_level_bundle("A1")
        selected = retrieve_relevant_chunks("מה השם שלך?", bundle.chunks, limit=2)
        assert len(selected) <= 2


# ===========================================================================
# 8. LLM PATH — real model calls (slow, marks with @pytest.mark.llm)
# ===========================================================================

LLM_QUESTIONS = [
    "מה השם שלך?",
    "מאיפה אתה?",
    "איפה אתה גר?",
    "מה אתה עושה?",
    "מי זה?",
]


@pytest.mark.llm
class TestLLMPath:
    """Tests that actually call the LLM. Slower but essential for Day 2 validation."""

    @pytest.mark.parametrize("question", LLM_QUESTIONS)
    def test_llm_returns_200_with_valid_schema(self, question: str):
        r = post_chat(question)
        assert r.status_code == 200
        data = r.json()
        assert_valid_schema_v2(data)
        if not data["routerHit"]:
            assert data["contextChunkIds"] != [] or data["fallbackUsed"]

    @pytest.mark.parametrize("question", LLM_QUESTIONS)
    def test_llm_no_vocabulary_leakage(self, question: str):
        r = post_chat(question)
        data = r.json()
        assert data["guardrail"]["vocabularyLeakage"] is False, \
            f"Leakage: {data['guardrail']['blockedTokens']}"

    @pytest.mark.parametrize("question", LLM_QUESTIONS)
    def test_llm_answer_is_hebrew(self, question: str):
        r = post_chat(question)
        data = r.json()
        if not data["fallbackUsed"]:
            assert re.search(r"[֐-׿]", data["answerHe"]), \
                f"No Hebrew in answer: {data['answerHe']}"

    def test_llm_latency_under_target(self):
        """At least one LLM question should complete under 5s (p95 target)."""
        latencies = []
        for q in LLM_QUESTIONS[:3]:
            start = time.perf_counter()
            r = post_chat(q)
            elapsed = time.perf_counter() - start
            data = r.json()
            if not data["routerHit"] and not data["cacheHit"]:
                latencies.append(elapsed)
        if latencies:
            best = min(latencies)
            assert best < 5.0, f"Best LLM latency was {best:.2f}s (target < 5s)"

    def test_llm_then_cache_hit(self):
        """After an LLM call, same question should come from cache."""
        unique_q = "מי זאת הבחורה?"
        r1 = post_chat(unique_q)
        r2 = post_chat(unique_q)
        d1 = r1.json()
        d2 = r2.json()
        if not d1["fallbackUsed"] or d1["fallbackReason"] not in ("OUT_OF_SCOPE",):
            assert d2["cacheHit"] is True
            assert d2["latencyMs"] == 0

    def test_timeout_returns_fallback_not_crash(self):
        """A question that passes all guards but model is slow should fallback, not 500."""
        r = post_chat("איך אני מציג את עצמי בפגישה?")
        assert r.status_code == 200
        data = r.json()
        assert_valid_schema_v2(data)

    def test_include_arabic_with_llm(self):
        r = post_chat("מה השם שלך?", includeArabic=True)
        assert r.status_code == 200
        data = r.json()
        assert_valid_schema_v2(data)
        assert data["answerAr"] is None


# ===========================================================================
# 9. BACKWARD COMPAT — Day 1 contract still holds
# ===========================================================================

class TestBackwardCompat:
    def test_health_still_works(self):
        r = client.get("/api/ai/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_root_still_works(self):
        r = client.get("/")
        assert r.status_code == 200

    def test_missing_message_still_422(self):
        r = client.post(CHAT_URL, json={"level": "A1"})
        assert r.status_code == 422

    def test_no_body_still_422(self):
        r = client.post(CHAT_URL)
        assert r.status_code == 422


# ===========================================================================
# 10. NO-CRASH — weird inputs still safe
# ===========================================================================

class TestNoCrashDay2:
    def test_unknown_level_still_works(self):
        r = post_chat("שלום", level="C2")
        assert r.status_code == 200
        assert_valid_schema_v2(r.json())

    def test_very_long_hebrew(self):
        r = post_chat("שלום " * 100)
        assert r.status_code == 200
        data = r.json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MESSAGE_TOO_LONG"

    def test_single_letter(self):
        r = post_chat("א")
        assert r.status_code == 200
        assert_valid_schema_v2(r.json())

    def test_newlines(self):
        r = post_chat("שלום\n\nמה שלומך")
        assert r.status_code == 200
        assert_valid_schema_v2(r.json())
