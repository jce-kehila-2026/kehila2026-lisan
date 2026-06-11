from __future__ import annotations

import argparse
import json
import multiprocessing
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = ROOT_DIR / "evals" / "manual_200_agent_messages.jsonl"
REPORTS_DIR = ROOT_DIR / "evals" / "reports"


def load_dotenv(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and (override or key not in os.environ):
            os.environ[key] = value


def load_cases(path: Path) -> list[dict]:
    cases: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON on line {line_number}: {exc}") from exc
            for field in ("id", "message"):
                if field not in item:
                    raise ValueError(f"Missing '{field}' on line {line_number}")
            cases.append(item)
    return cases


def post_json(url: str, payload: dict, headers: dict, timeout: float) -> tuple[int, dict | str]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            **headers,
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8")
            return response.status, json.loads(response_body) if response_body else {}
    except HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed_body: dict | str = json.loads(response_body)
        except json.JSONDecodeError:
            parsed_body = response_body
        return exc.code, parsed_body
    except URLError as exc:
        return 0, {"error": "URL_ERROR", "detail": str(exc)}
    except TimeoutError as exc:
        return 0, {"error": "TIMEOUT", "detail": str(exc)}


def _post_json_worker(queue: multiprocessing.Queue, url: str, payload: dict, headers: dict, timeout: float) -> None:
    queue.put(post_json(url, payload, headers, timeout))


def post_json_with_hard_timeout(
    url: str,
    payload: dict,
    headers: dict,
    timeout: float,
) -> tuple[int, dict | str]:
    queue: multiprocessing.Queue = multiprocessing.Queue(maxsize=1)
    process = multiprocessing.Process(
        target=_post_json_worker,
        args=(queue, url, payload, headers, timeout),
    )
    process.start()
    process.join(timeout)
    if process.is_alive():
        process.terminate()
        process.join(5)
        return 0, {
            "error": "HARD_TIMEOUT",
            "detail": f"Request exceeded {timeout} seconds",
        }
    if queue.empty():
        return 0, {
            "error": "NO_WORKER_RESULT",
            "detail": f"Worker exited with code {process.exitcode}",
        }
    return queue.get()


def check_expectation(case: dict, response: dict) -> dict | None:
    """
    Compare a response against the case's optional "expect" block:

        {"expect": {"fallbackUsed": false}}
        {"expect": {"fallbackUsed": true, "fallbackReason": "MIXED_LANGUAGE"}}
        {"expect": {"answerContains": "שלום"}}

    Returns {"passed": bool, "mismatches": [...]} or None when the case has
    no expectations. Without expectations the eval can only count fallbacks —
    it cannot tell a CORRECT rejection from a logic failure.
    """
    expect = case.get("expect")
    if not isinstance(expect, dict) or not expect:
        return None

    mismatches: list[str] = []
    if "fallbackUsed" in expect:
        actual = response.get("fallbackUsed")
        if bool(actual) != bool(expect["fallbackUsed"]):
            mismatches.append(f"fallbackUsed: expected {expect['fallbackUsed']}, got {actual}")
    if "fallbackReason" in expect:
        actual_reason = response.get("fallbackReason")
        if actual_reason != expect["fallbackReason"]:
            mismatches.append(f"fallbackReason: expected {expect['fallbackReason']}, got {actual_reason}")
    if "answerContains" in expect:
        needles = expect["answerContains"]
        if isinstance(needles, str):
            needles = [needles]
        answer = response.get("answerHe") or ""
        for needle in needles:
            if needle not in answer:
                mismatches.append(f"answerHe missing expected text: {needle!r}")

    return {"passed": not mismatches, "mismatches": mismatches}


def build_summary(
    results: list[dict],
    started_at: str,
    completed_at: str,
    dataset_path: Path,
) -> dict:
    total = len(results)
    ok_results = [result for result in results if result["ok"]]
    error_results = [result for result in results if not result["ok"]]
    fallback_results = [
        result for result in ok_results if result.get("response", {}).get("fallbackUsed") is True
    ]
    context_results = [
        result for result in ok_results if result.get("response", {}).get("contextChunkIds")
    ]
    latency_values = [
        result["wallLatencyMs"]
        for result in ok_results
        if isinstance(result.get("wallLatencyMs"), (int, float))
    ]
    fallback_reason_counts: dict[str, int] = {}
    for result in results:
        response = result.get("response", {})
        reason = (
            response.get("fallbackReason")
            if response.get("fallbackUsed") is True
            else "NO_FALLBACK"
        )
        if result["ok"] is not True:
            reason = "HTTP_OR_NETWORK_ERROR"
        fallback_reason_counts[reason or "UNKNOWN"] = (
            fallback_reason_counts.get(reason or "UNKNOWN", 0) + 1
        )

    category_breakdown: dict[str, dict] = {}
    for result in results:
        category = result["case"].get("category", "uncategorized")
        stats = category_breakdown.setdefault(
            category,
            {
                "total": 0,
                "ok": 0,
                "errors": 0,
                "fallbacks": 0,
                "withContext": 0,
            },
        )
        stats["total"] += 1
        stats["ok"] += int(result["ok"])
        stats["errors"] += int(not result["ok"])
        stats["fallbacks"] += int(result.get("response", {}).get("fallbackUsed") is True)
        stats["withContext"] += int(bool(result.get("response", {}).get("contextChunkIds")))

    expectations_checked = 0
    expectations_passed = 0
    expectation_failures: list[dict] = []
    for result in results:
        response = result.get("response", {})
        verdict = check_expectation(result["case"], response if isinstance(response, dict) else {})
        if verdict is None:
            continue
        expectations_checked += 1
        if verdict["passed"]:
            expectations_passed += 1
        else:
            expectation_failures.append(
                {
                    "id": result["case"].get("id"),
                    "message": result["case"].get("message"),
                    "mismatches": verdict["mismatches"],
                    "answerHe": response.get("answerHe") if isinstance(response, dict) else None,
                    "fallbackReason": response.get("fallbackReason") if isinstance(response, dict) else None,
                }
            )

    failure_candidates = []
    for result in results:
        response = result.get("response", {})
        if not result["ok"]:
            reason = "http_or_network_error"
        elif response.get("fallbackUsed") is True:
            reason = f"fallback:{response.get('fallbackReason') or 'UNKNOWN'}"
        elif response.get("guardrail", {}).get("vocabularyLeakage") is True:
            reason = "vocabulary_leakage"
        else:
            continue
        failure_candidates.append(
            {
                "id": result["case"].get("id"),
                "category": result["case"].get("category"),
                "message": result["case"].get("message"),
                "reason": reason,
                "status": result.get("status"),
                "answerHe": response.get("answerHe"),
                "answerAr": response.get("answerAr"),
                "contextChunkIds": response.get("contextChunkIds", []),
                "retrievalScores": response.get("retrievalScores", []),
            }
        )

    return {
        "startedAt": started_at,
        "completedAt": completed_at,
        "datasetPath": str(dataset_path),
        "totalCases": total,
        "okCases": len(ok_results),
        "errorCases": len(error_results),
        "fallbackCases": len(fallback_results),
        "casesWithContext": len(context_results),
        "averageWallLatencyMs": round(sum(latency_values) / len(latency_values), 2)
        if latency_values
        else None,
        "fallbackReasonCounts": dict(
            sorted(
                fallback_reason_counts.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ),
        "expectations": {
            "checked": expectations_checked,
            "passed": expectations_passed,
            "failed": expectations_checked - expectations_passed,
            "failures": expectation_failures,
        },
        "categoryBreakdown": category_breakdown,
        "failureCandidates": failure_candidates,
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    load_dotenv(ROOT_DIR.parent / ".env")
    load_dotenv(ROOT_DIR / ".env", override=True)

    parser = argparse.ArgumentParser(
        description="Send manual chatbot messages to the AI service over HTTP."
    )
    # 127.0.0.1, NOT localhost: on Windows "localhost" tries IPv6 (::1) first
    # and silently adds ~2 s per request — measured 2050 ms vs 8 ms for the
    # exact same cached request. That artifact inflated every latency number
    # in earlier eval reports.
    parser.add_argument("--base-url", default=os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--dataset", type=Path, default=DATASET_PATH)
    parser.add_argument("--timeout", type=float, default=45.0)
    # Default pacing keeps the run under the Gemini free-tier RPM limit so
    # the eval measures chatbot logic instead of exhausting provider quota
    # (an unpaced 200-message run flipped to PROVIDER_QUOTA at message ~65).
    parser.add_argument("--sleep", type=float, default=4.0)
    parser.add_argument("--limit", type=int, default=0, help="Run only the first N cases.")
    parser.add_argument("--session-id", default=f"manual-200-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}")
    args = parser.parse_args()

    cases = load_cases(args.dataset)
    if args.limit > 0:
        cases = cases[: args.limit]
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    detail_path = REPORTS_DIR / f"manual_200_http_eval_{timestamp}.jsonl"
    summary_path = REPORTS_DIR / f"manual_200_http_eval_{timestamp}_summary.json"
    latest_detail_path = REPORTS_DIR / "manual_200_http_eval_latest.jsonl"
    latest_summary_path = REPORTS_DIR / "manual_200_http_eval_latest_summary.json"

    base_url = args.base_url.rstrip("/")
    if base_url.endswith("/api/ai/chat"):
        url = base_url
    elif base_url.endswith("/api/ai"):
        url = f"{base_url}/chat"
    else:
        url = f"{base_url}/api/ai/chat"

    secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()
    started_at = datetime.now(UTC).isoformat()
    results: list[dict] = []

    with detail_path.open("w", encoding="utf-8") as detail_handle:
        for index, case in enumerate(cases, start=1):
            payload = {
                "message": case["message"],
                "level": case.get("level", "A1"),
                "includeArabic": bool(case.get("includeArabic", False)),
                "voiceMode": False,
                "sessionId": args.session_id,
                "userId": f"manual-eval-{case['id']}",
            }
            headers = {
                "X-User-ID": f"manual-eval-{case['id']}",
            }
            if secret:
                headers["X-Internal-Service-Secret"] = secret

            started_case = time.perf_counter()
            status, response_body = post_json_with_hard_timeout(url, payload, headers, args.timeout)
            wall_latency_ms = round((time.perf_counter() - started_case) * 1000, 2)

            ok = 200 <= status < 300 and isinstance(response_body, dict)
            result = {
                "case": case,
                "request": {
                    "url": url,
                    "payload": payload,
                    "headers": {
                        "X-User-ID": headers["X-User-ID"],
                        "X-Internal-Service-Secret": "<set>" if secret else "<unset>",
                    },
                },
                "status": status,
                "ok": ok,
                "wallLatencyMs": wall_latency_ms,
                "response": response_body if isinstance(response_body, dict) else {"raw": response_body},
            }
            results.append(result)
            detail_handle.write(json.dumps(result, ensure_ascii=False) + "\n")
            detail_handle.flush()

            answer = result["response"].get("answerHe") if isinstance(result["response"], dict) else None
            fallback = result["response"].get("fallbackUsed") if isinstance(result["response"], dict) else None
            print(
                f"[{index:03d}/{len(cases)}] {case['id']} status={status} "
                f"fallback={fallback} latency={wall_latency_ms}ms answer={answer!r}",
                flush=True,
            )
            if args.sleep > 0:
                time.sleep(args.sleep)

    completed_at = datetime.now(UTC).isoformat()
    summary = build_summary(results, started_at, completed_at, args.dataset)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    latest_detail_path.write_text(detail_path.read_text(encoding="utf-8"), encoding="utf-8")
    latest_summary_path.write_text(summary_path.read_text(encoding="utf-8"), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    print(f"DETAIL_REPORT={detail_path}", flush=True)
    print(f"SUMMARY_REPORT={summary_path}", flush=True)
    return 0 if summary["errorCases"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
