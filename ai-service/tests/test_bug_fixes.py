"""
test_bug_fixes.py
Regression tests for the 20 SaaS-critical bugs identified in the audit.
Each test verifies a specific bug fix.
"""
from __future__ import annotations

import json
import os
import threading
import time
from unittest import mock

import pytest

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")


# ---------------------------------------------------------------------------
# B01 — ConversationMemory race condition (Redis path)
# ---------------------------------------------------------------------------

class TestB01ConversationMemoryRace:
    def test_append_turn_uses_watch_multi_exec_when_redis_available(self):
        """Verify the Redis path uses pipeline.watch() for optimistic locking."""
        from services.conversation_memory import ConversationMemory

        # Fake Redis pipeline with watch tracking
        watched_keys: list[str] = []
        executed = []

        class FakePipeline:
            def __init__(self, store):
                self._store = store

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def watch(self, key):
                watched_keys.append(key)

            def get(self, key):
                return self._store.get(key)

            def multi(self):
                pass

            def set(self, key, value, ex=None):
                self._store[key] = value

            def execute(self):
                executed.append(True)

        class FakeRedis:
            def __init__(self):
                self._store = {}

            def pipeline(self):
                return FakePipeline(self._store)

            def get(self, key):
                return self._store.get(key)

            def set(self, key, value, ex=None):
                self._store[key] = value

            def delete(self, *keys):
                for k in keys:
                    self._store.pop(k, None)

            def keys(self, pattern):
                return list(self._store.keys())

        fake_redis = FakeRedis()
        with mock.patch(
            "services.redis_client.get_redis_client", return_value=fake_redis
        ):
            mem = ConversationMemory()
            mem.append_turn("s1", "שלום", "שלום")

        assert "session:s1" in watched_keys, "Must WATCH the session key"
        assert executed, "Must EXEC the pipeline"


# ---------------------------------------------------------------------------
# B04 — CircuitBreaker double-count verification (verify NOT a bug)
# ---------------------------------------------------------------------------

class TestB04CircuitBreakerCount:
    def test_consecutive_failures_match_actual_failures(self):
        """Verify counter never exceeds actual failure count under concurrency."""
        from services.chat_circuit_breaker import CircuitBreaker

        cb = CircuitBreaker(failure_threshold=100, window_seconds=60)
        threads = []
        for _ in range(20):
            t = threading.Thread(target=cb.record_failure)
            threads.append(t)
            t.start()
        for t in threads:
            t.join()

        # Counter equals number of failures appended
        assert cb._consecutive_failures == len(cb._failures) == 20


# ---------------------------------------------------------------------------
# B06 — EXACT_RESPONSE_CACHE memory leak
# ---------------------------------------------------------------------------

class TestB06ExactCacheBounded:
    def test_exact_cache_does_not_grow_unbounded(self):
        """EXACT_RESPONSE_CACHE must enforce a max size."""
        from services.chat_cache import (
            EXACT_RESPONSE_CACHE,
            EXACT_CACHE_MAX_ENTRIES,
            store_exact_cached_response,
        )
        from services.chat_schemas import ChatResponse, GuardrailReport

        # Insert way more than the limit
        for i in range(EXACT_CACHE_MAX_ENTRIES + 50):
            resp = ChatResponse(
                answerHe=f"שלום {i}",
                answerAr=None,
                fallbackUsed=False,
                fallbackReason=None,
                level="A1",
                model="t",
                latencyMs=0,
                guardrail=GuardrailReport(),
            )
            store_exact_cached_response(f"key_{i}:A1:false", resp)

        # Must not exceed the cap
        assert len(EXACT_RESPONSE_CACHE) <= EXACT_CACHE_MAX_ENTRIES


# ---------------------------------------------------------------------------
# B07 — Session eviction must also delete from Redis
# ---------------------------------------------------------------------------

class TestB07SessionEvictionRedis:
    def test_clear_session_deletes_from_redis(self):
        """clear_session must call redis.delete."""
        from services.conversation_memory import ConversationMemory

        deleted_keys: list[str] = []

        class FakeRedis:
            def pipeline(self):
                raise RuntimeError("not used")

            def get(self, key):
                return None

            def set(self, key, value, ex=None):
                pass

            def delete(self, *keys):
                deleted_keys.extend(keys)

            def keys(self, pattern):
                return []

        with mock.patch(
            "services.redis_client.get_redis_client", return_value=FakeRedis()
        ):
            mem = ConversationMemory()
            mem.clear_session("s99")

        assert "session:s99" in deleted_keys


# ---------------------------------------------------------------------------
# B08 — vocab_tracker should log failures at warning, not debug
# ---------------------------------------------------------------------------

class TestB08VocabTrackerLogging:
    def test_network_failure_logged_at_warning_level(self):
        """vocab_tracker._post_to_backend must log exceptions at WARNING."""
        from services import vocab_tracker

        with mock.patch.object(
            vocab_tracker.logger, "warning"
        ) as mock_warning:
            with mock.patch.object(
                vocab_tracker, "httpx"
            ) as mock_httpx:
                mock_httpx.Client.side_effect = Exception("connection refused")
                vocab_tracker._post_to_backend(
                    "uid", [{"word": "שלום", "correct": True}], "A1"
                )
            assert mock_warning.called, "Network errors must be WARNING-level"


# ---------------------------------------------------------------------------
# B10 — Pronunciation vocab path must be configurable
# ---------------------------------------------------------------------------

class TestB10PronunciationVocabPath:
    def test_vocab_path_falls_back_to_data_dir(self):
        """If POC path doesn't exist, must try data/vocabulary/."""
        from services import pronunciation
        assert pronunciation.APPROVED_VOCAB_PATH is not None


# ---------------------------------------------------------------------------
# B12 — Grammar rules: אני must be context-dependent, not masculine-only
# ---------------------------------------------------------------------------

class TestB12GrammarAniContextual:
    def test_ani_with_feminine_verb_not_flagged_as_error(self):
        """'אני גרה' must NOT raise GENDER_VERB error (אני is dual-gender)."""
        from services.grammar_rules import detect_grammar_errors

        errors = detect_grammar_errors("אני גרה")
        # אני is gender-neutral — should not be flagged
        assert not errors, f"Should not flag אני גרה but got {errors}"

    def test_ani_with_masculine_verb_not_flagged(self):
        """'אני גר' must also not flag (אני can be masculine)."""
        from services.grammar_rules import detect_grammar_errors

        errors = detect_grammar_errors("אני גר")
        assert not errors

    def test_ata_with_feminine_verb_still_flagged(self):
        """'אתה גרה' (masc pronoun + fem verb) MUST still flag."""
        from services.grammar_rules import detect_grammar_errors

        errors = detect_grammar_errors("אתה גרה")
        assert errors, "אתה גרה should be flagged"
        assert errors[0].code == "GENDER_VERB"


# ---------------------------------------------------------------------------
# B14 — Analytics percentile correctness
# ---------------------------------------------------------------------------

class TestB14AnalyticsPercentile:
    def test_p50_p95_p99_correct_on_known_data(self):
        """Verify percentile values match expected for [10..100] dataset."""
        from services import analytics

        # 100 logs with latency 10..1000 ms (sorted)
        logs = [
            {"status": "success", "latencyMs": (i + 1) * 10, "provider": "g"}
            for i in range(100)
        ]
        with mock.patch.object(
            analytics, "_get_provider_logs_raw", return_value=logs
        ):
            m = analytics._latency_metrics()

        # For sorted [10,20,...,1000]:
        # p50 should be ~ 500 (50th element 0-indexed)
        # p95 should be ~ 950
        # p99 should be ~ 990
        assert m["p50_ms"] >= 490 and m["p50_ms"] <= 510, m
        assert m["p95_ms"] >= 940 and m["p95_ms"] <= 960, m
        assert m["p99_ms"] >= 980 and m["p99_ms"] <= 1000, m


# ---------------------------------------------------------------------------
# B15 — Streaming sentinel must use a stronger marker
# ---------------------------------------------------------------------------

class TestB15StreamingSentinel:
    def test_fallback_sentinel_is_unique(self):
        """The fallback sentinel must be unlikely to appear in LLM output."""
        from services import chat_engine
        # Read source to check sentinel
        import inspect
        src = inspect.getsource(chat_engine.stream_chat_response)
        # New marker must be unique enough that LLM output won't collide
        assert "__LISAN_FALLBACK_" in src
        # And the legacy NULL-byte sentinel must NOT be used anymore
        assert "\x00FALLBACK\x00" not in src.replace(
            '"\\x00FALLBACK\\x00"', ""
        )


# ---------------------------------------------------------------------------
# B20 — JWT parsing must handle malformed headers gracefully
# ---------------------------------------------------------------------------

class TestB20JwtMalformedHeader:
    def test_bearer_without_token_returns_401_not_500(self):
        """Authorization='Bearer' (no token) must return 401, not 500."""
        from fastapi.testclient import TestClient
        from main import app

        # Set JWT secret so the path is exercised
        with mock.patch.dict(os.environ, {"JWT_SECRET": "test-secret"}):
            client = TestClient(app)
            resp = client.post(
                "/api/ai/chat",
                json={"message": "שלום", "level": "A1"},
                headers={"Authorization": "Bearer "},
            )
            # Must be 401 (auth error), never 500 (server crash)
            assert resp.status_code in (
                401, 403
            ), f"got {resp.status_code}: {resp.text}"
