"""
run_leakage_report.py

The single most important cost number for running Lisan on a free LLM tier:
*what fraction of requests actually reach the model?*

This driver replays one or more local eval datasets through the REAL chat
engine (offline — the deterministic local/router/cache/reject paths resolve
without any network call) and prints the request-path distribution captured by
services.request_path_metrics:

    local         — served by gatekeeper / router / templates / extractive
    cache         — served from the response cache
    local_reject  — rejected before any LLM call
    llm           — reached the provider (the only slice that costs quota)

It also breaks down WHICH intents/messages fell through to the llm path, so you
can see what to add to the canonical cache or local templates next.

Usage:
    python -m evals.run_leakage_report
    python -m evals.run_leakage_report evals/mixed_language_eval.jsonl ...

Exit code is always 0 — this is a report, not a gate. (The pytest suite gates
correctness; this quantifies cost.)
"""
from __future__ import annotations

import json
import os
import sys

# Auth off for the offline replay; must be set before importing app modules.
os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")
os.environ.setdefault("JWT_SECRET", "")

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from services.chat_engine import generate_chat_response  # noqa: E402
from services.chat_schemas import ChatRequest  # noqa: E402
from services.request_path_metrics import (  # noqa: E402
    REQUEST_PATH_METRICS,
    classify_path,
)

DEFAULT_DATASETS = [
    "evals/mixed_language_eval.jsonl",
    "evals/eval_expected_behavior.jsonl",
]


def _load_cases(path: str) -> list[dict]:
    abspath = path if os.path.isabs(path) else os.path.join(_REPO_ROOT, path)
    cases: list[dict] = []
    if not os.path.exists(abspath):
        print(f"  [skip] dataset not found: {path}")
        return cases
    if abspath.endswith(".jsonl"):
        with open(abspath, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    cases.append(json.loads(line))
    else:
        with open(abspath, encoding="utf-8") as fh:
            data = json.load(fh)
        cases = data if isinstance(data, list) else data.get("cases", [])
    return cases


def _message_of(case: dict) -> str | None:
    for key in ("message", "input", "text", "question"):
        if case.get(key):
            return case[key]
    return None


def run(datasets: list[str]) -> dict:
    REQUEST_PATH_METRICS.reset()
    llm_messages: list[dict] = []
    total = 0

    for ds in datasets:
        cases = _load_cases(ds)
        print(f"  [load] {ds}: {len(cases)} cases")
        for case in cases:
            message = _message_of(case)
            if not message:
                continue
            total += 1
            level = case.get("level", "A1")
            include_arabic = bool(case.get("includeArabic", False))
            resp = generate_chat_response(
                ChatRequest(
                    message=message,
                    level=level,
                    includeArabic=include_arabic,
                )
            )
            # Re-derive the path for the per-message LLM breakdown. The engine
            # already recorded the authoritative counts; here we only need to
            # know which messages were NOT served locally. cacheHit/router/
            # fallback are visible on the response; a non-cache, non-router,
            # non-fallback answer that isn't a known static reply == llm.
            path = classify_path(
                cache_hit=resp.cacheHit,
                fallback_used=resp.fallbackUsed,
                # Heuristic for the report only: an answer with real provider
                # latency reached the model. Local/static replies have 0 ms.
                llm_called=(
                    not resp.cacheHit
                    and not resp.routerHit
                    and (resp.latencyMs or 0) > 0
                ),
            )
            if path == "llm":
                llm_messages.append({
                    "message": message,
                    "level": level,
                    "fallbackReason": resp.fallbackReason,
                })

    snap = REQUEST_PATH_METRICS.snapshot()
    return {"snapshot": snap, "llm_messages": llm_messages, "total": total}


def _print_report(result: dict) -> None:
    snap = result["snapshot"]
    counts = snap["counts"]
    rates = snap["rates"]
    print()
    print("=" * 60)
    print("LLM LEAKAGE REPORT")
    print("=" * 60)
    print(f"  total requests       : {snap['total_requests']}")
    print(f"  local                : {counts['local']:>4}  ({rates['local']:.1%})")
    print(f"  cache                : {counts['cache']:>4}  ({rates['cache']:.1%})")
    print(f"  local_reject         : {counts['local_reject']:>4}  ({rates['local_reject']:.1%})")
    print(f"  llm (COSTS QUOTA)    : {counts['llm']:>4}  ({rates['llm']:.1%})")
    print("-" * 60)
    print(f"  local_served_rate    : {snap['local_served_rate']:.1%}")
    print(f"  llm_reached_rate     : {snap['llm_reached_rate']:.1%}")
    if snap["llm_fallbacks_by_reason"]:
        print(f"  llm fallbacks        : {snap['llm_fallbacks_by_reason']}")
    if result["llm_messages"]:
        print("-" * 60)
        print(f"  messages that reached the LLM ({len(result['llm_messages'])}):")
        for item in result["llm_messages"][:25]:
            print(f"    [{item['level']}] {item['message']}")
    print("=" * 60)


def main() -> int:
    datasets = sys.argv[1:] or DEFAULT_DATASETS
    result = run(datasets)
    _print_report(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
