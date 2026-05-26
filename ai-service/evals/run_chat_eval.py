from __future__ import annotations

import json
import statistics
import sys
import time
from dataclasses import dataclass
from datetime import datetime, UTC
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from services.chat_cache import EXACT_RESPONSE_CACHE
from services.chat_engine import generate_chat_response
from services.chat_guardrails import count_hebrew_words
from services.chat_schemas import ChatRequest

DATASET_PATH = ROOT_DIR / "evals" / "chat_eval_dataset.json"
REPORTS_DIR = ROOT_DIR / "evals" / "reports"
MARKDOWN_REPORT_PATH = REPORTS_DIR / "chat_eval_latest.md"
JSON_REPORT_PATH = REPORTS_DIR / "chat_eval_latest.json"


@dataclass
class EvalCase:
    id: str
    category: str
    message: str
    level: str
    include_arabic: bool
    expected_behavior: str
    must_fallback: bool
    expected_fallback_reason: str | None
    max_hebrew_words: int
    notes: str


@dataclass
class EvalResult:
    case: EvalCase
    answer_he: str
    answer_ar: str | None
    fallback_used: bool
    fallback_reason: str | None
    latency_ms: int
    wall_latency_ms: float
    cache_hit: bool
    router_hit: bool
    vocabulary_leakage: bool
    blocked_tokens: list[str]
    over_length: bool


def load_dataset(path: Path) -> list[EvalCase]:
    raw_cases = json.loads(path.read_text(encoding="utf-8"))
    cases: list[EvalCase] = []
    for item in raw_cases:
        cases.append(
            EvalCase(
                id=item["id"],
                category=item["category"],
                message=item["message"],
                level=item.get("level", "A1"),
                include_arabic=bool(item.get("includeArabic", False)),
                expected_behavior=item["expectedBehavior"],
                must_fallback=bool(item["mustFallback"]),
                expected_fallback_reason=item.get("expectedFallbackReason"),
                max_hebrew_words=int(item.get("maxHebrewWords", 12)),
                notes=item.get("notes", ""),
            )
        )
    return cases


def run_case(case: EvalCase) -> EvalResult:
    started_at = time.perf_counter()
    response = generate_chat_response(
        ChatRequest(
            message=case.message,
            level=case.level,
            includeArabic=case.include_arabic,
        )
    )
    wall_latency_ms = (time.perf_counter() - started_at) * 1000
    over_length = count_hebrew_words(response.answerHe) > case.max_hebrew_words
    return EvalResult(
        case=case,
        answer_he=response.answerHe,
        answer_ar=response.answerAr,
        fallback_used=response.fallbackUsed,
        fallback_reason=response.fallbackReason,
        latency_ms=response.latencyMs,
        wall_latency_ms=wall_latency_ms,
        cache_hit=response.cacheHit,
        router_hit=response.routerHit,
        vocabulary_leakage=response.guardrail.vocabularyLeakage,
        blocked_tokens=list(response.guardrail.blockedTokens),
        over_length=over_length,
    )


def percentile(values: list[int], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    ordered = sorted(values)
    rank = (len(ordered) - 1) * p
    low = int(rank)
    high = min(len(ordered) - 1, low + 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def build_summary(results: list[EvalResult]) -> dict:
    total = len(results)
    leakage_count = sum(1 for result in results if result.vocabulary_leakage)
    over_length_count = sum(1 for result in results if result.over_length)

    fallback_correct = sum(
        1
        for result in results
        if result.fallback_used == result.case.must_fallback
    )
    fallback_reason_correct = sum(
        1
        for result in results
        if result.case.expected_fallback_reason is None
        or result.fallback_reason == result.case.expected_fallback_reason
    )

    wall_latencies = [result.wall_latency_ms for result in results]
    engine_latencies = [result.latency_ms for result in results]

    category_breakdown: dict[str, dict] = {}
    for result in results:
        category_stats = category_breakdown.setdefault(
            result.case.category,
            {
                "total": 0,
                "fallback_correct": 0,
                "leakage_count": 0,
                "over_length_count": 0,
                "avg_wall_latency_ms": 0.0,
                "_wall_latencies": [],
            },
        )
        category_stats["total"] += 1
        category_stats["fallback_correct"] += int(result.fallback_used == result.case.must_fallback)
        category_stats["leakage_count"] += int(result.vocabulary_leakage)
        category_stats["over_length_count"] += int(result.over_length)
        category_stats["_wall_latencies"].append(result.wall_latency_ms)

    for stats in category_breakdown.values():
        latencies = stats.pop("_wall_latencies")
        stats["avg_wall_latency_ms"] = round(statistics.mean(latencies), 2) if latencies else 0.0

    failing_cases = []
    for result in results:
        reasons: list[str] = []
        if result.fallback_used != result.case.must_fallback:
            reasons.append("fallback_mismatch")
        if result.case.expected_fallback_reason and result.fallback_reason != result.case.expected_fallback_reason:
            reasons.append("fallback_reason_mismatch")
        if result.vocabulary_leakage:
            reasons.append("vocabulary_leakage")
        if result.over_length:
            reasons.append("over_length")
        if reasons:
            failing_cases.append(
                {
                    "id": result.case.id,
                    "category": result.case.category,
                    "message": result.case.message,
                    "issues": reasons,
                    "fallbackUsed": result.fallback_used,
                    "fallbackReason": result.fallback_reason,
                    "latencyMs": result.latency_ms,
                    "wallLatencyMs": round(result.wall_latency_ms, 2),
                    "blockedTokens": result.blocked_tokens,
                }
            )

    return {
        "runAt": datetime.now(UTC).isoformat(),
        "datasetPath": str(DATASET_PATH),
        "totalCases": total,
        "metrics": {
            "vocabularyLeakageRate": round((leakage_count / total) * 100, 2) if total else 0.0,
            "fallbackAccuracy": round((fallback_correct / total) * 100, 2) if total else 0.0,
            "fallbackReasonAccuracy": round((fallback_reason_correct / total) * 100, 2) if total else 0.0,
            "averageLatencyMs": round(statistics.mean(wall_latencies), 2) if wall_latencies else 0.0,
            "p95LatencyMs": round(percentile(wall_latencies, 0.95), 2),
            "engineAverageLatencyMs": round(statistics.mean(engine_latencies), 2) if engine_latencies else 0.0,
            "engineP95LatencyMs": round(percentile(engine_latencies, 0.95), 2),
            "overLengthResponses": over_length_count,
        },
        "counts": {
            "vocabularyLeakageCases": leakage_count,
            "fallbackCorrectCases": fallback_correct,
            "fallbackReasonCorrectCases": fallback_reason_correct,
            "overLengthCases": over_length_count,
            "cacheHitCases": sum(1 for result in results if result.cache_hit),
            "routerHitCases": sum(1 for result in results if result.router_hit),
            "fallbackCases": sum(1 for result in results if result.fallback_used),
        },
        "categoryBreakdown": category_breakdown,
        "failingCases": failing_cases[:20],
    }


def render_markdown_report(summary: dict) -> str:
    metrics = summary["metrics"]
    counts = summary["counts"]
    lines = [
        "# Chat Eval Report",
        "",
        f"- Run at: `{summary['runAt']}`",
        f"- Dataset: `{summary['datasetPath']}`",
        f"- Total cases: `{summary['totalCases']}`",
        "",
        "## Metrics",
        "",
        f"- Vocabulary leakage rate: `{metrics['vocabularyLeakageRate']}%`",
        f"- Fallback accuracy: `{metrics['fallbackAccuracy']}%`",
        f"- Fallback reason accuracy: `{metrics['fallbackReasonAccuracy']}%`",
        f"- Average latency: `{metrics['averageLatencyMs']} ms`",
        f"- P95 latency: `{metrics['p95LatencyMs']} ms`",
        f"- Engine average latency: `{metrics['engineAverageLatencyMs']} ms`",
        f"- Engine P95 latency: `{metrics['engineP95LatencyMs']} ms`",
        f"- Over-length responses: `{metrics['overLengthResponses']}`",
        "",
        "## Counts",
        "",
        f"- Fallback cases returned: `{counts['fallbackCases']}`",
        f"- Fallback-correct cases: `{counts['fallbackCorrectCases']}`",
        f"- Fallback-reason-correct cases: `{counts['fallbackReasonCorrectCases']}`",
        f"- Cache hits: `{counts['cacheHitCases']}`",
        f"- Router hits: `{counts['routerHitCases']}`",
        f"- Vocabulary leakage cases: `{counts['vocabularyLeakageCases']}`",
        "",
        "## Category Breakdown",
        "",
        "| Category | Total | Fallback Correct | Leakage | Over Length | Avg Wall Latency (ms) |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]

    for category, stats in sorted(summary["categoryBreakdown"].items()):
        lines.append(
            f"| {category} | {stats['total']} | {stats['fallback_correct']} | "
            f"{stats['leakage_count']} | {stats['over_length_count']} | {stats['avg_wall_latency_ms']} |"
        )

    failing_cases = summary["failingCases"]
    lines.extend(["", "## Failing Cases", ""])
    if not failing_cases:
        lines.append("No failing cases.")
    else:
        for case in failing_cases:
            lines.append(
                f"- `{case['id']}` [{case['category']}] issues={case['issues']} "
                f"fallbackReason=`{case['fallbackReason']}` latency=`{case['wallLatencyMs']} ms` "
                f"message=`{case['message']}`"
            )

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    EXACT_RESPONSE_CACHE.clear()
    cases = load_dataset(DATASET_PATH)
    results = [run_case(case) for case in cases]
    summary = build_summary(results)
    markdown_report = render_markdown_report(summary)

    JSON_REPORT_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    MARKDOWN_REPORT_PATH.write_text(markdown_report, encoding="utf-8")

    print(markdown_report)


if __name__ == "__main__":
    main()
