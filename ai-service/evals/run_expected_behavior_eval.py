from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from services.chat_schemas import ChatRequest
from services.chat_engine import generate_chat_response


DATASET_PATH = BASE_DIR / "evals" / "eval_expected_behavior.jsonl"


def main() -> int:
    failures: list[str] = []
    count = 0
    for line_no, line in enumerate(DATASET_PATH.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        count += 1
        item = json.loads(line)
        response = generate_chat_response(
            ChatRequest(
                message=item["message"],
                level=item.get("level", "A1"),
                includeArabic=bool(item.get("includeArabic", False)),
                sessionId=f"expected-eval-{line_no}",
            )
        )
        expected = item.get("expected", item)
        if bool(response.fallbackUsed) != bool(expected.get("fallbackUsed", expected.get("fallbackExpected", False))):
            failures.append(f"line {line_no}: fallbackUsed={response.fallbackUsed}")
        if expected.get("routerHit") is not None and bool(response.routerHit) != bool(expected["routerHit"]):
            failures.append(f"line {line_no}: routerHit={response.routerHit}")
        expected_reason = expected.get("fallbackReason")
        if expected_reason and response.fallbackReason != expected_reason:
            failures.append(f"line {line_no}: fallbackReason={response.fallbackReason}")
        if expected.get("answerArNotNull") and not response.answerAr:
            failures.append(f"line {line_no}: answerAr missing")
        contains_any = expected.get("containsAny") or []
        if contains_any and not any(str(needle) in response.answerHe for needle in contains_any):
            failures.append(f"line {line_no}: answerHe did not contain expected options")
    print(json.dumps({"count": count, "failures": failures}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
