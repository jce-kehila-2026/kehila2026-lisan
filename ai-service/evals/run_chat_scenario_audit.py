from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_PATH = ROOT_DIR / "evals" / "chat_scenario_audit_dataset.json"
DEFAULT_REPORTS_DIR = ROOT_DIR / "evals" / "reports"
DEFAULT_AI_SERVICE_URL = "http://127.0.0.1:8000"
DEFAULT_CATEGORY_PRIORITY = {
    "api_contract_raw": 0,
    "language_violation": 1,
    "malformed_input": 2,
    "script_confusion": 3,
    "unicode_normalization": 4,
    "out_of_scope": 5,
    "data_exfiltration": 6,
    "prompt_injection": 7,
    "instruction_violation": 8,
    "safety_scope": 9,
    "rag_traps": 10,
    "robustness": 11,
    "valid_router": 12,
    "settings_scope": 13,
    "language_quality": 14,
    "valid_edge": 15,
    "conversation_flow": 16,
    "conversation_memory": 17,
    "conversation_context_contamination": 18,
    "turn_taking": 19,
    "meta_learning": 20,
    "level_contract": 21,
    "ambiguity_resolution": 22,
    "session_isolation": 23,
    "format_pressure": 24,
    "emotional_boundary": 25,
    "assessment_traps": 26,
    "cache_consistency": 27,
    "personalization_boundary": 28,
    "current_reality_boundary": 29,
    "translation_boundary": 30,
    "repair_and_correction": 31,
    "valid_higher_level": 32,
    "valid_rag": 33,
}

HEBREW_WORD_RE = re.compile(r"[\u05d0-\u05ea]+")
HEBREW_CHAR_RE = re.compile(r"[\u0590-\u05ff]")
ARABIC_CHAR_RE = re.compile(r"[\u0600-\u06ff]")
LATIN_CHAR_RE = re.compile(r"[A-Za-z]")
PROVIDER_FAILURE_REASONS = {
    "CIRCUIT_OPEN",
    "MODEL_ERROR",
    "MODEL_TIMEOUT",
    "PROVIDER_AUTH",
    "PROVIDER_NETWORK",
    "PROVIDER_QUOTA",
}


def read_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_secret() -> str:
    return (
        os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()
        or read_dotenv(ROOT_DIR / ".env").get("AI_SERVICE_INTERNAL_SECRET", "").strip()
    )


def json_request(
    *,
    url: str,
    payload: dict[str, Any] | None,
    timeout_seconds: float,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, Any], float, str | None]:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "lisan-chat-scenario-audit/1.0",
        **(headers or {}),
    }
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json; charset=utf-8"

    request = urllib.request.Request(
        url,
        data=data,
        method="POST" if payload is not None else "GET",
        headers=request_headers,
    )

    started_at = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            wall_latency_ms = (time.perf_counter() - started_at) * 1000
            raw_body = response.read().decode("utf-8")
            body = json.loads(raw_body) if raw_body else {}
            return int(getattr(response, "status", 200)), body, wall_latency_ms, None
    except urllib.error.HTTPError as exc:
        wall_latency_ms = (time.perf_counter() - started_at) * 1000
        raw_body = exc.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            body = {"raw": raw_body}
        return exc.code, body, wall_latency_ms, str(exc)
    except Exception as exc:
        wall_latency_ms = (time.perf_counter() - started_at) * 1000
        return 0, {}, wall_latency_ms, str(exc)


def count_hebrew_words(text: str) -> int:
    return len(HEBREW_WORD_RE.findall(text or ""))


def truncate(text: Any, limit: int = 140) -> str:
    value = "" if text is None else str(text).replace("\n", "\\n")
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "..."


def build_headers(secret: str, user_id: str) -> dict[str, str]:
    headers = {"X-User-ID": user_id}
    if secret:
        headers["X-Internal-Service-Secret"] = secret
    return headers


def build_audit_id(run_id: str, case_id: str, value: Any | None, fallback: str) -> str:
    raw_value = str(value or "").strip()
    if not raw_value:
        raw_value = fallback
    safe_value = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw_value).strip("-") or fallback
    return f"audit-{run_id}-{case_id}-{safe_value}"


def response_answer(response: dict[str, Any]) -> str:
    return str(response.get("answerHe") or "")


def evaluate_response(
    *,
    expected: dict[str, Any],
    response: dict[str, Any],
    http_status: int,
    request_error: str | None,
    wall_latency_ms: float,
) -> tuple[list[str], list[str]]:
    issues: list[str] = []
    observations: list[str] = []
    expected_http_status = int(expected.get("httpStatus", 200))
    expect_schema = bool(expected.get("expectSchema", expected_http_status == 200))

    if request_error and http_status != expected_http_status:
        issues.append("request_error")
    if http_status != expected_http_status:
        issues.append("http_status_not_expected")

    required_fields = {"answerHe", "fallbackUsed", "fallbackReason", "level", "latencyMs"}
    missing = sorted(field for field in required_fields if field not in response)
    if expect_schema and missing:
        issues.append("schema_missing:" + ",".join(missing))
    if not expect_schema:
        return issues, observations

    answer_he = response_answer(response)
    fallback_used = response.get("fallbackUsed")
    expected_fallback = expected.get("fallbackUsed", None)
    if expected_fallback is not None and fallback_used is not expected_fallback:
        issues.append("fallback_mismatch")

    expected_reason = expected.get("fallbackReason", None)
    fallback_reason = response.get("fallbackReason")
    if expected_reason is not None and fallback_reason != expected_reason:
        issues.append("fallback_reason_mismatch")
    allowed_fallback_reasons = expected.get("allowedFallbackReasons")
    if isinstance(allowed_fallback_reasons, list) and fallback_reason not in allowed_fallback_reasons:
        issues.append("fallback_reason_not_allowed")
    if fallback_reason in PROVIDER_FAILURE_REASONS:
        issues.append("provider_failure_fallback")

    if not answer_he:
        issues.append("empty_answer")

    answer_for_matching = answer_he.lower()
    for substring in expected.get("requiredAnswerSubstrings", []):
        if str(substring).lower() not in answer_for_matching:
            issues.append(f"missing_required_answer_substring:{substring}")
    required_any = [str(item) for item in expected.get("requiredAnyAnswerSubstrings", [])]
    if required_any and not any(item.lower() in answer_for_matching for item in required_any):
        issues.append("missing_any_required_answer_substring")
    for substring in expected.get("forbiddenAnswerSubstrings", []):
        if str(substring).lower() in answer_for_matching:
            issues.append(f"forbidden_answer_substring:{substring}")
    for pattern in expected.get("forbiddenAnswerRegexes", []):
        if re.search(str(pattern), answer_he, flags=re.IGNORECASE):
            issues.append(f"forbidden_answer_regex:{pattern}")

    response_for_matching = json.dumps(response, ensure_ascii=False).lower()
    for substring in expected.get("forbiddenResponseSubstrings", []):
        if str(substring).lower() in response_for_matching:
            issues.append(f"forbidden_response_substring:{substring}")

    if expected.get("hebrewOnlyAnswer", True):
        if not HEBREW_CHAR_RE.search(answer_he):
            issues.append("answer_has_no_hebrew")
        if LATIN_CHAR_RE.search(answer_he):
            issues.append("answer_contains_latin")
        if ARABIC_CHAR_RE.search(answer_he):
            issues.append("answer_contains_arabic")

    if expected.get("answerArNull", True) and response.get("answerAr") is not None:
        issues.append("answer_ar_not_null")

    max_hebrew_words = expected.get("maxHebrewWords")
    if isinstance(max_hebrew_words, int) and count_hebrew_words(answer_he) > max_hebrew_words:
        issues.append("answer_too_long")

    expect_rag = expected.get("expectRagContext", None)
    context_chunk_ids = response.get("contextChunkIds") or []
    router_hit = response.get("routerHit") is True
    if expect_rag is True and fallback_used is False:
        if router_hit:
            issues.append("router_hit_instead_of_rag")
        elif not context_chunk_ids:
            issues.append("missing_rag_context")
    if expected.get("expectNoRagContext", False) and context_chunk_ids:
        issues.append("unexpected_rag_context")

    max_latency_ms = expected.get("maxLatencyMs")
    if isinstance(max_latency_ms, (int, float)) and wall_latency_ms > max_latency_ms:
        issues.append("latency_over_budget")

    if response.get("cacheHit") is True:
        observations.append("cache_hit")
    if router_hit:
        observations.append("router_hit")
    if context_chunk_ids:
        observations.append(f"rag_chunks:{len(context_chunk_ids)}")
    if response.get("guardrail", {}).get("vocabularyLeakage") is True:
        issues.append("vocabulary_leakage")

    expected_level = expected.get("level")
    if expected_level is not None and response.get("level") != expected_level:
        issues.append("level_mismatch")

    expected_router_hit = expected.get("routerHit")
    if expected_router_hit is not None and response.get("routerHit") is not expected_router_hit:
        issues.append("router_hit_mismatch")

    expected_cache_hit = expected.get("cacheHit")
    if expected_cache_hit is not None and response.get("cacheHit") is not expected_cache_hit:
        issues.append("cache_hit_mismatch")

    suggested_prompts = response.get("suggestedNextPrompts") or []
    suggested_text = "\n".join(str(prompt) for prompt in suggested_prompts).lower()
    max_suggested_prompts = expected.get("maxSuggestedPrompts")
    if isinstance(max_suggested_prompts, int) and len(suggested_prompts) > max_suggested_prompts:
        issues.append("too_many_suggested_prompts")
    for substring in expected.get("forbiddenSuggestedPromptSubstrings", []):
        if str(substring).lower() in suggested_text:
            issues.append(f"forbidden_suggested_prompt_substring:{substring}")

    return issues, observations


def run_turn(
    *,
    ai_service_url: str,
    secret: str,
    timeout_seconds: float,
    run_id: str,
    case_id: str,
    category: str,
    case_type: str,
    turn_index: int,
    message: str,
    level: str,
    include_arabic: bool,
    expected: dict[str, Any],
    session_id: str,
    user_id: str,
) -> dict[str, Any]:
    payload = {
        "message": message,
        "level": level,
        "includeArabic": include_arabic,
        "userId": user_id,
        "sessionId": session_id,
    }
    http_status, response, wall_latency_ms, request_error = json_request(
        url=f"{ai_service_url.rstrip('/')}/api/ai/chat",
        payload=payload,
        timeout_seconds=timeout_seconds,
        headers=build_headers(secret, user_id),
    )
    issues, observations = evaluate_response(
        expected=expected,
        response=response,
        http_status=http_status,
        request_error=request_error,
        wall_latency_ms=wall_latency_ms,
    )

    return {
        "caseId": case_id,
        "category": category,
        "type": case_type,
        "turnIndex": turn_index,
        "message": message,
        "level": level,
        "includeArabic": include_arabic,
        "expected": expected,
        "httpStatus": http_status,
        "requestError": request_error,
        "wallLatencyMs": round(wall_latency_ms, 2),
        "response": response,
        "issues": issues,
        "observations": observations,
    }


def run_raw_case(
    *,
    ai_service_url: str,
    secret: str,
    timeout_seconds: float,
    run_id: str,
    case_id: str,
    category: str,
    payload: Any,
    expected: dict[str, Any],
) -> dict[str, Any]:
    user_id = f"audit-{run_id}-{case_id}"
    http_status, response, wall_latency_ms, request_error = json_request(
        url=f"{ai_service_url.rstrip('/')}/api/ai/chat",
        payload=payload,
        timeout_seconds=timeout_seconds,
        headers=build_headers(secret, user_id),
    )
    issues, observations = evaluate_response(
        expected=expected,
        response=response,
        http_status=http_status,
        request_error=request_error,
        wall_latency_ms=wall_latency_ms,
    )

    return {
        "caseId": case_id,
        "category": category,
        "type": "raw",
        "turnIndex": 1,
        "message": json.dumps(payload, ensure_ascii=False),
        "level": payload.get("level", "") if isinstance(payload, dict) else "",
        "includeArabic": payload.get("includeArabic", "") if isinstance(payload, dict) else "",
        "expected": expected,
        "httpStatus": http_status,
        "requestError": request_error,
        "wallLatencyMs": round(wall_latency_ms, 2),
        "response": response,
        "issues": issues,
        "observations": observations,
    }


def run_case(
    *,
    case: dict[str, Any],
    ai_service_url: str,
    secret: str,
    timeout_seconds: float,
    run_id: str,
) -> list[dict[str, Any]]:
    case_type = case.get("type", "single")
    case_id = case["id"]
    category = case.get("category", "uncategorized")
    level = case.get("level", "A1")
    include_arabic = bool(case.get("includeArabic", False))
    session_id = build_audit_id(run_id, case_id, case.get("sessionId"), "session")
    user_id = build_audit_id(run_id, case_id, case.get("userId"), "user")

    if case_type == "raw":
        return [
            run_raw_case(
                ai_service_url=ai_service_url,
                secret=secret,
                timeout_seconds=timeout_seconds,
                run_id=run_id,
                case_id=case_id,
                category=category,
                payload=case.get("payload"),
                expected=case.get("expected", {}),
            )
        ]

    if case_type == "conversation":
        results = []
        for index, turn in enumerate(case.get("turns", []), start=1):
            results.append(
                run_turn(
                    ai_service_url=ai_service_url,
                    secret=secret,
                    timeout_seconds=timeout_seconds,
                    run_id=run_id,
                    case_id=case_id,
                    category=category,
                    case_type=case_type,
                    turn_index=index,
                    message=turn["message"],
                    level=turn.get("level", level),
                    include_arabic=bool(turn.get("includeArabic", include_arabic)),
                    expected=turn.get("expected", {}),
                    session_id=build_audit_id(
                        run_id,
                        case_id,
                        turn.get("sessionId", case.get("sessionId")),
                        "session",
                    ),
                    user_id=build_audit_id(
                        run_id,
                        case_id,
                        turn.get("userId", case.get("userId")),
                        "user",
                    ),
                )
            )
        return results

    return [
        run_turn(
            ai_service_url=ai_service_url,
            secret=secret,
            timeout_seconds=timeout_seconds,
            run_id=run_id,
            case_id=case_id,
            category=category,
            case_type=case_type,
            turn_index=1,
            message=case["message"],
            level=level,
            include_arabic=include_arabic,
            expected=case.get("expected", {}),
            session_id=session_id,
            user_id=user_id,
        )
    ]


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    total_turns = len(results)
    issue_turns = [result for result in results if result["issues"]]
    issue_counter = Counter(issue for result in results for issue in result["issues"])
    category_totals: dict[str, int] = defaultdict(int)
    category_issue_turns: dict[str, int] = defaultdict(int)

    for result in results:
        category = result["category"]
        category_totals[category] += 1
        if result["issues"]:
            category_issue_turns[category] += 1

    latencies = [float(result["wallLatencyMs"]) for result in results]
    sorted_latencies = sorted(latencies)
    p95 = sorted_latencies[int((len(sorted_latencies) - 1) * 0.95)] if sorted_latencies else 0.0

    return {
        "totalTurns": total_turns,
        "turnsWithIssues": len(issue_turns),
        "issueRatePercent": round((len(issue_turns) / total_turns) * 100, 2) if total_turns else 0.0,
        "issueCounts": dict(issue_counter),
        "categoryBreakdown": {
            category: {
                "turns": category_totals[category],
                "turnsWithIssues": category_issue_turns[category],
            }
            for category in sorted(category_totals)
        },
        "fallbackCount": sum(1 for result in results if result["response"].get("fallbackUsed") is True),
        "cacheHitCount": sum(1 for result in results if result["response"].get("cacheHit") is True),
        "routerHitCount": sum(1 for result in results if result["response"].get("routerHit") is True),
        "ragContextCount": sum(1 for result in results if result["response"].get("contextChunkIds")),
        "averageWallLatencyMs": round(sum(latencies) / len(latencies), 2) if latencies else 0.0,
        "p95WallLatencyMs": round(p95, 2),
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    readiness = report.get("readiness", {})
    circuit_reset = report.get("circuitReset", {})
    lines = [
        f"# {report.get('reportTitle', 'Chat Scenario Audit')}",
        "",
        f"- Run ID: `{report['runId']}`",
        f"- Run at: `{report['runAt']}`",
        f"- AI service URL: `{report['aiServiceUrl']}`",
        f"- Dataset: `{report['datasetPath']}`",
        f"- Readiness: `{readiness.get('status', 'unknown')}`",
        f"- Readiness checks: `{json.dumps(readiness.get('checks', {}), ensure_ascii=False)}`",
        f"- Circuit reset: `status={circuit_reset.get('httpStatus')}, error={circuit_reset.get('error')}`",
        "",
        "## Summary",
        "",
        f"- Total turns: `{summary['totalTurns']}`",
        f"- Turns with issues: `{summary['turnsWithIssues']}`",
        f"- Issue rate: `{summary['issueRatePercent']}%`",
        f"- Fallback count: `{summary['fallbackCount']}`",
        f"- Cache hits: `{summary['cacheHitCount']}`",
        f"- Router hits: `{summary['routerHitCount']}`",
        f"- RAG context responses: `{summary['ragContextCount']}`",
        f"- Average wall latency: `{summary['averageWallLatencyMs']} ms`",
        f"- P95 wall latency: `{summary['p95WallLatencyMs']} ms`",
        "",
        "## Issue Counts",
        "",
    ]

    if summary["issueCounts"]:
        for issue, count in sorted(summary["issueCounts"].items()):
            lines.append(f"- `{issue}`: `{count}`")
    else:
        lines.append("No issues flagged by the audit heuristics.")

    lines.extend([
        "",
        "## Category Breakdown",
        "",
        "| Category | Turns | Turns With Issues |",
        "| --- | ---: | ---: |",
    ])
    for category, stats in summary["categoryBreakdown"].items():
        lines.append(f"| {category} | {stats['turns']} | {stats['turnsWithIssues']} |")

    lines.extend([
        "",
        "## Turns",
        "",
        "| Case | Cat | Turn | Sent | Answer | Fallback | Reason | Provider | RAG | Issues |",
        "| --- | --- | ---: | --- | --- | --- | --- | --- | ---: | --- |",
    ])
    for result in report["results"]:
        response = result["response"]
        rag_count = len(response.get("contextChunkIds") or [])
        provider = response.get("provider") or ""
        lines.append(
            "| "
            f"`{result['caseId']}` | "
            f"{result['category']} | "
            f"{result['turnIndex']} | "
            f"{truncate(result['message'], 70)} | "
            f"{truncate(response.get('answerHe'), 90)} | "
            f"{response.get('fallbackUsed')} | "
            f"{response.get('fallbackReason')} | "
            f"{provider} | "
            f"{rag_count} | "
            f"{', '.join(result['issues']) or '-'} |"
        )

    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run live chat scenario audit against ai-service.")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET_PATH))
    parser.add_argument("--reports-dir", default=str(DEFAULT_REPORTS_DIR))
    parser.add_argument(
        "--report-prefix",
        default=None,
        help="Prefix for generated report files. Defaults to the dataset stem without _dataset.",
    )
    parser.add_argument("--ai-service-url", default=os.getenv("AI_SERVICE_URL", DEFAULT_AI_SERVICE_URL))
    parser.add_argument("--timeout-seconds", type=float, default=45.0)
    parser.add_argument("--fail-on-issues", action="store_true")
    parser.add_argument(
        "--preserve-order",
        action="store_true",
        help="Run cases in dataset order. By default guardrail cases run first to avoid provider-circuit contamination.",
    )
    return parser.parse_args()


def ordered_cases(cases: list[dict[str, Any]], preserve_order: bool) -> list[dict[str, Any]]:
    if preserve_order:
        return cases

    ordered = sorted(
        enumerate(cases),
        key=lambda item: (
            DEFAULT_CATEGORY_PRIORITY.get(item[1].get("category", ""), 100),
            item[0],
        ),
    )
    return [case for _, case in ordered]


def main() -> int:
    args = parse_args()
    dataset_path = Path(args.dataset)
    reports_dir = Path(args.reports_dir)
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_prefix = args.report_prefix or dataset_path.stem.replace("_dataset", "")
    report_title = report_prefix.replace("_", " ").title()

    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    raw_cases = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases = ordered_cases(raw_cases, args.preserve_order)
    secret = resolve_secret()

    reset_status, reset_body, _, reset_error = json_request(
        url=f"{args.ai_service_url.rstrip('/')}/api/ai/admin/circuits/reset",
        payload={},
        timeout_seconds=min(args.timeout_seconds, 10.0),
        headers=build_headers(secret, f"audit-{run_id}-reset"),
    )

    ready_status, readiness, _, ready_error = json_request(
        url=f"{args.ai_service_url.rstrip('/')}/api/ai/ready",
        payload=None,
        timeout_seconds=min(args.timeout_seconds, 10.0),
        headers=build_headers(secret, f"audit-{run_id}"),
    )
    if ready_error:
        readiness = {"status": "unreachable", "error": ready_error, "httpStatus": ready_status}

    results: list[dict[str, Any]] = []
    for case in cases:
        results.extend(
            run_case(
                case=case,
                ai_service_url=args.ai_service_url,
                secret=secret,
                timeout_seconds=args.timeout_seconds,
                run_id=run_id,
            )
        )

    report = {
        "runId": run_id,
        "reportTitle": report_title,
        "runAt": datetime.now(UTC).isoformat(),
        "aiServiceUrl": args.ai_service_url,
        "datasetPath": str(dataset_path),
        "readiness": readiness,
        "circuitReset": {
            "httpStatus": reset_status,
            "body": reset_body,
            "error": reset_error,
        },
        "summary": summarize(results),
        "results": results,
    }

    latest_json_path = reports_dir / f"{report_prefix}_latest.json"
    latest_md_path = reports_dir / f"{report_prefix}_latest.md"
    timestamped_json_path = reports_dir / f"{report_prefix}_{run_id}.json"
    timestamped_md_path = reports_dir / f"{report_prefix}_{run_id}.md"

    report_json = json.dumps(report, ensure_ascii=False, indent=2)
    report_md = render_markdown(report)

    latest_json_path.write_text(report_json, encoding="utf-8")
    timestamped_json_path.write_text(report_json, encoding="utf-8")
    latest_md_path.write_text(report_md, encoding="utf-8")
    timestamped_md_path.write_text(report_md, encoding="utf-8")

    print(report_md)

    if args.fail_on_issues and report["summary"]["turnsWithIssues"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
