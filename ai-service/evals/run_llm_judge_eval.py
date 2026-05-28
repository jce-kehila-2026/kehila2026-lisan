"""
run_llm_judge_eval.py

LLM-as-a-Judge evaluation script for Lisan AI responses.

Usage:
    python evals/run_llm_judge_eval.py [--cases evals/eval_cases.json]
                                        [--output evals/results.json]
                                        [--judge-model gpt-4o]
                                        [--dry-run]

What it does:
  1. Loads test cases from eval_cases.json
  2. Calls the local chat engine (generate_chat_response) for each case
  3. Submits the (input, response) pair to GPT-4o for scoring
  4. Saves a JSON results file + prints a summary table

Scoring rubric (1-5 per dimension, weighted average):
  language_simplicity  — all words are simple A1 Hebrew
  level_appropriateness — topic/vocab fits the learner's level
  no_hallucination     — factually grounded, no invented details
  warmth               — warm, encouraging teacher tone
  hebrew_only          — pure Hebrew, no English/Arabic mixing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Allow running from project root or evals/ directory
_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(_ROOT / ".env")

from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

DIMENSIONS = [
    "language_simplicity",
    "level_appropriateness",
    "no_hallucination",
    "warmth",
    "hebrew_only",
]

DIMENSION_WEIGHTS: dict[str, float] = {
    "language_simplicity":  0.30,
    "level_appropriateness": 0.25,
    "no_hallucination":     0.20,
    "warmth":               0.15,
    "hebrew_only":          0.10,
}

PASSING_SCORE = 3.5   # weighted average must meet or exceed this


@dataclass
class EvalCase:
    id: str
    message: str
    level: str
    expect_fallback: bool
    description: str = ""


@dataclass
class JudgeScore:
    language_simplicity: int = 0
    level_appropriateness: int = 0
    no_hallucination: int = 0
    warmth: int = 0
    hebrew_only: int = 0
    reasoning: str = ""

    @property
    def weighted_average(self) -> float:
        total = sum(
            getattr(self, dim) * DIMENSION_WEIGHTS[dim]
            for dim in DIMENSIONS
        )
        return round(total, 2)

    @property
    def passed(self) -> bool:
        return self.weighted_average >= PASSING_SCORE


@dataclass
class EvalResult:
    case_id: str
    message: str
    level: str
    answer_he: str
    fallback_used: bool
    fallback_reason: str | None
    latency_ms: int
    expect_fallback: bool
    fallback_correct: bool
    score: JudgeScore | None = None
    judge_error: str | None = None

    @property
    def passed(self) -> bool:
        if not self.fallback_correct:
            return False
        if self.fallback_used:
            return True   # fallback cases don't get LLM-judged
        return self.score is not None and self.score.passed


@dataclass
class EvalSummary:
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    avg_weighted_score: float = 0.0
    results: list[EvalResult] = field(default_factory=list)

    @property
    def pass_rate(self) -> float:
        return round(self.passed / self.total, 3) if self.total else 0.0


# ---------------------------------------------------------------------------
# Judge prompt
# ---------------------------------------------------------------------------

_JUDGE_SYSTEM = """You are an expert evaluator for a Hebrew language learning app targeting A1-level Arabic-speaking beginners.

You will be given a student message and the AI tutor's Hebrew response.
Rate the response on these five dimensions, each from 1 (very poor) to 5 (excellent):

1. language_simplicity — All words are basic A1 Hebrew. No advanced grammar or rare vocabulary.
2. level_appropriateness — The topic and content fit A1 level; nothing outside the curriculum (greetings, names, residence, family, numbers 1-10, colors).
3. no_hallucination — The answer is grounded and natural; no invented facts, names, or claims.
4. warmth — The tone is warm, encouraging, and teacher-like (not robotic or cold).
5. hebrew_only — The response uses only Hebrew characters; no English, Arabic, or mixed script.

Return ONLY valid JSON with this exact shape (no extra keys, no markdown):
{
  "language_simplicity": <1-5>,
  "level_appropriateness": <1-5>,
  "no_hallucination": <1-5>,
  "warmth": <1-5>,
  "hebrew_only": <1-5>,
  "reasoning": "<one sentence explanation>"
}"""

_JUDGE_USER_TEMPLATE = """Student message: {message}
AI tutor response: {answer}"""


# ---------------------------------------------------------------------------
# LLM judge call
# ---------------------------------------------------------------------------

def judge_response(
    message: str,
    answer: str,
    judge_model: str = "gpt-4o",
    api_key: str | None = None,
) -> JudgeScore:
    """
    Call GPT-4o to score a (message, answer) pair.
    Raises RuntimeError if the OpenAI key is missing or the call fails.
    """
    key = api_key or os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "OPENAI_API_KEY is required to run the LLM judge. "
            "Set it in ai-service/.env or export it."
        )

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("openai package not installed") from exc

    client = OpenAI(api_key=key, timeout=30.0, max_retries=1)
    user_content = _JUDGE_USER_TEMPLATE.format(message=message, answer=answer)

    response = client.chat.completions.create(
        model=judge_model,
        messages=[
            {"role": "system", "content": _JUDGE_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        temperature=0.0,
        max_tokens=256,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    return _parse_judge_response(data)


def _parse_judge_response(data: dict[str, Any]) -> JudgeScore:
    def _clamp(val: Any, default: int = 3) -> int:
        try:
            return max(1, min(5, int(val)))
        except (TypeError, ValueError):
            return default

    return JudgeScore(
        language_simplicity=_clamp(data.get("language_simplicity")),
        level_appropriateness=_clamp(data.get("level_appropriateness")),
        no_hallucination=_clamp(data.get("no_hallucination")),
        warmth=_clamp(data.get("warmth")),
        hebrew_only=_clamp(data.get("hebrew_only")),
        reasoning=str(data.get("reasoning", ""))[:300],
    )


# ---------------------------------------------------------------------------
# Engine runner
# ---------------------------------------------------------------------------

def run_case(case: EvalCase) -> EvalResult:
    """Run a single eval case through the chat engine."""
    request = ChatRequest(
        message=case.message,
        level=case.level,
        includeArabic=False,
        voiceMode=False,
    )
    response = generate_chat_response(request)
    fallback_correct = response.fallbackUsed == case.expect_fallback

    return EvalResult(
        case_id=case.id,
        message=case.message,
        level=case.level,
        answer_he=response.answerHe or "",
        fallback_used=response.fallbackUsed,
        fallback_reason=response.fallbackReason,
        latency_ms=response.latencyMs,
        expect_fallback=case.expect_fallback,
        fallback_correct=fallback_correct,
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def run_eval(
    cases: list[EvalCase],
    judge_model: str = "gpt-4o",
    dry_run: bool = False,
    api_key: str | None = None,
) -> EvalSummary:
    """
    Run all eval cases, optionally invoking the LLM judge.

    dry_run=True skips LLM judge calls (useful for CI / unit tests).
    """
    summary = EvalSummary(total=len(cases))

    for case in cases:
        print(f"  [{case.id}] running...", end=" ", flush=True)
        result = run_case(case)

        if not result.fallback_correct:
            result_label = "FAIL (fallback mismatch)"
            summary.failed += 1
        elif result.fallback_used:
            result_label = "SKIP judge (fallback case)"
            summary.skipped += 1
        elif dry_run:
            result_label = "SKIP judge (dry-run)"
            summary.skipped += 1
        else:
            try:
                result.score = judge_response(
                    message=case.message,
                    answer=result.answer_he,
                    judge_model=judge_model,
                    api_key=api_key,
                )
                if result.score.passed:
                    summary.passed += 1
                    result_label = f"PASS  score={result.score.weighted_average}"
                else:
                    summary.failed += 1
                    result_label = f"FAIL  score={result.score.weighted_average}"
            except Exception as exc:
                result.judge_error = str(exc)
                summary.skipped += 1
                result_label = f"SKIP judge (error: {exc})"

        print(result_label)
        summary.results.append(result)
        time.sleep(0.2)  # respect API rate limits between calls

    scored = [
        r.score.weighted_average
        for r in summary.results
        if r.score is not None
    ]
    summary.avg_weighted_score = (
        round(sum(scored) / len(scored), 2) if scored else 0.0
    )

    return summary


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _result_to_dict(r: EvalResult) -> dict[str, Any]:
    d = asdict(r) if False else {  # avoid recursive asdict on JudgeScore property
        "case_id": r.case_id,
        "message": r.message,
        "level": r.level,
        "answer_he": r.answer_he,
        "fallback_used": r.fallback_used,
        "fallback_reason": r.fallback_reason,
        "latency_ms": r.latency_ms,
        "expect_fallback": r.expect_fallback,
        "fallback_correct": r.fallback_correct,
        "passed": r.passed,
        "judge_error": r.judge_error,
        "score": None if r.score is None else {
            dim: getattr(r.score, dim) for dim in DIMENSIONS
        } | {
            "weighted_average": r.score.weighted_average,
            "reasoning": r.score.reasoning,
        },
    }
    return d


def save_results(summary: EvalSummary, output_path: Path) -> None:
    data = {
        "total": summary.total,
        "passed": summary.passed,
        "failed": summary.failed,
        "skipped": summary.skipped,
        "pass_rate": summary.pass_rate,
        "avg_weighted_score": summary.avg_weighted_score,
        "passing_threshold": PASSING_SCORE,
        "results": [_result_to_dict(r) for r in summary.results],
    }
    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nResults saved to {output_path}")


def print_summary(summary: EvalSummary) -> None:
    print("\n" + "=" * 60)
    print("LLM Judge Eval Summary")
    print("=" * 60)
    print(f"  Total cases:         {summary.total}")
    print(f"  Passed:              {summary.passed}")
    print(f"  Failed:              {summary.failed}")
    print(f"  Skipped (no judge):  {summary.skipped}")
    print(f"  Pass rate:           {summary.pass_rate:.0%}")
    print(f"  Avg weighted score:  {summary.avg_weighted_score}")
    print(f"  Passing threshold:   {PASSING_SCORE}")
    print("=" * 60)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _load_cases(path: Path) -> list[EvalCase]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        EvalCase(
            id=item["id"],
            message=item["message"],
            level=item.get("level", "A1"),
            expect_fallback=item.get("expect_fallback", False),
            description=item.get("description", ""),
        )
        for item in raw
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LLM-as-a-Judge eval for Lisan AI")
    parser.add_argument(
        "--cases",
        default=str(Path(__file__).parent / "eval_cases.json"),
        help="Path to eval cases JSON file",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).parent / "results.json"),
        help="Path to write results JSON",
    )
    parser.add_argument(
        "--judge-model",
        default="gpt-4o",
        help="OpenAI model to use as judge (default: gpt-4o)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip LLM judge calls; only run chat engine",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="OpenAI API key (overrides env var)",
    )
    args = parser.parse_args(argv)

    cases_path = Path(args.cases)
    if not cases_path.exists():
        print(f"Error: cases file not found: {cases_path}", file=sys.stderr)
        return 1

    cases = _load_cases(cases_path)
    print(f"Running {len(cases)} eval cases (judge_model={args.judge_model}, dry_run={args.dry_run})\n")

    summary = run_eval(
        cases=cases,
        judge_model=args.judge_model,
        dry_run=args.dry_run,
        api_key=args.api_key,
    )

    print_summary(summary)
    save_results(summary, Path(args.output))

    # Exit non-zero if any case failed
    return 0 if summary.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
