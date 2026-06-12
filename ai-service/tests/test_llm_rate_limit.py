"""
test_llm_rate_limit.py

The LLM path has its own tighter budget (LLM_RATE_LIMITER), separate from the
generous request-level limit. Local/cache/router answers must NEVER consume it
— only requests that actually reach the provider do. These tests lock in:

  1. the LLM limiter is tighter than the request limiter,
  2. consuming the LLM budget is independent per identity,
  3. the HTTP identity hierarchy resolves X-User-ID → X-Session-ID → IP.
"""
from __future__ import annotations

import services.chat_cache as cc


def test_llm_budget_is_tighter_than_request_budget():
    assert cc.LLM_RATE_LIMITER.max_requests <= cc.RATE_LIMITER.max_requests


def test_llm_budget_blocks_after_threshold_per_identity():
    cc.LLM_RATE_LIMITER.reset()
    limit = cc.LLM_RATE_LIMITER.max_requests

    # Burn the budget for user "alice".
    for _ in range(limit):
        allowed, _ = cc.check_llm_rate_limit("uid:alice")
        assert allowed is True
    blocked, retry = cc.check_llm_rate_limit("uid:alice")
    assert blocked is False
    assert retry >= 1

    # A different identity is unaffected — budgets are per-identity.
    allowed_bob, _ = cc.check_llm_rate_limit("uid:bob")
    assert allowed_bob is True


def test_resolve_rate_identity_hierarchy():
    from main import _resolve_rate_identity

    class _Req:
        def __init__(self, headers, ip="9.9.9.9"):
            self.headers = headers
            self.client = type("C", (), {"host": ip})()

    # X-User-ID wins when present.
    assert _resolve_rate_identity(
        _Req({"X-User-ID": "u1", "X-Session-ID": "s1"})
    ) == "u1"
    # Falls back to session, then to the real client IP.
    assert _resolve_rate_identity(_Req({"X-Session-ID": "s1"})) == "s1"
    assert _resolve_rate_identity(_Req({})) == "9.9.9.9"
