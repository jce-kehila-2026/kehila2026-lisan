"""
test_analytics.py

Tests for T9: Analytics Endpoints.

Covers:
  - get_analytics_snapshot returns all required top-level keys
  - cache metrics: hit_rate computed correctly
  - cache metrics: hit_rate=0 when no requests
  - latency metrics: returns zeros when no provider logs
  - latency metrics: avg/p50/p95/p99 computed from mock logs
  - provider metrics: counts success/failed/skipped per provider
  - fallback metrics: counts by reason from cached responses
  - guardrail metrics: counts vocabulary_leakage_events
  - rate_limit metrics: returns active_users and throttled_users
  - uptime_seconds is a non-negative integer
  - GET /api/ai/analytics returns 200
  - GET /api/ai/analytics response has all required keys
  - GET /api/ai/analytics cache.hit_rate is float between 0 and 1
  - GET /api/ai/analytics latency keys are non-negative ints
"""
from __future__ import annotations

import os
import unittest.mock

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from services.analytics import (
    get_analytics_snapshot,
    _cache_metrics,
    _fallback_metrics,
    _guardrail_metrics,
    _latency_metrics,
    _provider_metrics,
    _rate_limit_metrics,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_logs(entries: list[dict]) -> list[dict]:
    """Build minimal provider log entries."""
    return entries


# ---------------------------------------------------------------------------
# get_analytics_snapshot — top-level shape
# ---------------------------------------------------------------------------

class TestAnalyticsSnapshot:
    def test_has_all_required_keys(self):
        snapshot = get_analytics_snapshot()
        required = {
            "uptime_seconds",
            "cache",
            "latency",
            "providers",
            "fallbacks",
            "guardrails",
            "rate_limits",
        }
        assert required <= set(snapshot.keys())

    def test_uptime_seconds_non_negative(self):
        snapshot = get_analytics_snapshot()
        assert snapshot["uptime_seconds"] >= 0

    def test_uptime_seconds_is_int(self):
        snapshot = get_analytics_snapshot()
        assert isinstance(snapshot["uptime_seconds"], int)


# ---------------------------------------------------------------------------
# _cache_metrics
# ---------------------------------------------------------------------------

class TestCacheMetrics:
    def test_hit_rate_zero_when_no_requests(self):
        with unittest.mock.patch(
            "services.chat_cache.RESPONSE_CACHE_MANAGER.get_cache_stats",
            return_value={"hits": 0, "misses": 0, "size": 0},
        ):
            m = _cache_metrics()
        assert m["hit_rate"] == 0.0

    def test_hit_rate_computed_correctly(self):
        with unittest.mock.patch(
            "services.chat_cache.RESPONSE_CACHE_MANAGER.get_cache_stats",
            return_value={"hits": 3, "misses": 1, "size": 3},
        ):
            m = _cache_metrics()
        assert m["hit_rate"] == 0.75

    def test_hit_rate_one_when_all_hits(self):
        with unittest.mock.patch(
            "services.chat_cache.RESPONSE_CACHE_MANAGER.get_cache_stats",
            return_value={"hits": 10, "misses": 0, "size": 10},
        ):
            m = _cache_metrics()
        assert m["hit_rate"] == 1.0

    def test_returns_cache_size(self):
        with unittest.mock.patch(
            "services.chat_cache.RESPONSE_CACHE_MANAGER.get_cache_stats",
            return_value={"hits": 0, "misses": 0, "size": 42},
        ):
            m = _cache_metrics()
        assert m["size"] == 42


# ---------------------------------------------------------------------------
# _latency_metrics
# ---------------------------------------------------------------------------

class TestLatencyMetrics:
    def test_zeros_when_no_logs(self):
        with unittest.mock.patch(
            "services.analytics._get_provider_logs_raw",
            return_value=[],
        ):
            m = _latency_metrics()
        assert m["avg_ms"] == 0
        assert m["p50_ms"] == 0
        assert m["p95_ms"] == 0
        assert m["p99_ms"] == 0
        assert m["sample_size"] == 0

    def test_zeros_when_no_successful_logs(self):
        logs = [
            {"status": "failed", "latencyMs": 100, "provider": "gemini"},
        ]
        with unittest.mock.patch(
            "services.analytics._get_provider_logs_raw", return_value=logs
        ):
            m = _latency_metrics()
        assert m["sample_size"] == 0

    def test_avg_computed_from_successful_logs(self):
        logs = [
            {"status": "success", "latencyMs": 100, "provider": "gemini"},
            {"status": "success", "latencyMs": 200, "provider": "gemini"},
            {"status": "failed", "latencyMs": 500, "provider": "gemini"},
        ]
        with unittest.mock.patch(
            "services.analytics._get_provider_logs_raw", return_value=logs
        ):
            m = _latency_metrics()
        assert m["avg_ms"] == 150
        assert m["sample_size"] == 2

    def test_p95_higher_than_p50(self):
        logs = [
            {"status": "success", "latencyMs": i * 10, "provider": "gemini"}
            for i in range(1, 21)
        ]
        with unittest.mock.patch(
            "services.analytics._get_provider_logs_raw", return_value=logs
        ):
            m = _latency_metrics()
        assert m["p95_ms"] >= m["p50_ms"]
        assert m["p99_ms"] >= m["p95_ms"]


# ---------------------------------------------------------------------------
# _provider_metrics
# ---------------------------------------------------------------------------

class TestProviderMetrics:
    def test_empty_when_no_logs(self):
        with unittest.mock.patch(
            "services.analytics._get_provider_logs_raw", return_value=[]
        ):
            m = _provider_metrics()
        assert m == {}

    def test_counts_success_per_provider(self):
        logs = [
            {"provider": "gemini", "status": "success"},
            {"provider": "gemini", "status": "success"},
            {"provider": "openai", "status": "success"},
            {"provider": "gemini", "status": "failed"},
        ]
        with unittest.mock.patch(
            "services.analytics._get_provider_logs_raw", return_value=logs
        ):
            m = _provider_metrics()
        assert m["gemini"]["success"] == 2
        assert m["gemini"]["failed"] == 1
        assert m["openai"]["success"] == 1

    def test_skipped_counted(self):
        logs = [{"provider": "anthropic", "status": "skipped"}]
        with unittest.mock.patch(
            "services.analytics._get_provider_logs_raw", return_value=logs
        ):
            m = _provider_metrics()
        assert m["anthropic"]["skipped"] == 1


# ---------------------------------------------------------------------------
# _fallback_metrics
# ---------------------------------------------------------------------------

class TestFallbackMetrics:
    def test_zero_fallbacks_when_cache_empty(self):
        from services.chat_cache import RESPONSE_CACHE_MANAGER
        with RESPONSE_CACHE_MANAGER._lock:
            RESPONSE_CACHE_MANAGER._entries.clear()

        m = _fallback_metrics()
        assert m["total"] == 0
        assert m["by_reason"] == {}

    def test_counts_fallback_responses(self):
        from services.chat_cache import RESPONSE_CACHE_MANAGER, CacheEntry
        from services.chat_schemas import ChatResponse, GuardrailReport
        import time

        fallback_resp = ChatResponse(
            answerHe="נסה שוב.",
            answerAr=None,
            fallbackUsed=True,
            fallbackReason="OUT_OF_SCOPE",
            level="A1",
            model="test",
            provider="test",
            latencyMs=0,
            cacheHit=False,
            routerHit=False,
            contextChunkIds=[],
            guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
            suggestedNextPrompts=[],
        )
        now = time.time()
        entry = CacheEntry(
            response=fallback_resp,
            created_at=now,
            expires_at=now + 3600,
        )

        with RESPONSE_CACHE_MANAGER._lock:
            RESPONSE_CACHE_MANAGER._entries.clear()
            RESPONSE_CACHE_MANAGER._entries[("test_key", "A1")] = entry

        m = _fallback_metrics()

        with RESPONSE_CACHE_MANAGER._lock:
            RESPONSE_CACHE_MANAGER._entries.clear()

        assert m["total"] == 1
        assert m["by_reason"].get("OUT_OF_SCOPE", 0) == 1


# ---------------------------------------------------------------------------
# _guardrail_metrics
# ---------------------------------------------------------------------------

class TestGuardrailMetrics:
    def test_zero_when_no_leakage(self):
        from services.chat_cache import RESPONSE_CACHE_MANAGER
        with RESPONSE_CACHE_MANAGER._lock:
            RESPONSE_CACHE_MANAGER._entries.clear()

        m = _guardrail_metrics()
        assert m["vocabulary_leakage_events"] == 0


# ---------------------------------------------------------------------------
# _rate_limit_metrics
# ---------------------------------------------------------------------------

class TestRateLimitMetrics:
    def test_returns_required_keys(self):
        m = _rate_limit_metrics()
        assert "active_users" in m
        assert "throttled_users" in m
        assert "max_requests_per_window" in m
        assert "window_seconds" in m

    def test_non_negative_values(self):
        m = _rate_limit_metrics()
        assert m["active_users"] >= 0
        assert m["throttled_users"] >= 0


# ---------------------------------------------------------------------------
# HTTP endpoint
# ---------------------------------------------------------------------------

class TestAnalyticsEndpoint:
    def _client(self):
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)

    def test_returns_200(self):
        resp = self._client().get("/api/ai/analytics")
        assert resp.status_code == 200

    def test_response_has_all_top_level_keys(self):
        resp = self._client().get("/api/ai/analytics")
        body = resp.json()
        for key in ("uptime_seconds", "cache", "latency", "providers",
                    "fallbacks", "guardrails", "rate_limits"):
            assert key in body, f"Missing key: {key}"

    def test_cache_hit_rate_is_float_0_to_1(self):
        resp = self._client().get("/api/ai/analytics")
        hit_rate = resp.json()["cache"]["hit_rate"]
        assert isinstance(hit_rate, float)
        assert 0.0 <= hit_rate <= 1.0

    def test_latency_values_non_negative(self):
        resp = self._client().get("/api/ai/analytics")
        lat = resp.json()["latency"]
        for key in ("avg_ms", "p50_ms", "p95_ms", "p99_ms"):
            assert lat[key] >= 0, f"{key} is negative"

    def test_uptime_seconds_positive(self):
        resp = self._client().get("/api/ai/analytics")
        assert resp.json()["uptime_seconds"] >= 0
