"""
analytics.py

Aggregates runtime statistics from in-memory singletons for the
GET /api/ai/analytics endpoint.

Metrics collected:
  cache        — hits, misses, size, hit_rate
  latency      — avg / p50 / p95 / p99 (ms) from provider logs
  providers    — per-provider success / failure counts
  fallbacks    — total and per-reason counts from provider logs
  guardrails   — placeholder (populated if guardrail events are stored)
  uptime       — seconds since the analytics module was first imported
"""
from __future__ import annotations

import statistics
import time
from typing import Any

_START_TIME = time.time()


def get_analytics_snapshot() -> dict[str, Any]:
    """
    Return a single consistent snapshot of all runtime analytics.
    All reads happen under each sub-system's own lock via their existing
    public APIs — no new shared state introduced here.
    """
    return {
        "uptime_seconds": int(time.time() - _START_TIME),
        "cache": _cache_metrics(),
        "latency": _latency_metrics(),
        "providers": _provider_metrics(),
        "fallbacks": _fallback_metrics(),
        "guardrails": _guardrail_metrics(),
        "rate_limits": _rate_limit_metrics(),
        "request_paths": _request_path_metrics(),
    }


# ---------------------------------------------------------------------------
# Sub-collectors
# ---------------------------------------------------------------------------

def _cache_metrics() -> dict[str, Any]:
    from services.chat_cache import get_cache_stats

    stats = get_cache_stats()
    hits = stats.get("hits", 0)
    misses = stats.get("misses", 0)
    total = hits + misses
    return {
        "hits": hits,
        "misses": misses,
        "size": stats.get("size", 0),
        "hit_rate": round(hits / total, 4) if total else 0.0,
    }


def _latency_metrics() -> dict[str, Any]:
    logs = _get_provider_logs_raw()
    successful = [
        log["latencyMs"]
        for log in logs
        if log.get("status") == "success" and log.get("latencyMs", 0) > 0
    ]
    if not successful:
        return {"avg_ms": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0, "sample_size": 0}

    sorted_latencies = sorted(successful)
    n = len(sorted_latencies)

    def _percentile(p: float) -> int:
        # Nearest-rank method: rank = ceil(p/100 * n), 1-indexed.
        # Old code used int() (floor) - 1 which under-reported high
        # percentiles when n was small.
        import math
        rank = max(1, math.ceil(p / 100.0 * n))
        return sorted_latencies[min(rank - 1, n - 1)]

    return {
        "avg_ms": int(statistics.mean(sorted_latencies)),
        "p50_ms": _percentile(50),
        "p95_ms": _percentile(95),
        "p99_ms": _percentile(99),
        "sample_size": n,
    }


def _provider_metrics() -> dict[str, dict[str, int]]:
    logs = _get_provider_logs_raw()
    per_provider: dict[str, dict[str, int]] = {}
    for log in logs:
        provider = log.get("provider", "unknown")
        status = log.get("status", "unknown")
        if provider not in per_provider:
            per_provider[provider] = {"success": 0, "failed": 0, "skipped": 0}
        bucket = status if status in ("success", "failed", "skipped") else "failed"
        per_provider[provider][bucket] += 1
    return per_provider


def _fallback_metrics() -> dict[str, Any]:
    from services.chat_cache import get_cache_stats, RESPONSE_CACHE_MANAGER

    # Count responses where fallbackUsed=True from the in-memory cache
    fallback_reasons: dict[str, int] = {}
    total_fallbacks = 0

    with RESPONSE_CACHE_MANAGER._lock:
        for entry in RESPONSE_CACHE_MANAGER._entries.values():
            resp = entry.response
            if getattr(resp, "fallbackUsed", False):
                total_fallbacks += 1
                reason = getattr(resp, "fallbackReason", None) or "UNKNOWN"
                fallback_reasons[reason] = fallback_reasons.get(reason, 0) + 1

    return {
        "total": total_fallbacks,
        "by_reason": fallback_reasons,
    }


def _guardrail_metrics() -> dict[str, Any]:
    from services.chat_cache import RESPONSE_CACHE_MANAGER

    vocab_leakage_count = 0
    with RESPONSE_CACHE_MANAGER._lock:
        for entry in RESPONSE_CACHE_MANAGER._entries.values():
            guardrail = getattr(entry.response, "guardrail", None)
            if guardrail and getattr(guardrail, "vocabularyLeakage", False):
                vocab_leakage_count += 1

    return {
        "vocabulary_leakage_events": vocab_leakage_count,
    }


def _request_path_metrics() -> dict[str, Any]:
    """How requests were resolved: local / cache / local_reject / llm.

    The headline number is `llm_reached_rate` — the share of traffic that
    actually consumed model quota. Everything else is served for free.
    """
    from services.request_path_metrics import REQUEST_PATH_METRICS

    return REQUEST_PATH_METRICS.snapshot()


def _rate_limit_metrics() -> dict[str, Any]:
    from services.chat_cache import RATE_LIMITER

    with RATE_LIMITER._lock:
        active_users = len(RATE_LIMITER._requests)
        throttled_users = sum(
            1
            for reqs in RATE_LIMITER._requests.values()
            if len(reqs) >= RATE_LIMITER.max_requests
        )

    return {
        "active_users": active_users,
        "throttled_users": throttled_users,
        "max_requests_per_window": RATE_LIMITER.max_requests,
        "window_seconds": RATE_LIMITER.window_seconds,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_provider_logs_raw() -> list[dict[str, Any]]:
    """Return all provider logs (up to the deque limit) as dicts."""
    from services.chat_provider import get_provider_logs
    return get_provider_logs(limit=200)
