from __future__ import annotations

import json
import os
import statistics
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from main import app  # noqa: E402
from services.chat_cache import EXACT_RESPONSE_CACHE, get_level_bundle  # noqa: E402
from services.chat_guardrails import MAX_HEBREW_WORDS, count_hebrew_words, get_fallback_text  # noqa: E402

REPORT_DIR = ROOT_DIR / "evals" / "reports"
JSON_REPORT_PATH = REPORT_DIR / "day3_prompt_v2_latest.json"
MARKDOWN_REPORT_PATH = REPORT_DIR / "day3_prompt_v2_latest.md"


def build_dataset() -> list[dict]:
    bundle = get_level_bundle("A1")
    dataset: list[dict] = []
    for message in bundle.question_answer_map.keys():
        dataset.append(
            {
                "message": message,
                "level": "A1",
                "includeArabic": False,
                "expectArabic": False,
            }
        )
        if len(dataset) == 44:
            break

    dataset.extend(
        [
            {"message": "שלום", "level": "A1", "includeArabic": False, "expectArabic": False},
            {"message": "תודה", "level": "A1", "includeArabic": False, "expectArabic": False},
            {"message": "קפה", "level": "A1", "includeArabic": True, "expectArabic": True},
            {"message": "שלום", "level": "A1", "includeArabic": True, "expectArabic": True},
            {"message": "תודה", "level": "A1", "includeArabic": True, "expectArabic": True},
            {"message": "מה שלומך?", "level": "A1", "includeArabic": False, "expectArabic": False},
        ]
    )
    return dataset


def percentile(values: list[int], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    rank = (len(values) - 1) * p
    lower = int(rank)
    upper = min(len(values) - 1, lower + 1)
    fraction = rank - lower
    return values[lower] + (values[upper] - values[lower]) * fraction


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    EXACT_RESPONSE_CACHE.clear()
    dataset = build_dataset()
    client = TestClient(app)

    results: list[dict] = []
    http_latencies: list[int] = []
    short_answer_count = 0
    no_leakage_count = 0
    no_extra_explanation_count = 0
    arabic_only_when_requested_count = 0
    clear_fallback_count = 0

    with client:
        for item in dataset:
            started_at = time.perf_counter()
            response = client.post("/api/ai/chat", json=item)
            elapsed_ms = int(round((time.perf_counter() - started_at) * 1000))
            body = response.json()
            http_latencies.append(elapsed_ms)

            short_answer = body["fallbackUsed"] or count_hebrew_words(body["answerHe"]) <= MAX_HEBREW_WORDS
            no_leakage = not body["guardrail"]["vocabularyLeakage"]
            no_extra_explanation = "\n" not in body["answerHe"]
            arabic_only_when_requested = (item["includeArabic"] or body["answerAr"] is None)
            clear_fallback = (not body["fallbackUsed"]) or (
                body["answerHe"] == get_fallback_text(body["fallbackReason"])
            )

            short_answer_count += int(short_answer)
            no_leakage_count += int(no_leakage)
            no_extra_explanation_count += int(no_extra_explanation)
            arabic_only_when_requested_count += int(arabic_only_when_requested)
            clear_fallback_count += int(clear_fallback)

            results.append(
                {
                    "message": item["message"],
                    "status": response.status_code,
                    "fallbackUsed": body["fallbackUsed"],
                    "fallbackReason": body["fallbackReason"],
                    "answerHe": body["answerHe"],
                    "answerAr": body["answerAr"],
                    "routerHit": body["routerHit"],
                    "cacheHit": body["cacheHit"],
                    "httpLatencyMs": elapsed_ms,
                    "shortAnswer": short_answer,
                    "noLeakage": no_leakage,
                    "noExtraExplanation": no_extra_explanation,
                    "arabicOnlyWhenRequested": arabic_only_when_requested,
                    "clearFallback": clear_fallback,
                }
            )

    http_latencies.sort()
    summary = {
        "count": len(results),
        "averageHttpLatencyMs": round(statistics.mean(http_latencies), 2),
        "p95HttpLatencyMs": round(percentile(http_latencies, 0.95), 2),
        "shortAnswerCount": short_answer_count,
        "noLeakageCount": no_leakage_count,
        "noExtraExplanationCount": no_extra_explanation_count,
        "clearFallbackCount": clear_fallback_count,
        "arabicOnlyWhenRequestedCount": arabic_only_when_requested_count,
    }

    JSON_REPORT_PATH.write_text(
        json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    MARKDOWN_REPORT_PATH.write_text(render_markdown(summary, results), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


def render_markdown(summary: dict, results: list[dict]) -> str:
    lines = [
        "# Day 3 Prompt V2 Evaluation",
        "",
        "## Summary",
        f"- Questions: {summary['count']}",
        f"- Average HTTP latency: {summary['averageHttpLatencyMs']} ms",
        f"- P95 HTTP latency: {summary['p95HttpLatencyMs']} ms",
        f"- Short answers: {summary['shortAnswerCount']}/{summary['count']}",
        f"- No leakage: {summary['noLeakageCount']}/{summary['count']}",
        f"- No extra explanation: {summary['noExtraExplanationCount']}/{summary['count']}",
        f"- Clear fallback text: {summary['clearFallbackCount']}/{summary['count']}",
        f"- Arabic only when requested: {summary['arabicOnlyWhenRequestedCount']}/{summary['count']}",
        "",
        "## Results",
    ]
    for item in results:
        lines.append(
            f"- status={item['status']} routerHit={item['routerHit']} cacheHit={item['cacheHit']} short={item['shortAnswer']} fallback={item['fallbackReason']} httpLatencyMs={item['httpLatencyMs']}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    exit_code = main()
    sys.stdout.flush()
    os._exit(exit_code)
