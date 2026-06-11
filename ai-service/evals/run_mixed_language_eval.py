from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest
from services.language_profile import detect_language_profile


DATASET_PATH = BASE_DIR / "evals" / "mixed_language_eval.jsonl"
DETERMINISTIC_FALLBACKS = {
    "EMPTY_MESSAGE",
    "TOO_LONG",
    "TOO_MANY_WORDS",
    "OUT_OF_SCOPE",
    "CIRCUIT_OPEN",
}


def main() -> int:
    failures: list[str] = []
    stats = {
        "count": 0,
        "fallbacks": 0,
        "routerHits": 0,
        "answerAr": 0,
        "mixedProfiles": 0,
        "llmSkippedLikely": 0,
        "profileSources": {},
    }
    for line_no, line in enumerate(DATASET_PATH.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        item = json.loads(line)
        expected = item.get("expected", {})
        profile = detect_language_profile(item["message"])
        response = generate_chat_response(
            ChatRequest(
                message=item["message"],
                level=item.get("level", "A1"),
                includeArabic=bool(item.get("includeArabic", False)),
                sessionId=f"mixed-eval-{line_no}",
            )
        )
        stats["count"] += 1
        stats["fallbacks"] += int(response.fallbackUsed)
        stats["routerHits"] += int(response.routerHit)
        stats["answerAr"] += int(bool(response.answerAr))
        stats["mixedProfiles"] += int(profile.is_mixed)
        stats["llmSkippedLikely"] += int(_llm_skipped_likely(response))
        profile_sources = stats["profileSources"]
        profile_sources[profile.source] = profile_sources.get(profile.source, 0) + 1

        _check_bool(failures, line_no, "fallbackUsed", response.fallbackUsed, expected)
        _check_bool(failures, line_no, "routerHit", response.routerHit, expected)
        if expected.get("fallbackReason") and response.fallbackReason != expected["fallbackReason"]:
            failures.append(f"line {line_no}: fallbackReason={response.fallbackReason}")
        if expected.get("answerArNotNull") and not response.answerAr:
            failures.append(f"line {line_no}: answerAr missing")
        if expected.get("primaryLanguage") and profile.primary_language != expected["primaryLanguage"]:
            failures.append(f"line {line_no}: primaryLanguage={profile.primary_language}")
        contains_any = expected.get("containsAny") or []
        if contains_any and not any(str(needle) in response.answerHe for needle in contains_any):
            failures.append(f"line {line_no}: answerHe did not contain expected options")

    print(json.dumps({"stats": stats, "failures": failures}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


def _check_bool(
    failures: list[str],
    line_no: int,
    field: str,
    actual: bool,
    expected: dict,
) -> None:
    if field in expected and bool(actual) != bool(expected[field]):
        failures.append(f"line {line_no}: {field}={actual}")


def _llm_skipped_likely(response) -> bool:
    if response.routerHit or response.cacheHit:
        return True
    return bool(response.fallbackUsed and response.fallbackReason in DETERMINISTIC_FALLBACKS)


if __name__ == "__main__":
    raise SystemExit(main())
