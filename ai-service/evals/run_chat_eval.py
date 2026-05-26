"""
Lisan AI — Chat Evaluation Harness
====================================
Reads chat_eval_dataset.json (160+ cases), runs every case through the live
FastAPI engine via TestClient, measures all quality metrics, and writes a
Markdown report to evals/reports/chat_eval_latest.md.

Usage:
    cd ai-service
    python -m evals.run_chat_eval            # full run
    python -m evals.run_chat_eval --dry-run  # validate dataset only, no HTTP
    python -m evals.run_chat_eval --category wrong_language  # single category
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

# ── path setup ────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from main import app  # noqa: E402  (FastAPI instance)

from fastapi.testclient import TestClient  # noqa: E402

# ── paths ─────────────────────────────────────────────────────────────────────
DATASET_PATH = ROOT_DIR / "evals" / "chat_eval_dataset.json"
REPORT_DIR = ROOT_DIR / "evals" / "reports"
MD_REPORT_PATH = REPORT_DIR / "chat_eval_latest.md"
JSON_REPORT_PATH = REPORT_DIR / "chat_eval_latest.json"

# ── constants ─────────────────────────────────────────────────────────────────
CHAT_ENDPOINT = "/api/ai/chat"

# Categories where mustFallback=True and the engine is expected to fire a
# fallback reason — used to compute recall / precision on fallback detection.
FALLBACK_CATEGORIES: frozenset[str] = frozenset(
    {"out_of_scope", "wrong_language", "weird", "too_long", "advanced_hebrew"}
)

# Categories where the engine must NOT use a fallback.
CLEAN_CATEGORIES: frozenset[str] = frozenset(
    {"a1_valid", "arabic_requested", "short"}
)


# ── data structures ───────────────────────────────────────────────────────────
@dataclass
class EvalCase:
    """One row from the dataset JSON."""

    id: str
    category: str
    message: str
    level: str
    include_arabic: bool
    expected_behavior: str   # "answer" | "fallback"
    must_fallback: bool
    allow_arabic: bool
    max_hebrew_words: int
    notes: str


@dataclass
class CaseResult:
    """Measured outcome for one EvalCase."""

    case: EvalCase
    http_status: int
    answer_he: str
    answer_ar: str | None
    fallback_used: bool
    fallback_reason: str | None
    cache_hit: bool
    router_hit: bool
    latency_ms: int          # internal engine latency (from response body)
    http_latency_ms: int     # wall-clock HTTP round-trip
    vocabulary_leakage: bool
    blocked_tokens: list[str]
    context_chunk_ids: list[str]

    # ── derived pass/fail flags ────────────────────────────────────────────
    @property
    def crashed(self) -> bool:
        return self.http_status != 200

    @property
    def fallback_correct(self) -> bool:
        """True when the fallback expectation matches reality."""
        return self.fallback_used == self.case.must_fallback

    @property
    def no_leakage(self) -> bool:
        return not self.vocabulary_leakage

    @property
    def length_ok(self) -> bool:
        """Hebrew word count respects the per-case cap."""
        if not self.answer_he:
            return True
        words = [w for w in self.answer_he.split() if w]
        return len(words) <= self.case.max_hebrew_words

    @property
    def arabic_policy_ok(self) -> bool:
        """Arabic present only when allowed by the case definition."""
        if self.answer_ar:
            return self.case.allow_arabic
        return True

    @property
    def passed(self) -> bool:
        return (
            not self.crashed
            and self.fallback_correct
            and self.no_leakage
            and self.length_ok
            and self.arabic_policy_ok
        )


@dataclass
class CategoryStats:
    name: str
    total: int = 0
    passed: int = 0
    fallback_correct: int = 0
    leakage_count: int = 0
    crash_count: int = 0
    latencies_ms: list[int] = field(default_factory=list)

    @property
    def pass_rate(self) -> float:
        return self.passed / self.total if self.total else 0.0

    @property
    def avg_latency_ms(self) -> float:
        return statistics.mean(self.latencies_ms) if self.latencies_ms else 0.0


# ── dataset loader ────────────────────────────────────────────────────────────
def load_dataset(path: Path, category_filter: str | None = None) -> list[EvalCase]:
    raw: list[dict] = json.loads(path.read_text(encoding="utf-8"))
    cases: list[EvalCase] = []
    for item in raw:
        cat = item.get("category", "unknown")
        if category_filter and cat != category_filter:
            continue
        cases.append(
            EvalCase(
                id=item["id"],
                category=cat,
                message=item["message"],
                level=item.get("level", "A1"),
                include_arabic=item.get("includeArabic", False),
                expected_behavior=item.get("expectedBehavior", "answer"),
                must_fallback=item.get("mustFallback", False),
                allow_arabic=item.get("allowArabic", False),
                max_hebrew_words=item.get("maxHebrewWords", 12),
                notes=item.get("notes", ""),
            )
        )
    return cases


# ── runner ────────────────────────────────────────────────────────────────────
def run_case(client: TestClient, case: EvalCase) -> CaseResult:
    payload = {
        "message": case.message,
        "level": case.level,
        "includeArabic": case.include_arabic,
    }
    t0 = time.perf_counter()
    response = client.post(CHAT_ENDPOINT, json=payload)
    http_latency_ms = int(round((time.perf_counter() - t0) * 1000))

    if response.status_code != 200:
        return CaseResult(
            case=case,
            http_status=response.status_code,
            answer_he="",
            answer_ar=None,
            fallback_used=False,
            fallback_reason=None,
            cache_hit=False,
            router_hit=False,
            latency_ms=0,
            http_latency_ms=http_latency_ms,
            vocabulary_leakage=False,
            blocked_tokens=[],
            context_chunk_ids=[],
        )

    body: dict = response.json()
    guardrail = body.get("guardrail") or {}
    return CaseResult(
        case=case,
        http_status=response.status_code,
        answer_he=body.get("answerHe") or "",
        answer_ar=body.get("answerAr"),
        fallback_used=bool(body.get("fallbackUsed", False)),
        fallback_reason=body.get("fallbackReason"),
        cache_hit=bool(body.get("cacheHit", False)),
        router_hit=bool(body.get("routerHit", False)),
        latency_ms=int(body.get("latencyMs", 0)),
        http_latency_ms=http_latency_ms,
        vocabulary_leakage=bool(guardrail.get("vocabularyLeakage", False)),
        blocked_tokens=guardrail.get("blockedTokens") or [],
        context_chunk_ids=body.get("contextChunkIds") or [],
    )


def run_all(cases: list[EvalCase]) -> Iterator[CaseResult]:
    with TestClient(app) as client:
        for case in cases:
            yield run_case(client, case)


# ── metrics aggregation ───────────────────────────────────────────────────────
def _percentile(values: list[int], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    s = sorted(values)
    rank = (len(s) - 1) * p
    lo, hi = int(rank), min(len(s) - 1, int(rank) + 1)
    return s[lo] + (s[hi] - s[lo]) * (rank - lo)


@dataclass
class EvalSummary:
    run_at: str
    dataset_path: str
    total: int
    passed: int
    crashed: int
    # fallback metrics
    fallback_tp: int   # mustFallback=True  & fallbackUsed=True   (correct rejection)
    fallback_tn: int   # mustFallback=False & fallbackUsed=False  (correct pass)
    fallback_fp: int   # mustFallback=False & fallbackUsed=True   (false alarm)
    fallback_fn: int   # mustFallback=True  & fallbackUsed=False  (missed rejection)
    # leakage
    leakage_count: int
    leakage_rate: float
    # latency (internal engine ms)
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    # latency (HTTP wall-clock ms)
    avg_http_latency_ms: float
    p95_http_latency_ms: float
    # response size
    avg_answer_words: float
    max_answer_words: int
    length_violation_count: int
    # cache / router
    cache_hit_count: int
    router_hit_count: int
    # arabic policy
    arabic_violation_count: int
    # per-category stats
    by_category: dict[str, CategoryStats]

    @property
    def pass_rate(self) -> float:
        return self.passed / self.total if self.total else 0.0

    @property
    def fallback_precision(self) -> float:
        denom = self.fallback_tp + self.fallback_fp
        return self.fallback_tp / denom if denom else 0.0

    @property
    def fallback_recall(self) -> float:
        denom = self.fallback_tp + self.fallback_fn
        return self.fallback_tp / denom if denom else 0.0

    @property
    def fallback_f1(self) -> float:
        p, r = self.fallback_precision, self.fallback_recall
        return 2 * p * r / (p + r) if (p + r) else 0.0


def compute_summary(results: list[CaseResult], dataset_path: Path) -> EvalSummary:
    latencies = sorted(r.latency_ms for r in results)
    http_latencies = sorted(r.http_latency_ms for r in results)

    answer_word_counts = [
        len([w for w in r.answer_he.split() if w])
        for r in results
        if not r.fallback_used and r.answer_he
    ]

    by_category: dict[str, CategoryStats] = {}
    for r in results:
        cat = r.case.category
        if cat not in by_category:
            by_category[cat] = CategoryStats(name=cat)
        cs = by_category[cat]
        cs.total += 1
        cs.latencies_ms.append(r.latency_ms)
        if r.passed:
            cs.passed += 1
        if r.fallback_correct:
            cs.fallback_correct += 1
        if r.vocabulary_leakage:
            cs.leakage_count += 1
        if r.crashed:
            cs.crash_count += 1

    return EvalSummary(
        run_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        dataset_path=str(dataset_path),
        total=len(results),
        passed=sum(1 for r in results if r.passed),
        crashed=sum(1 for r in results if r.crashed),
        fallback_tp=sum(1 for r in results if r.case.must_fallback and r.fallback_used),
        fallback_tn=sum(1 for r in results if not r.case.must_fallback and not r.fallback_used),
        fallback_fp=sum(1 for r in results if not r.case.must_fallback and r.fallback_used),
        fallback_fn=sum(1 for r in results if r.case.must_fallback and not r.fallback_used),
        leakage_count=sum(1 for r in results if r.vocabulary_leakage),
        leakage_rate=sum(1 for r in results if r.vocabulary_leakage) / len(results) if results else 0.0,
        avg_latency_ms=round(statistics.mean(latencies), 2) if latencies else 0.0,
        p50_latency_ms=round(_percentile(latencies, 0.50), 2),
        p95_latency_ms=round(_percentile(latencies, 0.95), 2),
        p99_latency_ms=round(_percentile(latencies, 0.99), 2),
        avg_http_latency_ms=round(statistics.mean(http_latencies), 2) if http_latencies else 0.0,
        p95_http_latency_ms=round(_percentile(http_latencies, 0.95), 2),
        avg_answer_words=round(statistics.mean(answer_word_counts), 2) if answer_word_counts else 0.0,
        max_answer_words=max(answer_word_counts) if answer_word_counts else 0,
        length_violation_count=sum(1 for r in results if not r.length_ok),
        cache_hit_count=sum(1 for r in results if r.cache_hit),
        router_hit_count=sum(1 for r in results if r.router_hit),
        arabic_violation_count=sum(1 for r in results if not r.arabic_policy_ok),
        by_category=by_category,
    )


# ── markdown renderer ─────────────────────────────────────────────────────────
def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def _badge(value: float, good_threshold: float = 0.95) -> str:
    return "✅" if value >= good_threshold else "⚠️"


def render_markdown(summary: EvalSummary, results: list[CaseResult]) -> str:
    lines: list[str] = []

    # header
    lines += [
        "# Lisan Chat Eval — QA Report",
        "",
        f"**Run at:** {summary.run_at}  ",
        f"**Dataset:** `{Path(summary.dataset_path).name}`  ",
        f"**Cases:** {summary.total}",
        "",
        "---",
        "",
    ]

    # overall score
    overall_badge = _badge(summary.pass_rate)
    lines += [
        "## Overall Score",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| **Pass rate** | {overall_badge} **{_pct(summary.pass_rate)}** ({summary.passed}/{summary.total}) |",
        f"| Crashes (HTTP ≠ 200) | {summary.crashed} |",
        "",
    ]

    # fallback quality
    fb_badge = _badge(summary.fallback_recall)
    lines += [
        "## Fallback Detection Quality",
        "",
        "> Measures whether the guardrails fire exactly when they should.",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| **Recall** (caught bad inputs) | {fb_badge} **{_pct(summary.fallback_recall)}** |",
        f"| **Precision** (no false alarms) | {_badge(summary.fallback_precision)} **{_pct(summary.fallback_precision)}** |",
        f"| **F1** | {_pct(summary.fallback_f1)} |",
        f"| True Positives (correct rejections) | {summary.fallback_tp} |",
        f"| True Negatives (correct passes) | {summary.fallback_tn} |",
        f"| False Positives (false alarms) | {summary.fallback_fp} |",
        f"| False Negatives (missed rejections) | {summary.fallback_fn} |",
        "",
    ]

    # vocabulary leakage
    leakage_badge = "✅" if summary.leakage_rate == 0.0 else "🚨"
    lines += [
        "## Vocabulary Leakage",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| **Leakage rate** | {leakage_badge} **{_pct(summary.leakage_rate)}** |",
        f"| Cases with leakage | {summary.leakage_count} / {summary.total} |",
        "",
    ]

    # latency
    lines += [
        "## Latency (Internal Engine — ms)",
        "",
        f"| Percentile | Value |",
        f"|------------|-------|",
        f"| Average | {summary.avg_latency_ms} ms |",
        f"| P50 | {summary.p50_latency_ms} ms |",
        f"| P95 | {summary.p95_latency_ms} ms |",
        f"| P99 | {summary.p99_latency_ms} ms |",
        "",
        "## Latency (HTTP Wall-Clock — ms)",
        "",
        f"| Percentile | Value |",
        f"|------------|-------|",
        f"| Average | {summary.avg_http_latency_ms} ms |",
        f"| P95 | {summary.p95_http_latency_ms} ms |",
        "",
    ]

    # response size
    length_badge = "✅" if summary.length_violation_count == 0 else "⚠️"
    lines += [
        "## Response Size",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Average answer words | {summary.avg_answer_words} |",
        f"| Max answer words | {summary.max_answer_words} |",
        f"| **Length violations (> 12 words)** | {length_badge} **{summary.length_violation_count}** |",
        "",
    ]

    # speed layer
    no_llm = summary.cache_hit_count + summary.router_hit_count
    no_llm_rate = no_llm / summary.total if summary.total else 0.0
    lines += [
        "## Speed Layer",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Router hits (zero LLM cost) | {summary.router_hit_count} |",
        f"| Cache hits | {summary.cache_hit_count} |",
        f"| **No-LLM rate** | {_pct(no_llm_rate)} ({no_llm}/{summary.total}) |",
        "",
    ]

    # arabic policy
    ar_badge = "✅" if summary.arabic_violation_count == 0 else "⚠️"
    lines += [
        "## Arabic Policy",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| **Violations** | {ar_badge} **{summary.arabic_violation_count}** |",
        "",
    ]

    # per-category breakdown
    lines += [
        "## Per-Category Breakdown",
        "",
        "| Category | Cases | Pass rate | Fallback correct | Leakage | Avg latency ms |",
        "|----------|-------|-----------|------------------|---------|----------------|",
    ]
    for cat_name in sorted(summary.by_category):
        cs = summary.by_category[cat_name]
        lines.append(
            f"| `{cat_name}` "
            f"| {cs.total} "
            f"| {_pct(cs.pass_rate)} "
            f"| {cs.fallback_correct}/{cs.total} "
            f"| {cs.leakage_count} "
            f"| {round(cs.avg_latency_ms, 1)} ms |"
        )
    lines.append("")

    # failures drill-down
    failures = [r for r in results if not r.passed]
    if failures:
        lines += [
            "## Failures",
            "",
            f"**{len(failures)} case(s) failed.** Details below:",
            "",
            "| ID | Category | Fail reason | Answer |",
            "|----|----------|-------------|--------|",
        ]
        for r in failures:
            reasons: list[str] = []
            if r.crashed:
                reasons.append(f"HTTP {r.http_status}")
            if not r.fallback_correct:
                expected = "fallback" if r.case.must_fallback else "answer"
                got = "fallback" if r.fallback_used else "answer"
                reasons.append(f"expected {expected}, got {got} ({r.fallback_reason})")
            if not r.no_leakage:
                reasons.append(f"leakage:{r.blocked_tokens[:3]}")
            if not r.length_ok:
                word_count = len([w for w in r.answer_he.split() if w])
                reasons.append(f"length={word_count}")
            if not r.arabic_policy_ok:
                reasons.append("arabic_violation")
            reason_str = "; ".join(reasons) or "unknown"
            answer_preview = (r.answer_he or "")[:60].replace("|", "｜")
            lines.append(
                f"| `{r.case.id}` | `{r.case.category}` | {reason_str} | {answer_preview} |"
            )
        lines.append("")
    else:
        lines += ["## Failures", "", "✅ **No failures.**", ""]

    # footer
    lines += [
        "---",
        "",
        f"*Generated by `evals/run_chat_eval.py` — {summary.run_at}*",
    ]

    return "\n".join(lines)


# ── JSON export ───────────────────────────────────────────────────────────────
def results_to_json(summary: EvalSummary, results: list[CaseResult]) -> dict:
    return {
        "meta": {
            "run_at": summary.run_at,
            "dataset": summary.dataset_path,
            "total": summary.total,
        },
        "summary": {
            "pass_rate": round(summary.pass_rate, 4),
            "passed": summary.passed,
            "crashed": summary.crashed,
            "fallback_recall": round(summary.fallback_recall, 4),
            "fallback_precision": round(summary.fallback_precision, 4),
            "fallback_f1": round(summary.fallback_f1, 4),
            "fallback_tp": summary.fallback_tp,
            "fallback_tn": summary.fallback_tn,
            "fallback_fp": summary.fallback_fp,
            "fallback_fn": summary.fallback_fn,
            "leakage_count": summary.leakage_count,
            "leakage_rate": round(summary.leakage_rate, 4),
            "avg_latency_ms": summary.avg_latency_ms,
            "p95_latency_ms": summary.p95_latency_ms,
            "p99_latency_ms": summary.p99_latency_ms,
            "avg_http_latency_ms": summary.avg_http_latency_ms,
            "length_violation_count": summary.length_violation_count,
            "cache_hit_count": summary.cache_hit_count,
            "router_hit_count": summary.router_hit_count,
            "arabic_violation_count": summary.arabic_violation_count,
        },
        "by_category": {
            name: {
                "total": cs.total,
                "passed": cs.passed,
                "pass_rate": round(cs.pass_rate, 4),
                "fallback_correct": cs.fallback_correct,
                "leakage_count": cs.leakage_count,
                "crash_count": cs.crash_count,
                "avg_latency_ms": round(cs.avg_latency_ms, 2),
            }
            for name, cs in summary.by_category.items()
        },
        "results": [
            {
                "id": r.case.id,
                "category": r.case.category,
                "message": r.case.message,
                "passed": r.passed,
                "http_status": r.http_status,
                "answer_he": r.answer_he,
                "answer_ar": r.answer_ar,
                "fallback_used": r.fallback_used,
                "fallback_reason": r.fallback_reason,
                "fallback_correct": r.fallback_correct,
                "cache_hit": r.cache_hit,
                "router_hit": r.router_hit,
                "latency_ms": r.latency_ms,
                "http_latency_ms": r.http_latency_ms,
                "vocabulary_leakage": r.vocabulary_leakage,
                "blocked_tokens": r.blocked_tokens,
                "length_ok": r.length_ok,
                "arabic_policy_ok": r.arabic_policy_ok,
            }
            for r in results
        ],
    }


# ── CLI entry point ───────────────────────────────────────────────────────────
def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lisan Chat Evaluation Harness")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate dataset only — do not call the engine.",
    )
    parser.add_argument(
        "--category",
        metavar="NAME",
        default=None,
        help="Run only cases from this category (e.g. wrong_language).",
    )
    parser.add_argument(
        "--dataset",
        metavar="PATH",
        default=str(DATASET_PATH),
        help="Path to the eval dataset JSON.",
    )
    parser.add_argument(
        "--no-json",
        action="store_true",
        help="Skip writing the JSON report (write Markdown only).",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    dataset_path = Path(args.dataset)

    if not dataset_path.exists():
        print(f"[ERROR] Dataset not found: {dataset_path}", file=sys.stderr)
        return 1

    cases = load_dataset(dataset_path, category_filter=args.category)
    if not cases:
        print("[ERROR] No cases matched — check --category filter.", file=sys.stderr)
        return 1

    print(f"[eval] Loaded {len(cases)} cases from {dataset_path.name}")

    if args.dry_run:
        print("[eval] --dry-run: dataset valid, skipping engine calls.")
        return 0

    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    results: list[CaseResult] = []
    for i, result in enumerate(run_all(cases), start=1):
        status = "✓" if result.passed else "✗"
        print(
            f"  [{i:>3}/{len(cases)}] {status} {result.case.id:<30} "
            f"latency={result.latency_ms:>4}ms  "
            f"fallback={str(result.fallback_used):<5}  "
            f"{'LEAK' if result.vocabulary_leakage else '    '}"
        )
        results.append(result)

    summary = compute_summary(results, dataset_path)

    md_content = render_markdown(summary, results)
    MD_REPORT_PATH.write_text(md_content, encoding="utf-8")
    print(f"\n[eval] Markdown report → {MD_REPORT_PATH}")

    if not args.no_json:
        json_content = results_to_json(summary, results)
        JSON_REPORT_PATH.write_text(
            json.dumps(json_content, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[eval] JSON report    → {JSON_REPORT_PATH}")

    # print summary to stdout for CI
    print(f"\n{'═' * 60}")
    print(f"  PASS RATE        : {_pct(summary.pass_rate)} ({summary.passed}/{summary.total})")
    print(f"  FALLBACK RECALL  : {_pct(summary.fallback_recall)}")
    print(f"  FALLBACK PREC.   : {_pct(summary.fallback_precision)}")
    print(f"  LEAKAGE RATE     : {_pct(summary.leakage_rate)}")
    print(f"  AVG LATENCY      : {summary.avg_latency_ms} ms  (P95: {summary.p95_latency_ms} ms)")
    print(f"  LENGTH VIOLATIONS: {summary.length_violation_count}")
    print(f"  CRASHES          : {summary.crashed}")
    print(f"{'═' * 60}")

    # exit 1 if critical thresholds are not met (useful for CI)
    if summary.pass_rate < 0.80:
        print("[eval] FAIL — pass rate below 80% threshold.", file=sys.stderr)
        return 1
    if summary.leakage_rate > 0.05:
        print("[eval] FAIL — vocabulary leakage above 5% threshold.", file=sys.stderr)
        return 1

    print("[eval] All thresholds met. ✅")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    exit_code = main()
    sys.stdout.flush()
    os._exit(exit_code)
