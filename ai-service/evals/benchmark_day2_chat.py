from __future__ import annotations

import json
import os
import statistics
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from main import app  # noqa: E402

DATASET_PATH = ROOT_DIR / "evals" / "day2_benchmark_30.json"
REPORT_DIR = ROOT_DIR / "evals" / "reports"
JSON_REPORT_PATH = REPORT_DIR / "day2_benchmark_latest.json"
MARKDOWN_REPORT_PATH = REPORT_DIR / "day2_benchmark_latest.md"
FAST_PATH_REASONS = {
    "EMPTY_MESSAGE",
    "UNSUPPORTED_LANGUAGE",
    "MESSAGE_TOO_LONG",
    "OUT_OF_SCOPE",
}


def percentile(values: list[int], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    rank = (len(values) - 1) * p
    lower = int(rank)
    upper = min(len(values) - 1, lower + 1)
    fraction = rank - lower
    return values[lower] + (values[upper] - values[lower]) * fraction


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    results: list[dict] = []
    internal_latencies: list[int] = []
    http_latencies: list[int] = []
    no_llm_count = 0
    router_hits = 0
    cache_hits = 0
    crashes = 0
    leakage_count = 0

    with TestClient(app) as client:
        for item in dataset:
            started_at = time.perf_counter()
            response = client.post("/api/ai/chat", json=item)
            elapsed_ms = int(round((time.perf_counter() - started_at) * 1000))
            if response.status_code != 200:
                crashes += 1
            body = response.json()
            internal_latency_ms = int(body.get("latencyMs", 0))
            internal_latencies.append(internal_latency_ms)
            http_latencies.append(elapsed_ms)
            fallback_reason = body.get("fallbackReason")
            cache_hit = bool(body.get("cacheHit", False))
            router_hit = bool(body.get("routerHit", False))
            leakage = bool(body.get("guardrail", {}).get("vocabularyLeakage", False))

            if cache_hit:
                cache_hits += 1
            if router_hit:
                router_hits += 1
            if leakage:
                leakage_count += 1
            if cache_hit or router_hit:
                no_llm_count += 1

            results.append(
                {
                    "id": item["id"],
                    "message": item["message"],
                    "status": response.status_code,
                    "answerHe": body.get("answerHe"),
                    "fallbackUsed": body.get("fallbackUsed"),
                    "fallbackReason": fallback_reason,
                    "cacheHit": cache_hit,
                    "routerHit": router_hit,
                    "latencyMs": internal_latency_ms,
                    "httpLatencyMs": elapsed_ms,
                    "contextChunkIds": body.get("contextChunkIds", []),
                    "vocabularyLeakage": leakage,
                }
            )

    internal_latencies.sort()
    http_latencies.sort()
    summary = {
        "count": len(results),
        "averageInternalLatencyMs": round(statistics.mean(internal_latencies), 2) if internal_latencies else 0.0,
        "p95InternalLatencyMs": round(percentile(internal_latencies, 0.95), 2),
        "averageHttpLatencyMs": round(statistics.mean(http_latencies), 2) if http_latencies else 0.0,
        "p95HttpLatencyMs": round(percentile(http_latencies, 0.95), 2),
        "routerHitCount": router_hits,
        "cacheHitCount": cache_hits,
        "cacheHitRate": round(cache_hits / len(results), 4) if results else 0.0,
        "noLlmCount": no_llm_count,
        "noLlmRate": round(no_llm_count / len(results), 4) if results else 0.0,
        "crashCount": crashes,
        "vocabularyLeakageCount": leakage_count,
    }

    JSON_REPORT_PATH.write_text(
        json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    MARKDOWN_REPORT_PATH.write_text(render_markdown(summary, results), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False))
    return 0


def render_markdown(summary: dict, results: list[dict]) -> str:
    lines = [
        "# Day 2 Chat Benchmark",
        "",
        "## Summary",
        f"- Requests: {summary['count']}",
        f"- Average internal latency: {summary['averageInternalLatencyMs']} ms",
        f"- P95 internal latency: {summary['p95InternalLatencyMs']} ms",
        f"- Average HTTP latency: {summary['averageHttpLatencyMs']} ms",
        f"- P95 HTTP latency: {summary['p95HttpLatencyMs']} ms",
        f"- Router hit count: {summary['routerHitCount']}",
        f"- Cache hit count: {summary['cacheHitCount']}",
        f"- Cache hit rate: {summary['cacheHitRate']}",
        f"- No-LLM count: {summary['noLlmCount']}",
        f"- No-LLM rate: {summary['noLlmRate']}",
        f"- Crash count: {summary['crashCount']}",
        f"- Vocabulary leakage count: {summary['vocabularyLeakageCount']}",
        "",
        "## Results",
    ]
    for item in results:
        lines.append(
            f"- {item['id']}: status={item['status']} internalLatencyMs={item['latencyMs']} httpLatencyMs={item['httpLatencyMs']} routerHit={item['routerHit']} cacheHit={item['cacheHit']} fallbackReason={item['fallbackReason']}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    exit_code = main()
    sys.stdout.flush()
    os._exit(exit_code)
