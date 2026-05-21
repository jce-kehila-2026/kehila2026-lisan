from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from main import app  # noqa: E402
from services.chat_cache import EXACT_RESPONSE_CACHE  # noqa: E402
from services.chat_guardrails import get_fallback_text  # noqa: E402
from services.chat_provider import ChatProviderTimeoutError, ProviderResult  # noqa: E402

DATASET_PATH = ROOT_DIR / "evals" / "day4_fallback_20.json"
REPORT_DIR = ROOT_DIR / "evals" / "reports"
JSON_REPORT_PATH = REPORT_DIR / "day4_fallback_latest.json"
MARKDOWN_REPORT_PATH = REPORT_DIR / "day4_fallback_latest.md"


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    EXACT_RESPONSE_CACHE.clear()
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    results: list[dict] = []

    with TestClient(app) as client:
        for item in dataset:
            response = client.post(
                "/api/ai/chat",
                json={"message": item["message"], "level": "A1", "includeArabic": False},
            )
            body = response.json()
            results.append(
                {
                    "message": item["message"],
                    "status": response.status_code,
                    "expectedReason": item["expectedReason"],
                    "actualReason": body["fallbackReason"],
                    "answerHe": body["answerHe"],
                    "match": response.status_code == 200
                    and body["fallbackReason"] == item["expectedReason"]
                    and body["answerHe"] == get_fallback_text(item["expectedReason"]),
                }
            )

        timeout_result = run_timeout_case(client)
        leakage_result = run_leakage_case(client)

    results.extend(timeout_result)
    results.extend(leakage_result)
    summary = {
        "count": len(results),
        "passCount": sum(1 for item in results if item["match"]),
    }
    JSON_REPORT_PATH.write_text(
        json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    MARKDOWN_REPORT_PATH.write_text(render_markdown(summary, results), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


def run_timeout_case(client: TestClient) -> list[dict]:
    outputs: list[dict] = []
    for message in ("מי אני", "איפה פדי גר"):
        EXACT_RESPONSE_CACHE.clear()
        with (
            patch("services.chat_engine.route_message", return_value=None),
            patch("services.chat_engine.call_provider", side_effect=ChatProviderTimeoutError("timeout")),
        ):
            response = client.post(
                "/api/ai/chat",
                json={"message": message, "level": "A1", "includeArabic": False},
            )
        body = response.json()
        outputs.append(
            {
                "message": message,
                "status": response.status_code,
                "expectedReason": "MODEL_TIMEOUT",
                "actualReason": body["fallbackReason"],
                "answerHe": body["answerHe"],
                "match": response.status_code == 200
                and body["fallbackReason"] == "MODEL_TIMEOUT"
                and body["answerHe"] == get_fallback_text("MODEL_TIMEOUT"),
            }
        )
    return outputs


def run_leakage_case(client: TestClient) -> list[dict]:
    outputs: list[dict] = []
    for message in ("מי אני", "מה שלומך?"):
        EXACT_RESPONSE_CACHE.clear()
        with (
            patch("services.chat_engine.route_message", return_value=None),
            patch(
                "services.chat_engine.call_provider",
                return_value=ProviderResult(
                    answer="פילוסופיה מודרנית",
                    latency_seconds=0.01,
                    input_tokens=5,
                    output_tokens=2,
                ),
            ),
        ):
            response = client.post(
                "/api/ai/chat",
                json={"message": message, "level": "A1", "includeArabic": False},
            )
        body = response.json()
        outputs.append(
            {
                "message": message,
                "status": response.status_code,
                "expectedReason": "VOCAB_LEAKAGE",
                "actualReason": body["fallbackReason"],
                "answerHe": body["answerHe"],
                "match": response.status_code == 200
                and body["fallbackReason"] == "VOCAB_LEAKAGE"
                and body["answerHe"] == get_fallback_text("VOCAB_LEAKAGE"),
            }
        )
    return outputs


def render_markdown(summary: dict, results: list[dict]) -> str:
    lines = [
        "# Day 4 Fallback Evaluation",
        "",
        "## Summary",
        f"- Cases: {summary['count']}",
        f"- Passed: {summary['passCount']}/{summary['count']}",
        "",
        "## Results",
    ]
    for item in results:
        lines.append(
            f"- status={item['status']} expected={item['expectedReason']} actual={item['actualReason']} pass={item['match']}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    exit_code = main()
    sys.stdout.flush()
    os._exit(exit_code)
