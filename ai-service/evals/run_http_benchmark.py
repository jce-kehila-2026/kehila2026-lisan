from __future__ import annotations

import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, UTC
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

DATASET_PATH = ROOT_DIR / "evals" / "chat_eval_dataset.json"
REPORTS_DIR = ROOT_DIR / "evals" / "reports"
MARKDOWN_REPORT_PATH = REPORTS_DIR / "http_benchmark_latest.md"
JSON_REPORT_PATH = REPORTS_DIR / "http_benchmark_latest.json"
CHAT_URL = "http://localhost:8000/api/ai/chat"
HEALTH_URL = "http://localhost:8000/api/ai/health"
HTTP_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


@dataclass
class BenchmarkCase:
    id: str
    category: str
    message: str
    level: str
    include_arabic: bool


@dataclass
class BenchmarkResult:
    case: BenchmarkCase
    status_code: int
    wall_latency_ms: float
    service_latency_ms: int | None
    fallback_used: bool
    cache_hit: bool
    router_hit: bool
    error: str | None


def load_dataset() -> list[BenchmarkCase]:
    raw_cases = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    return [
        BenchmarkCase(
            id=item["id"],
            category=item["category"],
            message=item["message"],
            level=item.get("level", "A1"),
            include_arabic=bool(item.get("includeArabic", False)),
        )
        for item in raw_cases
    ]


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    ordered = sorted(values)
    rank = (len(ordered) - 1) * p
    low = int(rank)
    high = min(len(ordered) - 1, low + 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def wait_for_service(timeout_seconds: float = 20.0) -> None:
    started = time.perf_counter()
    while time.perf_counter() - started < timeout_seconds:
        try:
            with HTTP_OPENER.open(HEALTH_URL, timeout=2.0) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Service at {HEALTH_URL} did not become ready within {timeout_seconds} seconds")


def run_case(case: BenchmarkCase) -> BenchmarkResult:
    payload = json.dumps(
        {
            "message": case.message,
            "level": case.level,
            "includeArabic": case.include_arabic,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        CHAT_URL,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )

    started = time.perf_counter()
    try:
        with HTTP_OPENER.open(request, timeout=15.0) as response:
            wall_latency_ms = (time.perf_counter() - started) * 1000
            body = json.loads(response.read().decode("utf-8"))
            return BenchmarkResult(
                case=case,
                status_code=response.status,
                wall_latency_ms=wall_latency_ms,
                service_latency_ms=body.get("latencyMs"),
                fallback_used=bool(body.get("fallbackUsed", False)),
                cache_hit=bool(body.get("cacheHit", False)),
                router_hit=bool(body.get("routerHit", False)),
                error=None,
            )
    except urllib.error.HTTPError as exc:
        wall_latency_ms = (time.perf_counter() - started) * 1000
        error_text = exc.read().decode("utf-8", errors="replace")
        return BenchmarkResult(
            case=case,
            status_code=exc.code,
            wall_latency_ms=wall_latency_ms,
            service_latency_ms=None,
            fallback_used=False,
            cache_hit=False,
            router_hit=False,
            error=error_text,
        )
    except Exception as exc:
        wall_latency_ms = (time.perf_counter() - started) * 1000
        return BenchmarkResult(
            case=case,
            status_code=0,
            wall_latency_ms=wall_latency_ms,
            service_latency_ms=None,
            fallback_used=False,
            cache_hit=False,
            router_hit=False,
            error=str(exc),
        )


def build_summary(results: list[BenchmarkResult]) -> dict:
    wall_latencies = [result.wall_latency_ms for result in results]
    service_latencies = [
        float(result.service_latency_ms)
        for result in results
        if result.service_latency_ms is not None
    ]
    category_breakdown: dict[str, dict] = {}
    for result in results:
        stats = category_breakdown.setdefault(
            result.case.category,
            {
                "total": 0,
                "avg_wall_latency_ms": 0.0,
                "p95_wall_latency_ms": 0.0,
                "http_errors": 0,
                "cache_hits": 0,
                "router_hits": 0,
                "_latencies": [],
            },
        )
        stats["total"] += 1
        stats["http_errors"] += int(result.status_code != 200)
        stats["cache_hits"] += int(result.cache_hit)
        stats["router_hits"] += int(result.router_hit)
        stats["_latencies"].append(result.wall_latency_ms)

    for stats in category_breakdown.values():
        latencies = stats.pop("_latencies")
        stats["avg_wall_latency_ms"] = round(statistics.mean(latencies), 2) if latencies else 0.0
        stats["p95_wall_latency_ms"] = round(percentile(latencies, 0.95), 2) if latencies else 0.0

    failing_cases = [
        {
            "id": result.case.id,
            "category": result.case.category,
            "statusCode": result.status_code,
            "wallLatencyMs": round(result.wall_latency_ms, 2),
            "error": result.error,
        }
        for result in results
        if result.status_code != 200
    ]

    return {
        "runAt": datetime.now(UTC).isoformat(),
        "datasetPath": str(DATASET_PATH),
        "chatUrl": CHAT_URL,
        "totalCases": len(results),
        "metrics": {
            "averageLatencyMs": round(statistics.mean(wall_latencies), 2) if wall_latencies else 0.0,
            "p95LatencyMs": round(percentile(wall_latencies, 0.95), 2),
            "serviceAverageLatencyMs": round(statistics.mean(service_latencies), 2) if service_latencies else 0.0,
            "serviceP95LatencyMs": round(percentile(service_latencies, 0.95), 2) if service_latencies else 0.0,
        },
        "counts": {
            "http200Cases": sum(1 for result in results if result.status_code == 200),
            "httpErrorCases": sum(1 for result in results if result.status_code != 200),
            "fallbackCases": sum(1 for result in results if result.fallback_used),
            "cacheHitCases": sum(1 for result in results if result.cache_hit),
            "routerHitCases": sum(1 for result in results if result.router_hit),
        },
        "categoryBreakdown": category_breakdown,
        "failingCases": failing_cases[:20],
    }


def render_report(summary: dict) -> str:
    metrics = summary["metrics"]
    counts = summary["counts"]
    lines = [
        "# HTTP Benchmark Report",
        "",
        f"- Run at: `{summary['runAt']}`",
        f"- Dataset: `{summary['datasetPath']}`",
        f"- URL: `{summary['chatUrl']}`",
        f"- Total cases: `{summary['totalCases']}`",
        "",
        "## Latency",
        "",
        f"- Average latency: `{metrics['averageLatencyMs']} ms`",
        f"- P95 latency: `{metrics['p95LatencyMs']} ms`",
        f"- Service average latency: `{metrics['serviceAverageLatencyMs']} ms`",
        f"- Service P95 latency: `{metrics['serviceP95LatencyMs']} ms`",
        "",
        "## Counts",
        "",
        f"- HTTP 200 cases: `{counts['http200Cases']}`",
        f"- HTTP error cases: `{counts['httpErrorCases']}`",
        f"- Fallback cases: `{counts['fallbackCases']}`",
        f"- Cache hits: `{counts['cacheHitCases']}`",
        f"- Router hits: `{counts['routerHitCases']}`",
        "",
        "## Category Breakdown",
        "",
        "| Category | Total | Avg Wall Latency (ms) | P95 Wall Latency (ms) | HTTP Errors | Cache Hits | Router Hits |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    for category, stats in sorted(summary["categoryBreakdown"].items()):
        lines.append(
            f"| {category} | {stats['total']} | {stats['avg_wall_latency_ms']} | "
            f"{stats['p95_wall_latency_ms']} | {stats['http_errors']} | "
            f"{stats['cache_hits']} | {stats['router_hits']} |"
        )

    lines.extend(["", "## Failing Cases", ""])
    if not summary["failingCases"]:
        lines.append("No failing cases.")
    else:
        for case in summary["failingCases"]:
            lines.append(
                f"- `{case['id']}` [{case['category']}] status=`{case['statusCode']}` "
                f"latency=`{case['wallLatencyMs']} ms` error=`{case['error']}`"
            )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    wait_for_service()
    results = [run_case(case) for case in load_dataset()]
    summary = build_summary(results)
    markdown = render_report(summary)
    JSON_REPORT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    MARKDOWN_REPORT_PATH.write_text(markdown, encoding="utf-8")
    print(markdown)


if __name__ == "__main__":
    main()
