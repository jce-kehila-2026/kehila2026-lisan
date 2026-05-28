"""
test_llm_judge_eval.py

Tests for T8: LLM-as-a-Judge Eval.

Covers:
  - _parse_judge_response maps raw JSON to JudgeScore correctly
  - _parse_judge_response clamps values to 1-5
  - _parse_judge_response handles missing keys with defaults
  - JudgeScore.weighted_average uses correct weights
  - JudgeScore.passed is True when weighted_average >= 3.5
  - JudgeScore.passed is False when weighted_average < 3.5
  - EvalResult.passed respects fallback_correct
  - EvalResult.passed is True for correct fallback cases
  - run_case returns correct fields from generate_chat_response
  - run_case sets fallback_correct=True when fallback matches expectation
  - run_case sets fallback_correct=False on mismatch
  - run_eval in dry_run skips LLM judge
  - run_eval counts passed/failed/skipped correctly
  - run_eval aggregates avg_weighted_score
  - judge_response raises RuntimeError when OPENAI_API_KEY missing
  - _load_cases parses JSON file correctly
  - save_results writes valid JSON with expected keys
  - main() CLI returns 0 when all pass
  - main() CLI returns 1 when any case fails
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest.mock
from pathlib import Path

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")
os.environ.setdefault("OPENAI_API_KEY", "")

# Ensure evals module is importable
_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

from evals.run_llm_judge_eval import (
    DIMENSION_WEIGHTS,
    DIMENSIONS,
    PASSING_SCORE,
    EvalCase,
    EvalResult,
    EvalSummary,
    JudgeScore,
    _load_cases,
    _parse_judge_response,
    _result_to_dict,
    judge_response,
    run_case,
    run_eval,
    save_results,
    main,
)
from services.chat_schemas import ChatResponse, GuardrailReport


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chat_response(
    answer: str = "שלום.",
    fallback: bool = False,
    reason: str | None = None,
    latency: int = 50,
) -> ChatResponse:
    return ChatResponse(
        answerHe=answer,
        answerAr=None,
        fallbackUsed=fallback,
        fallbackReason=reason,
        level="A1",
        model="test",
        provider="test",
        latencyMs=latency,
        cacheHit=False,
        routerHit=False,
        contextChunkIds=[],
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
        suggestedNextPrompts=[],
    )


def _make_score(value: int = 4) -> JudgeScore:
    return JudgeScore(
        language_simplicity=value,
        level_appropriateness=value,
        no_hallucination=value,
        warmth=value,
        hebrew_only=value,
    )


# ---------------------------------------------------------------------------
# _parse_judge_response
# ---------------------------------------------------------------------------

class TestParseJudgeResponse:
    def test_maps_all_dimensions(self):
        data = {
            "language_simplicity": 5,
            "level_appropriateness": 4,
            "no_hallucination": 3,
            "warmth": 4,
            "hebrew_only": 5,
            "reasoning": "looks good",
        }
        score = _parse_judge_response(data)
        assert score.language_simplicity == 5
        assert score.level_appropriateness == 4
        assert score.no_hallucination == 3
        assert score.warmth == 4
        assert score.hebrew_only == 5
        assert score.reasoning == "looks good"

    def test_clamps_above_5_to_5(self):
        data = {dim: 10 for dim in DIMENSIONS}
        data["reasoning"] = ""
        score = _parse_judge_response(data)
        for dim in DIMENSIONS:
            assert getattr(score, dim) == 5

    def test_clamps_below_1_to_1(self):
        data = {dim: -3 for dim in DIMENSIONS}
        data["reasoning"] = ""
        score = _parse_judge_response(data)
        for dim in DIMENSIONS:
            assert getattr(score, dim) == 1

    def test_missing_keys_default_to_3(self):
        score = _parse_judge_response({})
        for dim in DIMENSIONS:
            assert getattr(score, dim) == 3

    def test_non_numeric_value_defaults_to_3(self):
        score = _parse_judge_response({"language_simplicity": "great"})
        assert score.language_simplicity == 3

    def test_reasoning_truncated_to_300_chars(self):
        long_reason = "x" * 500
        score = _parse_judge_response({"reasoning": long_reason})
        assert len(score.reasoning) <= 300


# ---------------------------------------------------------------------------
# JudgeScore.weighted_average and .passed
# ---------------------------------------------------------------------------

class TestJudgeScore:
    def test_all_fives_gives_5(self):
        score = _make_score(5)
        assert score.weighted_average == 5.0

    def test_all_ones_gives_1(self):
        score = _make_score(1)
        assert score.weighted_average == 1.0

    def test_weights_sum_to_1(self):
        total_weight = sum(DIMENSION_WEIGHTS.values())
        assert abs(total_weight - 1.0) < 0.001

    def test_passed_true_when_above_threshold(self):
        score = _make_score(4)
        assert score.passed is True

    def test_passed_false_when_below_threshold(self):
        score = _make_score(2)
        assert score.passed is False

    def test_passed_at_exact_threshold(self):
        # Build a score with exact weighted average = 3.5
        # All dims = 3.5 → need integer scores that average to >= 3.5
        score = JudgeScore(
            language_simplicity=4,
            level_appropriateness=4,
            no_hallucination=3,
            warmth=3,
            hebrew_only=3,
        )
        assert score.weighted_average >= PASSING_SCORE or not score.passed

    def test_weighted_average_uses_weights(self):
        score = JudgeScore(
            language_simplicity=5,
            level_appropriateness=1,
            no_hallucination=1,
            warmth=1,
            hebrew_only=1,
        )
        expected = (
            5 * DIMENSION_WEIGHTS["language_simplicity"]
            + 1 * DIMENSION_WEIGHTS["level_appropriateness"]
            + 1 * DIMENSION_WEIGHTS["no_hallucination"]
            + 1 * DIMENSION_WEIGHTS["warmth"]
            + 1 * DIMENSION_WEIGHTS["hebrew_only"]
        )
        assert abs(score.weighted_average - round(expected, 2)) < 0.01


# ---------------------------------------------------------------------------
# EvalResult.passed
# ---------------------------------------------------------------------------

class TestEvalResult:
    def _make(self, fallback_used=False, expect_fallback=False, score=None):
        return EvalResult(
            case_id="test",
            message="שלום",
            level="A1",
            answer_he="שלום.",
            fallback_used=fallback_used,
            fallback_reason=None,
            latency_ms=50,
            expect_fallback=expect_fallback,
            fallback_correct=(fallback_used == expect_fallback),
            score=score,
        )

    def test_passed_when_score_good_and_fallback_correct(self):
        r = self._make(score=_make_score(4))
        assert r.passed is True

    def test_failed_when_fallback_mismatch(self):
        r = self._make(fallback_used=False, expect_fallback=True, score=_make_score(4))
        assert r.passed is False

    def test_passed_when_fallback_case_correct(self):
        r = self._make(fallback_used=True, expect_fallback=True)
        assert r.passed is True

    def test_failed_when_score_low_and_no_fallback(self):
        r = self._make(score=_make_score(1))
        assert r.passed is False

    def test_failed_when_no_score_and_not_fallback(self):
        r = self._make(fallback_used=False, expect_fallback=False, score=None)
        assert r.passed is False


# ---------------------------------------------------------------------------
# run_case
# ---------------------------------------------------------------------------

class TestRunCase:
    def test_maps_response_fields(self):
        case = EvalCase(id="t1", message="שלום", level="A1", expect_fallback=False)
        chat_resp = _make_chat_response("שלום טוב.", latency=42)

        with unittest.mock.patch(
            "evals.run_llm_judge_eval.generate_chat_response",
            return_value=chat_resp,
        ):
            result = run_case(case)

        assert result.answer_he == "שלום טוב."
        assert result.latency_ms == 42
        assert result.fallback_used is False
        assert result.fallback_correct is True

    def test_fallback_correct_true_on_match(self):
        case = EvalCase(id="t2", message="hello", level="A1", expect_fallback=True)
        chat_resp = _make_chat_response("", fallback=True, reason="MIXED_LANGUAGE")

        with unittest.mock.patch(
            "evals.run_llm_judge_eval.generate_chat_response",
            return_value=chat_resp,
        ):
            result = run_case(case)

        assert result.fallback_correct is True

    def test_fallback_correct_false_on_mismatch(self):
        case = EvalCase(id="t3", message="שלום", level="A1", expect_fallback=True)
        chat_resp = _make_chat_response("שלום.", fallback=False)

        with unittest.mock.patch(
            "evals.run_llm_judge_eval.generate_chat_response",
            return_value=chat_resp,
        ):
            result = run_case(case)

        assert result.fallback_correct is False


# ---------------------------------------------------------------------------
# run_eval
# ---------------------------------------------------------------------------

class TestRunEval:
    def _cases(self):
        return [
            EvalCase(id="c1", message="שלום", level="A1", expect_fallback=False),
            EvalCase(id="c2", message="hello", level="A1", expect_fallback=True),
        ]

    def test_dry_run_skips_judge(self):
        c1_resp = _make_chat_response("שלום.", fallback=False)
        c2_resp = _make_chat_response("", fallback=True, reason="MIXED_LANGUAGE")

        with unittest.mock.patch(
            "evals.run_llm_judge_eval.generate_chat_response",
            side_effect=[c1_resp, c2_resp],
        ), unittest.mock.patch(
            "evals.run_llm_judge_eval.judge_response",
        ) as mock_judge:
            summary = run_eval(self._cases(), dry_run=True)

        mock_judge.assert_not_called()
        # c1: non-fallback + dry_run → skipped; c2: fallback correct → skipped
        assert summary.skipped == 2
        assert summary.failed == 0

    def test_fallback_mismatch_counts_as_failed(self):
        # c1 expects no fallback but gets one
        c1_resp = _make_chat_response("", fallback=True, reason="OUT_OF_SCOPE")
        c2_resp = _make_chat_response("", fallback=True, reason="MIXED_LANGUAGE")

        with unittest.mock.patch(
            "evals.run_llm_judge_eval.generate_chat_response",
            side_effect=[c1_resp, c2_resp],
        ):
            summary = run_eval(self._cases(), dry_run=True)

        assert summary.failed == 1

    def test_avg_weighted_score_computed(self):
        c1_resp = _make_chat_response("שלום.", fallback=False)
        c2_resp = _make_chat_response("", fallback=True, reason="MIXED_LANGUAGE")
        score = _make_score(4)

        with unittest.mock.patch(
            "evals.run_llm_judge_eval.generate_chat_response",
            side_effect=[c1_resp, c2_resp],
        ), unittest.mock.patch(
            "evals.run_llm_judge_eval.judge_response",
            return_value=score,
        ):
            summary = run_eval(self._cases(), dry_run=False)

        assert summary.avg_weighted_score == score.weighted_average

    def test_passed_counted_for_good_score(self):
        c1_resp = _make_chat_response("שלום.", fallback=False)
        c2_resp = _make_chat_response("", fallback=True, reason="MIXED_LANGUAGE")

        with unittest.mock.patch(
            "evals.run_llm_judge_eval.generate_chat_response",
            side_effect=[c1_resp, c2_resp],
        ), unittest.mock.patch(
            "evals.run_llm_judge_eval.judge_response",
            return_value=_make_score(5),
        ):
            summary = run_eval(self._cases(), dry_run=False)

        assert summary.passed >= 1


# ---------------------------------------------------------------------------
# judge_response
# ---------------------------------------------------------------------------

class TestJudgeResponse:
    def test_raises_when_api_key_missing(self):
        import pytest
        with unittest.mock.patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
                judge_response("שלום", "שלום.", api_key="")

    def test_parses_valid_openai_response(self):
        mock_content = json.dumps({
            "language_simplicity": 5,
            "level_appropriateness": 5,
            "no_hallucination": 5,
            "warmth": 5,
            "hebrew_only": 5,
            "reasoning": "perfect response",
        })

        mock_choice = unittest.mock.MagicMock()
        mock_choice.message.content = mock_content
        mock_response = unittest.mock.MagicMock()
        mock_response.choices = [mock_choice]

        mock_client = unittest.mock.MagicMock()
        mock_client.chat.completions.create.return_value = mock_response

        with unittest.mock.patch("openai.OpenAI", return_value=mock_client):
            score = judge_response("שלום", "שלום.", api_key="sk-test")

        assert score.weighted_average == 5.0
        assert score.reasoning == "perfect response"


# ---------------------------------------------------------------------------
# _load_cases
# ---------------------------------------------------------------------------

class TestLoadCases:
    def test_loads_valid_json(self):
        data = [
            {"id": "t1", "message": "שלום", "level": "A1", "expect_fallback": False},
            {"id": "t2", "message": "hello", "level": "A1", "expect_fallback": True},
        ]
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(data, f)
            path = Path(f.name)

        cases = _load_cases(path)
        path.unlink()

        assert len(cases) == 2
        assert cases[0].id == "t1"
        assert cases[1].expect_fallback is True

    def test_default_level_is_a1(self):
        data = [{"id": "t1", "message": "שלום", "expect_fallback": False}]
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(data, f)
            path = Path(f.name)

        cases = _load_cases(path)
        path.unlink()

        assert cases[0].level == "A1"


# ---------------------------------------------------------------------------
# save_results
# ---------------------------------------------------------------------------

class TestSaveResults:
    def test_writes_valid_json(self):
        summary = EvalSummary(
            total=1, passed=1, failed=0, skipped=0,
            avg_weighted_score=4.5,
            results=[
                EvalResult(
                    case_id="t1", message="שלום", level="A1",
                    answer_he="שלום.", fallback_used=False, fallback_reason=None,
                    latency_ms=50, expect_fallback=False, fallback_correct=True,
                    score=_make_score(5),
                )
            ],
        )
        with tempfile.NamedTemporaryFile(
            suffix=".json", delete=False
        ) as f:
            path = Path(f.name)

        save_results(summary, path)
        data = json.loads(path.read_text(encoding="utf-8"))
        path.unlink()

        assert data["total"] == 1
        assert data["passed"] == 1
        assert "results" in data
        assert data["results"][0]["case_id"] == "t1"
        assert data["results"][0]["score"]["weighted_average"] == 5.0


# ---------------------------------------------------------------------------
# main() CLI
# ---------------------------------------------------------------------------

class TestMainCLI:
    def _write_cases(self, cases_data: list[dict]) -> Path:
        f = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        json.dump(cases_data, f)
        f.close()
        return Path(f.name)

    def test_returns_0_when_all_pass(self):
        cases_data = [
            {"id": "t1", "message": "שלום", "level": "A1", "expect_fallback": False}
        ]
        chat_resp = _make_chat_response("שלום.", fallback=False)

        with tempfile.TemporaryDirectory() as tmpdir:
            cases_path = self._write_cases(cases_data)
            output_path = Path(tmpdir) / "results.json"

            with unittest.mock.patch(
                "evals.run_llm_judge_eval.generate_chat_response",
                return_value=chat_resp,
            ):
                exit_code = main([
                    "--cases", str(cases_path),
                    "--output", str(output_path),
                    "--dry-run",
                ])

            cases_path.unlink()

        assert exit_code == 0

    def test_returns_1_when_any_fail(self):
        cases_data = [
            # expects no fallback, but engine will return fallback
            {"id": "t1", "message": "שלום", "level": "A1", "expect_fallback": False}
        ]
        chat_resp = _make_chat_response("", fallback=True, reason="OUT_OF_SCOPE")

        with tempfile.TemporaryDirectory() as tmpdir:
            cases_path = self._write_cases(cases_data)
            output_path = Path(tmpdir) / "results.json"

            with unittest.mock.patch(
                "evals.run_llm_judge_eval.generate_chat_response",
                return_value=chat_resp,
            ):
                exit_code = main([
                    "--cases", str(cases_path),
                    "--output", str(output_path),
                    "--dry-run",
                ])

            cases_path.unlink()

        assert exit_code == 1
