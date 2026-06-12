from __future__ import annotations

import json
import time
import urllib.request
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "evals" / "manual_conversation_simulations_2026-06-12.md"
URL = "http://127.0.0.1:8000/api/ai/chat"
BASE_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Internal-Service-Secret": "lisan-dev-secret-2026",
}


SCENARIOS = [
    ("gas_station", "Gas station", ["בוא נעשה שיחה בקזיה", "בנזין", "בנזין זה דלק", "כמה זה עולה", "אני רוצה מים", "איפה הקופה", "תודה", "אני משלם בכרטיס", "קפה זה משקה", "יאללה"]),
    ("supermarket", "Supermarket", ["בוא נעשה שיחה בסופר", "חלב", "חלב זה משקה לבן", "אני רוצה לחם", "כמה עולה חלב", "יש בננה", "בננה זה פרי", "איפה הקופה", "בסדר", "תני לי משפט קצר לתרגל"]),
    ("clinic", "Clinic", ["שיחה עם דוקטור", "רופא", "מה זה רופא", "אני חולה", "כואב לי הראש", "יש לי תור", "מרפאה זה מקום", "לא יודע", "למה", "תודה"]),
    ("university", "University", ["בוא נלמד באוניברסיטה", "כיתה", "כיתה זה מקום", "אני סטודנט", "איפה הכיתה", "שיעור", "שיעור זה לימוד", "אני לומד עברית", "בסדר", "תן משפט קצר"]),
    ("bus_station", "Bus station", ["שיחה בתחנה", "אוטובוס", "מה זה אוטובוס", "אני נוסע לירושלים", "איפה התחנה", "כרטיס", "כרטיס זה דבר", "כמה זה עולה", "תודה רבה", "יאללה"]),
    ("cafe", "Cafe", ["בוא נעשה שיחה בבית קפה", "קפה", "מה זה קפה", "אני רוצה קפה", "חלב", "קפה עם חלב", "זה טעים", "אני משלם", "תודה", "עוד משפט"]),
    ("bank", "Bank", ["שיחה בבנק", "בנק", "מה זה חשבון", "חשבון זה כסף", "אני רוצה לפתוח חשבון", "טופס", "טופס זה דף", "חתימה", "לא יודע", "תודה"]),
    ("post_office", "Post office", ["שיחה בדואר", "דואר", "איפה הדואר", "מעטפה", "מעטפה זה נייר", "אני שולח מכתב", "כמה זה עולה", "בול", "בול זה דבר קטן", "תודה"]),
    ("apartment", "Apartment", ["שיחה על דירה", "בית", "מה זה בית", "אני גר בבית", "חדר", "חדר זה מקום", "מטבח", "יש מים בבית", "בבית", "בסדר"]),
    ("phone_store", "Phone store", ["שיחה בחנות טלפונים", "טלפון", "טלפון זה דבר", "אני רוצה טלפון חדש", "כמה זה עולה", "מטען", "מטען זה דבר", "יש אחריות", "לא יודע", "תודה"]),
    ("bakery", "Bakery", ["שיחה במאפייה", "לחם", "מה זה לחם", "אני רוצה לחם", "עוגה", "עוגה זה אוכל", "כמה עולה עוגה", "טרי", "טרי זה טוב", "תודה"]),
    ("restaurant", "Restaurant", ["בוא נעשה שיחה במסעדה", "תפריט", "תפריט זה דף", "אני רוצה סלט", "מים", "אני רוצה מים", "כמה זה עולה", "טעים", "האוכל טעים", "תודה"]),
    ("pharmacy", "Pharmacy", ["שיחה בבית מרקחת", "תרופה", "מה זה תרופה", "אני צריך תרופה", "רופא אמר לי", "מרשם", "מרשם זה דף", "כמה זה עולה", "בסדר", "תודה"]),
    ("hotel", "Hotel", ["שיחה במלון", "חדר", "מה זה חדר", "אני רוצה חדר", "לילה", "לילה זה זמן", "מפתח", "מפתח זה דבר", "איפה המעלית", "תודה"]),
    ("market", "Market", ["שיחה בשוק", "עגבניה", "עגבניה זה אוכל", "אני רוצה קילו", "כמה עולה", "יקר", "זה יקר", "בננה", "בננה זה פרי", "תודה"]),
    ("clothing_store", "Clothing store", ["שיחה בחנות בגדים", "חולצה", "חולצה זה בגד", "אני רוצה חולצה", "מידה", "מידה זה מספר", "כמה זה עולה", "יקר לי", "יש צבע כחול", "תודה"]),
    ("library", "Library", ["שיחה בספרייה", "ספר", "ספר זה דבר שקוראים", "אני רוצה ספר", "איפה הספר", "שקט", "שקט זה טוב", "אני לומד כאן", "בסדר", "תודה"]),
    ("gym", "Gym", ["שיחה בחדר כושר", "ספורט", "ספורט זה פעילות", "אני רוצה להתאמן", "מים", "אני שותה מים", "מנוי", "מנוי זה חשבון", "לא יודע", "יאללה"]),
    ("workplace", "Workplace", ["שיחה בעבודה", "עבודה", "מה זה עבודה", "אני עובד היום", "משרד", "משרד זה מקום", "פגישה", "יש לי פגישה", "בסדר", "תודה"]),
    ("municipality", "Municipality", ["שיחה בעירייה", "עירייה", "מה זה עירייה", "אני צריך טופס", "טופס זה דף", "תור", "יש לי תור", "מסמך", "מסמך זה נייר", "תודה"]),
]


def expected_for(message: str) -> str:
    if "בוא" in message or "שיחה" in message:
        return "Expected tutor to start a practical role-play for this setting."
    if message.startswith("מה זה "):
        return "Expected meaning if known, otherwise no hallucination and a practice prompt."
    if " זה " in message:
        return "Expected teacher to accept/shape the learner definition and ask a follow-up."
    if message in {"לא יודע", "למה", "בסדר", "יאללה", "תודה", "תודה רבה"}:
        return "Expected local conversational continuation, not LLM/provider quota."
    if len(message.split()) == 1:
        return "Expected single-word practice prompt or known glossary response."
    return "Expected short learner-sentence continuation inside the scenario."


def classify(resp: dict) -> str:
    if resp.get("fallbackUsed"):
        return f"fallback:{resp.get('fallbackReason')}"
    if resp.get("cacheHit"):
        return "cache"
    if resp.get("routerHit"):
        return "local/router"
    if resp.get("inputTokens") or resp.get("outputTokens"):
        return "llm/provider"
    return "unknown-nonfallback"


def post(message: str, session_id: str) -> dict:
    body = json.dumps(
        {
            "message": message,
            "level": "A1",
            "includeArabic": True,
            "sessionId": session_id,
            "userId": "manual-20-sim-agent",
        },
        ensure_ascii=False,
    ).encode("utf-8")
    headers = {**BASE_HEADERS, "X-User-ID": session_id}
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    summary = {
        "total": 0,
        "fallback": 0,
        "provider_quota": 0,
        "local": 0,
        "llm": 0,
        "cache": 0,
        "unknown": 0,
        "request_error": 0,
    }
    lines: list[str] = [
        "# Manual 20 Conversation Simulation - AI Service",
        "",
        f"- Generated: {datetime.now().isoformat(timespec='seconds')}",
        "- Method: direct POST to `/api/ai/chat`, 20 unique `sessionId`s, 10 sequential messages each.",
        "- Persona: Arabic-speaking student practicing Hebrew with a tutor in everyday-life situations.",
        "",
    ]

    for idx, (slug, title, messages) in enumerate(SCENARIOS, start=1):
        session_id = f"manual-sim-{idx:02d}-{slug}-{int(time.time())}"
        lines.extend(
            [
                f"## {idx}. {title} (`{slug}`)",
                "",
                f"- Session ID: `{session_id}`",
                "",
                "| # | Student message | Bot response | Expected | Source/diagnosis | Notes |",
                "|---:|---|---|---|---|---|",
            ]
        )
        for turn, message in enumerate(messages, start=1):
            summary["total"] += 1
            try:
                resp = post(message, session_id)
                answer = resp.get("answerHe") or ""
                source = classify(resp)
                if source.startswith("fallback"):
                    summary["fallback"] += 1
                    if resp.get("fallbackReason") == "PROVIDER_QUOTA":
                        summary["provider_quota"] += 1
                elif source == "local/router":
                    summary["local"] += 1
                elif source == "cache":
                    summary["cache"] += 1
                elif source == "llm/provider":
                    summary["llm"] += 1
                else:
                    summary["unknown"] += 1
                note = "OK" if not resp.get("fallbackUsed") else "Breaks simulation flow"
                if source == "unknown-nonfallback":
                    note = "Answered, but route metadata is unclear"
            except Exception as exc:
                answer = f"ERROR: {type(exc).__name__}: {exc}"
                source = "request-error"
                summary["request_error"] += 1
                note = "Request failed"

            def esc(value: object) -> str:
                return str(value).replace("|", "\\|").replace("\n", "<br>")

            lines.append(
                f"| {turn} | {esc(message)} | {esc(answer)} | "
                f"{esc(expected_for(message))} | `{esc(source)}` | {esc(note)} |"
            )
            time.sleep(0.03)
        lines.append("")

    lines[5:5] = [
        (
            f"- Summary: total={summary['total']}, local={summary['local']}, "
            f"llm={summary['llm']}, cache={summary['cache']}, fallback={summary['fallback']}, "
            f"provider_quota={summary['provider_quota']}, unknown={summary['unknown']}, "
            f"request_error={summary['request_error']}."
        ),
        "",
    ]
    lines.extend(
        [
            "## Aggregate Findings",
            "",
            f"- Total turns: {summary['total']}",
            f"- Local/router turns: {summary['local']}",
            f"- LLM/provider turns: {summary['llm']}",
            f"- Cache turns: {summary['cache']}",
            f"- Fallback turns: {summary['fallback']}",
            f"- Provider quota fallbacks: {summary['provider_quota']}",
            f"- Unknown non-fallback route: {summary['unknown']}",
            f"- Request errors: {summary['request_error']}",
            "",
            (
                "Result: all scripted everyday-life simulations completed without fallback interruption."
                if summary["fallback"] == 0 and summary["request_error"] == 0
                else "Result: some turns still interrupted the simulation; inspect rows marked `Breaks simulation flow`."
            ),
        ]
    )
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
