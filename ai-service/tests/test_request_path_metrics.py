"""
test_request_path_metrics.py

Verifies that the chat engine classifies each request's resolution path
(local / cache / local_reject / llm) so the leakage report can report what
fraction of traffic actually reaches the LLM.

These cases run entirely offline — none of them should reach the provider,
which is the whole point: the common patterns must be served for free.
"""
from __future__ import annotations

from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest
from services.request_path_metrics import (
    REQUEST_PATH_METRICS,
    RequestPathMetrics,
    classify_path,
)


def test_classify_path_signals():
    assert classify_path(cache_hit=True, fallback_used=False, llm_called=False) == "cache"
    assert classify_path(cache_hit=False, fallback_used=False, llm_called=True) == "llm"
    assert classify_path(cache_hit=False, fallback_used=True, llm_called=True) == "llm"
    assert classify_path(cache_hit=False, fallback_used=True, llm_called=False) == "local_reject"
    assert classify_path(cache_hit=False, fallback_used=False, llm_called=False) == "local"


def test_snapshot_rates_sum_consistently():
    m = RequestPathMetrics()
    m.record("local")
    m.record("local")
    m.record("local_reject")
    m.record("llm", fallback_reason="PROVIDER_QUOTA")
    snap = m.snapshot()
    assert snap["total_requests"] == 4
    assert snap["counts"] == {"local": 2, "cache": 0, "local_reject": 1, "llm": 1}
    assert snap["llm_reached_rate"] == 0.25
    assert snap["local_served_rate"] == 0.75
    assert snap["llm_fallbacks_by_reason"] == {"PROVIDER_QUOTA": 1}


def test_unknown_path_folds_into_llm():
    """A miswire must over-report cost, never hide it."""
    m = RequestPathMetrics()
    m.record("bogus")
    assert m.snapshot()["counts"]["llm"] == 1


def test_common_offline_requests_never_reach_llm():
    REQUEST_PATH_METRICS.reset()

    # Out-of-scope (stock market) → rejected locally, no LLM.
    generate_chat_response(
        ChatRequest(message="البورصة شو يعني", level="A1", includeArabic=False)
    )
    # Greeting → rule router, local.
    generate_chat_response(ChatRequest(message="שלום", level="A1", includeArabic=False))
    # Word-meaning mixed AR/HE ("what does בית mean") → gatekeeper, local.
    generate_chat_response(
        ChatRequest(message="شو يعني בית", level="A1", includeArabic=False)
    )

    snap = REQUEST_PATH_METRICS.snapshot()
    assert snap["total_requests"] == 3
    assert snap["counts"]["llm"] == 0
    assert snap["llm_reached_rate"] == 0.0
    assert snap["local_served_rate"] == 1.0
