from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_CHAT_CASES = [
    {
        "name": "mixed_word_meaning",
        "payload": {"message": "شو يعني בית؟", "level": "A1", "includeArabic": True},
        "expect": {"fallbackUsed": False, "routerHit": True, "answerAr": True},
    },
    {
        "name": "hebrew_thanks",
        "payload": {"message": "תודה", "level": "A1"},
        "expect": {"fallbackUsed": False, "routerHit": True, "contains": "בבקשה"},
    },
    {
        "name": "oos_technical",
        "payload": {"message": "אלגוריתמים גנטיים ורשתות נוירונים", "level": "A1"},
        "expect": {"fallbackUsed": True, "fallbackReason": "OUT_OF_SCOPE"},
    },
]


@dataclass
class SmokeResult:
    name: str
    ok: bool
    status: int | None
    detail: str
    latency_ms: int


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a production-style smoke check against ai-service.")
    parser.add_argument("--base-url", default=os.getenv("AI_SMOKE_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--internal-secret", default=os.getenv("AI_SERVICE_INTERNAL_SECRET", ""))
    parser.add_argument("--jwt", default=os.getenv("AI_SMOKE_JWT", ""))
    parser.add_argument("--fail-on-degraded-ready", action="store_true")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if args.internal_secret:
        headers["X-Internal-Service-Secret"] = args.internal_secret
    if args.jwt:
        headers["Authorization"] = f"Bearer {args.jwt}"

    results: list[SmokeResult] = []
    results.append(_get_json("health", f"{base_url}/api/ai/health", headers, expect_status=200))
    ready = _get_json(
        "ready",
        f"{base_url}/api/ai/ready",
        headers,
        expect_status=200 if args.fail_on_degraded_ready else None,
    )
    results.append(ready)

    for case in DEFAULT_CHAT_CASES:
        results.append(
            _post_chat(
                case["name"],
                f"{base_url}/api/ai/chat",
                headers,
                case["payload"],
                case["expect"],
            )
        )

    summary = {
        "baseUrl": base_url,
        "ok": all(result.ok for result in results),
        "results": [result.__dict__ for result in results],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["ok"] else 1


def _get_json(name: str, url: str, headers: dict[str, str], expect_status: int | None) -> SmokeResult:
    started = time.perf_counter()
    try:
        status, body = _request_json("GET", url, headers)
    except urllib.error.HTTPError as exc:
        status = exc.code
        body = _decode_error_body(exc)
    except Exception as exc:
        return SmokeResult(name, False, None, str(exc), _elapsed(started))

    if expect_status is not None and status != expect_status:
        return SmokeResult(name, False, status, f"expected {expect_status}, got {status}: {body}", _elapsed(started))
    if status >= 500:
        return SmokeResult(name, False, status, f"server error: {body}", _elapsed(started))
    return SmokeResult(name, True, status, "ok", _elapsed(started))


def _post_chat(
    name: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    expect: dict[str, Any],
) -> SmokeResult:
    started = time.perf_counter()
    try:
        status, body = _request_json("POST", url, headers, payload)
    except urllib.error.HTTPError as exc:
        return SmokeResult(name, False, exc.code, _decode_error_body(exc), _elapsed(started))
    except Exception as exc:
        return SmokeResult(name, False, None, str(exc), _elapsed(started))

    if status != 200:
        return SmokeResult(name, False, status, f"expected 200: {body}", _elapsed(started))
    failure = _match_chat_expectations(body, expect)
    if failure:
        return SmokeResult(name, False, status, failure, _elapsed(started))
    return SmokeResult(name, True, status, "ok", _elapsed(started))


def _match_chat_expectations(body: dict[str, Any], expect: dict[str, Any]) -> str | None:
    for key in ("fallbackUsed", "routerHit", "fallbackReason"):
        if key in expect and body.get(key) != expect[key]:
            return f"{key} expected {expect[key]!r}, got {body.get(key)!r}"
    if expect.get("answerAr") and not body.get("answerAr"):
        return "answerAr missing"
    if expect.get("contains") and expect["contains"] not in str(body.get("answerHe", "")):
        return f"answerHe does not contain {expect['contains']!r}"
    return None


def _request_json(
    method: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=12) as response:
        raw = response.read().decode("utf-8")
        return response.status, json.loads(raw) if raw else {}


def _decode_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        return exc.read().decode("utf-8")
    except Exception:
        return str(exc)


def _elapsed(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


if __name__ == "__main__":
    raise SystemExit(main())
