"""
run_voice_eval.py

In-process voice eval — no microphone, no live server required.

How it works:
  1. Loads voice_eval_cases.json (each case has a tts_text field = the
     Hebrew text that a real STT would return for that audio file).
  2. Calls generate_chat_response() in-process with voiceMode=True,
     passing tts_text directly as the message (STT already mocked).
  3. Validates each response against the case's checks.
  4. Runs each case REPEAT times and checks consistency (same answerHe
     / same fallbackReason across all runs).
  5. Flags any response whose latencyMs exceeds LATENCY_BUDGET_MS
     (unless the case sets skip_latency_check=true).
  6. Writes a Markdown + JSON report to evals/reports/.

Usage:
  python evals/run_voice_eval.py
  python evals/run_voice_eval.py --repeat 3 --latency-budget 3000
"""
from __future__ import annotations

import argparse
import io
import json
import re
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

# --- path bootstrap (must precede local imports) ---
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))  # noqa: E402

# Force UTF-8 stdout so Hebrew text doesn't crash Windows cp1252 terminals
sys.stdout = io.TextIOWrapper(
    sys.stdout.buffer, encoding="utf-8", errors="replace"
)

from services.chat_engine import generate_chat_response  # noqa: E402
from services.chat_guardrails import count_hebrew_words  # noqa: E402
from services.chat_schemas import ChatRequest  # noqa: E402

EVALS_DIR = Path(__file__).parent
CASES_FILE = EVALS_DIR / "voice_eval_cases.json"
REPORTS_DIR = EVALS_DIR / "reports"

ARABIC_RE = re.compile(r"[؀-ۿ]")

DEFAULT_REPEAT = 1
DEFAULT_LATENCY_BUDGET = 3000  # ms — Task 9 target


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class VoiceEvalCase:
    id: str
    description: str
    tts_text: str            # text STT would return (message passed directly)
    student_level: str
    checks: dict
    skip_latency_check: bool = False


@dataclass
class RunResult:
    answer_he: str
    fallback_used: bool
    fallback_reason: str | None
    latency_ms: int
    errors: list[str] = field(default_factory=list)


@dataclass
class CaseResult:
    case: VoiceEvalCase
    runs: list[RunResult] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "FAIL" if any(r.errors for r in self.runs) else "PASS"

    @property
    def all_errors(self) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for r in self.runs:
            for e in r.errors:
                if e not in seen:
                    seen.add(e)
                    out.append(e)
        return out

    @property
    def avg_latency_ms(self) -> float:
        lats = [r.latency_ms for r in self.runs]
        return round(statistics.mean(lats), 1) if lats else 0.0

    @property
    def max_latency_ms(self) -> int:
        return max((r.latency_ms for r in self.runs), default=0)


# ---------------------------------------------------------------------------
# Check engine
# ---------------------------------------------------------------------------

def _run_checks(
    answer_he: str,
    fallback_used: bool,
    fallback_reason: str | None,
    transcribed_text: str,
    checks: dict,
    latency_ms: int,
    latency_budget: int,
    skip_latency: bool = False,
) -> list[str]:
    errors: list[str] = []

    substr = checks.get("transcribed_text_contains")
    if substr and substr not in transcribed_text:
        errors.append(
            f"transcribedText '{transcribed_text}' missing '{substr}'"
        )

    if "answer_he_not_empty" in checks:
        is_empty = not answer_he.strip()
        if checks["answer_he_not_empty"] and is_empty:
            errors.append("answerHe is empty, expected non-empty")
        if not checks["answer_he_not_empty"] and not is_empty:
            errors.append(
                f"answerHe should be empty, got '{answer_he}'"
            )

    max_words = checks.get("answer_he_max_words")
    if max_words is not None:
        wc = count_hebrew_words(answer_he)
        if wc > max_words:
            errors.append(f"answerHe has {wc} words, max is {max_words}")

    if checks.get("no_arabic_in_answer") and ARABIC_RE.search(answer_he):
        errors.append(f"answerHe contains Arabic: '{answer_he}'")

    if "fallback_used" in checks:
        if fallback_used != checks["fallback_used"]:
            errors.append(
                f"fallbackUsed={fallback_used},"
                f" expected {checks['fallback_used']}"
            )

    allowed = checks.get("fallback_reason_one_of")
    if allowed and fallback_reason not in allowed:
        errors.append(
            f"fallbackReason='{fallback_reason}',"
            f" expected one of {allowed}"
        )

    if not skip_latency and latency_ms > latency_budget:
        errors.append(
            f"latency {latency_ms} ms exceeds budget {latency_budget} ms"
        )

    return errors


# ---------------------------------------------------------------------------
# Case runner
# ---------------------------------------------------------------------------

def _run_case_once(case: VoiceEvalCase, latency_budget: int) -> RunResult:
    t0 = time.perf_counter()
    response = generate_chat_response(
        ChatRequest(
            message=case.tts_text,
            level=case.student_level,
            includeArabic=False,
            voiceMode=True,
        )
    )
    wall_ms = int((time.perf_counter() - t0) * 1000)
    latency_ms = response.latencyMs or wall_ms

    errors = _run_checks(
        answer_he=response.answerHe,
        fallback_used=response.fallbackUsed,
        fallback_reason=response.fallbackReason,
        transcribed_text=case.tts_text,
        checks=case.checks,
        latency_ms=latency_ms,
        latency_budget=latency_budget,
        skip_latency=case.skip_latency_check,
    )
    return RunResult(
        answer_he=response.answerHe,
        fallback_used=response.fallbackUsed,
        fallback_reason=response.fallbackReason,
        latency_ms=latency_ms,
        errors=errors,
    )


def _check_consistency(runs: list[RunResult]) -> list[str]:
    if len(runs) < 2:
        return []
    errors: list[str] = []
    answers = [r.answer_he for r in runs]
    reasons = [r.fallback_reason for r in runs]
    if len(set(answers)) > 1:
        errors.append(
            f"Inconsistent answerHe across runs: {answers}"
        )
    if len(set(reasons)) > 1:
        errors.append(
            f"Inconsistent fallbackReason across runs: {reasons}"
        )
    return errors


def run_case(
    case: VoiceEvalCase,
    repeat: int,
    latency_budget: int,
) -> CaseResult:
    result = CaseResult(case=case)
    for _ in range(repeat):
        result.runs.append(_run_case_once(case, latency_budget))
    for err in _check_consistency(result.runs):
        result.runs[-1].errors.append(err)
    return result


# ---------------------------------------------------------------------------
# Report builders
# ---------------------------------------------------------------------------

def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = (len(ordered) - 1) * p
    lo = int(idx)
    hi = min(len(ordered) - 1, lo + 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (idx - lo)


def build_summary(
    results: list[CaseResult], latency_budget: int
) -> dict:
    total = len(results)
    passed = sum(1 for r in results if r.status == "PASS")
    failed = total - passed
    lats = [run.latency_ms for r in results for run in r.runs]

    return {
        "runAt": datetime.now(timezone.utc).isoformat(),
        "totalCases": total,
        "latencyBudgetMs": latency_budget,
        "summary": {"passed": passed, "failed": failed},
        "latencyMetrics": {
            "avgMs": round(statistics.mean(lats), 1) if lats else 0.0,
            "p95Ms": round(_percentile(lats, 0.95), 1),
            "maxMs": max(lats, default=0),
        },
        "cases": [
            {
                "id": r.case.id,
                "status": r.status,
                "avgLatencyMs": r.avg_latency_ms,
                "maxLatencyMs": r.max_latency_ms,
                "errors": r.all_errors,
                "lastAnswer": r.runs[-1].answer_he if r.runs else "",
                "lastFallbackReason": (
                    r.runs[-1].fallback_reason if r.runs else None
                ),
            }
            for r in results
        ],
    }


def render_markdown(summary: dict) -> str:
    s = summary["summary"]
    lm = summary["latencyMetrics"]
    budget = summary["latencyBudgetMs"]
    lines = [
        "# Voice Eval Report",
        "",
        f"- Run at: `{summary['runAt']}`",
        (
            f"- Cases: `{summary['totalCases']}` | "
            f"Passed: `{s['passed']}` | Failed: `{s['failed']}`"
        ),
        f"- Latency budget: `{budget} ms`",
        "",
        "## Latency",
        "",
        "| Avg | P95 | Max |",
        "| ---: | ---: | ---: |",
        (
            f"| {lm['avgMs']} ms"
            f" | {lm['p95Ms']} ms"
            f" | {lm['maxMs']} ms |"
        ),
        "",
        "## Cases",
        "",
        "| ID | Status | Avg ms | Errors |",
        "| --- | :---: | ---: | --- |",
    ]
    for c in summary["cases"]:
        icon = "PASS" if c["status"] == "PASS" else "FAIL"
        err_str = "; ".join(c["errors"]) if c["errors"] else "-"
        lines.append(
            f"| `{c['id']}` | {icon}"
            f" | {c['avgLatencyMs']} | {err_str} |"
        )

    failing = [c for c in summary["cases"] if c["status"] == "FAIL"]
    if failing:
        lines += ["", "## Failing Details", ""]
        for c in failing:
            lines.append(f"### `{c['id']}`")
            lines.append(f"- Last answer: `{c['lastAnswer']}`")
            lines.append(
                f"- fallbackReason: `{c['lastFallbackReason']}`"
            )
            for e in c["errors"]:
                lines.append(f"- FAIL: {e}")
            lines.append("")

    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="In-process voice eval (no server needed)"
    )
    parser.add_argument(
        "--repeat", type=int, default=DEFAULT_REPEAT,
        help="Times to run each case (consistency check)",
    )
    parser.add_argument(
        "--latency-budget", type=int, default=DEFAULT_LATENCY_BUDGET,
        help="Max acceptable latencyMs per case (default 3000)",
    )
    args = parser.parse_args()

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    raw = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    cases = [
        VoiceEvalCase(
            id=item["id"],
            description=item.get("description", ""),
            tts_text=item.get("tts_text", ""),
            student_level=item.get("student_level", "A1"),
            checks=item.get("checks", {}),
            skip_latency_check=bool(
                item.get("skip_latency_check", False)
            ),
        )
        for item in raw
    ]

    print(
        f"Voice Eval -- {len(cases)} cases"
        f"  (repeat={args.repeat},"
        f" budget={args.latency_budget} ms)\n"
    )

    results: list[CaseResult] = []
    for case in cases:
        res = run_case(case, args.repeat, args.latency_budget)
        results.append(res)
        tag = "PASS" if res.status == "PASS" else "FAIL"
        print(
            f"  [{tag}] {case.id}"
            f"  ({res.avg_latency_ms} ms avg)"
        )
        for err in res.all_errors:
            print(f"         * {err}")

    summary = build_summary(results, args.latency_budget)
    md = render_markdown(summary)

    ts = int(time.time())
    (REPORTS_DIR / f"voice_eval_{ts}.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    md_path = REPORTS_DIR / "voice_eval_latest.md"
    md_path.write_text(md, encoding="utf-8")

    print(f"\n{'=' * 50}")
    s = summary["summary"]
    print(
        f"Results: {s['passed']} passed / {s['failed']} failed"
        f"  (total {len(cases)})"
    )
    print(f"Report  -> {md_path}")

    sys.exit(1 if s["failed"] else 0)


if __name__ == "__main__":
    main()
