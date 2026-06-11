"""
Live probe: POST real held-out messages to a running ai-service and print a
layer-by-layer diagnosis (router, guardrails, session memory, cache, LLM).

Run:
    cd ai-service
    python evals/run_live_probe.py --base-url http://127.0.0.1:8000
"""
from __future__ import annotations

import argparse
import json
import multiprocessing
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


def load_dotenv(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and (override or key not in os.environ):
            os.environ[key] = value


# (label, message, sessionId, expectation, llm_bound)
PROBES = [
    ("router greeting", "שלום", None, "answer, routerHit", False),
    ("courtesy", "נעים מאוד", None, "answer, not OUT_OF_SCOPE", True),
    ("name capture", "שלום קוראים לי דנה", "probe-s1", "store name fact", False),
    ("name recall", "איך קוראים לי?", "probe-s1", "answer mentions דנה", False),
    ("pure Arabic", "كيف أقول בית بالعبرية؟", None, "MIXED_LANGUAGE + answerAr", False),
    ("English", "good morning teacher", None, "MIXED_LANGUAGE, answerAr=null", False),
    (
        "jargon OOS",
        "אלגוריתמים גנטיים ורשתות נוירונים",
        None,
        "OUT_OF_SCOPE",
        False,
    ),
    ("whitespace only", "   ", None, "EMPTY_MESSAGE", False),
    ("A1 statement", "אמא שלי עובדת בחנות", None, "LLM answer + question", True),
    ("A1 question", "איפה אני יכול לקנות לחם?", None, "LLM answer", True),
    ("grammar error", "אני רוצים מים", None, "gentle correction", True),
    ("memory set fact", "אני גר בחיפה", "probe-s2", "store city fact", True),
    ("memory use fact", "באיזו עיר אני גר?", "probe-s2", "mention חיפה", True),
    ("cache repeat", "אמא שלי עובדת בחנות", None, "cacheHit=true if previous succeeded", False),
    ("realtime", "מה השעה עכשיו?", None, "graceful handling", True),
]


def post_chat(
    base_url: str,
    secret: str,
    message: str,
    session_id: str | None,
    user_id: str,
    timeout: float,
) -> tuple[int, dict, float]:
    payload: dict = {"message": message, "level": "A1", "includeArabic": True}
    if session_id:
        payload["sessionId"] = session_id
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/ai/chat",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Internal-Service-Secret": secret,
            "X-User-ID": user_id,
        },
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return resp.status, data, (time.perf_counter() - started) * 1000
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body_text)
        except json.JSONDecodeError:
            parsed = {"raw": body_text}
        return exc.code, parsed, (time.perf_counter() - started) * 1000
    except Exception as exc:
        return 0, {"error": str(exc)}, (time.perf_counter() - started) * 1000


def _post_worker(queue, *args) -> None:
    queue.put(post_chat(*args))


def post_chat_with_hard_timeout(*args, timeout: float) -> tuple[int, dict, float]:
    queue: multiprocessing.Queue = multiprocessing.Queue(maxsize=1)
    process = multiprocessing.Process(target=_post_worker, args=(queue, *args, timeout))
    started = time.perf_counter()
    process.start()
    process.join(timeout)
    if process.is_alive():
        process.terminate()
        process.join(5)
        return (
            0,
            {"error": "HARD_TIMEOUT", "detail": f"Probe exceeded {timeout} seconds"},
            (time.perf_counter() - started) * 1000,
        )
    if queue.empty():
        return (
            0,
            {"error": "NO_WORKER_RESULT", "detail": f"exitcode={process.exitcode}"},
            (time.perf_counter() - started) * 1000,
        )
    return queue.get()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    load_dotenv(ROOT_DIR.parent / ".env")
    load_dotenv(ROOT_DIR / ".env", override=True)

    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--sleep-llm", type=float, default=4.0)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "")
    probes = PROBES[: args.limit] if args.limit > 0 else PROBES
    failures: list[tuple[str, str]] = []

    for index, (label, message, session_id, expectation, llm_bound) in enumerate(probes):
        if llm_bound:
            time.sleep(args.sleep_llm)
        status, data, wall_ms = post_chat_with_hard_timeout(
            args.base_url,
            secret,
            message,
            session_id,
            f"probe-{index}",
            timeout=args.timeout,
        )
        if status != 200:
            print(f"[{label}] HTTP {status}: {data}")
            failures.append((label, f"HTTP {status}"))
            continue

        outcome = (
            "FALLBACK:" + str(data.get("fallbackReason"))
            if data.get("fallbackUsed")
            else "ANSWER"
        )
        print(f"[{label}]")
        print(f"  msg:      {message!r}")
        print(f"  expected: {expectation}")
        print(
            "  outcome:  "
            f"{outcome} (cacheHit={data.get('cacheHit')}, router={data.get('routerHit')}, "
            f"latency={data.get('latencyMs')}ms, wall={wall_ms:.0f}ms)"
        )
        print(f"  answerHe: {data.get('answerHe')}")
        if data.get("answerAr"):
            print(f"  answerAr: {data.get('answerAr')}")
        scores = data.get("retrievalScores") or []
        if scores:
            print(f"  retrieval: chunks={data.get('contextChunkIds')} scores={scores}")
        print()

    if failures:
        print("HTTP-level failures:", failures)
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
