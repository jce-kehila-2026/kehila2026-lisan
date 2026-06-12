"""
request_path_metrics.py

Process-wide counters for HOW each chat request was resolved.

This answers the single most important question for running Lisan on a free
LLM tier at 1000 students/month: *what fraction of requests actually reach the
model?* Everything served locally (templates, router, cache, local rejects)
costs nothing and never hits a rate limit. The provider logs only record LLM
attempts, so they can't tell us the denominator — this module does.

Paths
-----
  local         — answered deterministically with NO LLM call: the gatekeeper,
                  rule router, known-phrase templates, pre-LLM static replies,
                  and extractive curriculum answers.
  cache         — served from the exact or semantic response cache.
  local_reject  — rejected before any LLM call: out-of-scope, mixed-language,
                  empty/too-long input, or circuit-open.
  llm           — the request reached the LLM provider (whether it answered,
                  timed out, was quota-limited, or leaked vocabulary).

Only the `llm` slice consumes quota. Healthy config: llm_reached_rate well
under ~0.3 so the free tier comfortably covers the traffic.
"""
from __future__ import annotations

import threading

PATHS = ("local", "cache", "local_reject", "llm")


class RequestPathMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self._counts: dict[str, int] = {p: 0 for p in PATHS}
            self._llm_fallbacks: dict[str, int] = {}
            self._total = 0

    def record(self, path: str, fallback_reason: str | None = None) -> None:
        """Record one resolved request. Unknown paths fold into 'llm' so a
        miswire over-reports cost rather than hiding it."""
        with self._lock:
            if path not in self._counts:
                path = "llm"
            self._counts[path] += 1
            self._total += 1
            if path == "llm" and fallback_reason:
                self._llm_fallbacks[fallback_reason] = (
                    self._llm_fallbacks.get(fallback_reason, 0) + 1
                )

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            denom = self._total or 1
            counts = dict(self._counts)
            local_total = counts["local"] + counts["cache"] + counts["local_reject"]
            return {
                "total_requests": self._total,
                "counts": counts,
                "rates": {p: round(c / denom, 4) for p, c in counts.items()},
                "local_served_rate": round(local_total / denom, 4),
                "llm_reached_rate": round(counts["llm"] / denom, 4),
                "llm_fallbacks_by_reason": dict(self._llm_fallbacks),
            }


# Module-level singleton — shared across all requests in the process.
REQUEST_PATH_METRICS = RequestPathMetrics()


def classify_path(*, cache_hit: bool, fallback_used: bool, llm_called: bool) -> str:
    """Map a resolved response's signals to one of PATHS.

    `llm_called` is the source of truth for whether the provider was invoked,
    because a local deterministic answer (static/extractive) is indistinguishable
    from a real model answer by looking at the response object alone.
    """
    if cache_hit:
        return "cache"
    if llm_called:
        return "llm"
    if fallback_used:
        return "local_reject"
    return "local"
