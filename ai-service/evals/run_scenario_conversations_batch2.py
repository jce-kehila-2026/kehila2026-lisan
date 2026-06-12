"""
run_scenario_conversations_batch2.py

Second batch of 20 LIVE multi-turn scenario conversations — completely
different situations/goals from batch 1 (evals/run_scenario_conversations.py).
Deliberately stresses the things we just fixed:

  - grammar-error turns (e.g. "היא גר", "אני הלך")  → must be CORRECTED by the
    LLM, not praised locally (fix: short-sentence path defers errors to LLM),
  - price/number turns ("כמה זה? 10 שקל")           → must NOT be nuked as
    VOCAB_LEAKAGE,
  - off-topic drift turns                            → must re-anchor, never
    "out of scope",
  - longer sessions                                  → no mid-word truncation,
    no MODEL_ERROR / CIRCUIT_OPEN cascade (thinking disabled).

Writes evals/scenario_conversations_batch2.md. Run while the server is up:
    python evals/run_scenario_conversations_batch2.py
"""
from __future__ import annotations

import time
from datetime import datetime

import requests

BASE = "http://localhost:8000/api/ai/chat"
SECRET = "lisan-dev-secret-2026"
OUT = "evals/scenario_conversations_batch2.md"

PACE_SECONDS = 6.5
MAX_CONSECUTIVE_QUOTA = 6


def _session(session_id, scenario, level, situation, expected, turns):
    return {
        "session_id": session_id,
        "scenario": scenario,
        "level": level,
        "situation": situation,
        "expected": expected,
        "turns": turns,
    }


# 20 brand-new arcs. Each is a different real goal, with at least one grammar
# mistake and/or a number, and most include one off-topic drift.
SESSIONS = [
    _session("cafe-cold", "speaking", "A1", "בית קפה — קפה קר, מבקש להחליף",
             "מתקן טעות, מטפל בתלונה, נשאר מלצר",
             ["שלום", "הקפה שלי קר", "אני רוצה קפה חם", "אני שותה הרבה",
              "כמה זה עולה?", "תודה", "ביי"]),
    _session("cafe-two", "speaking", "A1", "בית קפה — הזמנה לשניים",
             "מנהל הזמנה לשניים, שואל שאלה אחת בכל תור",
             ["שלום", "אנחנו שניים", "אני רוצה תה והוא רוצה קפה",
              "יש עוגה?", "כמה הכל?", "אנחנו משלמים", "להתראות"]),
    _session("shop-return", "speaking", "A2", "חנות — החזרת מוצר",
             "מטפל בהחזרה, שואל פרטים, נשאר מוכר",
             ["שלום", "אני רוצה להחזיר חלב", "החלב לא טוב",
              "קניתי אתמול", "אני רוצה כסף בחזרה", "תודה רבה", "להתראות"]),
    _session("shop-card", "speaking", "A2", "חנות — תשלום בכרטיס",
             "שואל כמות, נותן מחיר במספרים, מקבל תשלום",
             ["היי", "אני רוצה לחם וחלב", "כמה הכל עולה?",
              "אפשר לשלם בכרטיס?", "איפה הכרטיס", "תודה", "ביי"]),
    _session("clinic-cancel", "speaking", "B1", "מרפאה — ביטול תור",
             "מטפל בביטול, מציע תור חלופי, נשאר פקיד",
             ["שלום", "אני רוצה לבטל את התור שלי", "התור היה היום בארבע",
              "אפשר תור מחר?", "באיזו שעה יש מקום?", "תודה על העזרה", "להתראות"]),
    _session("clinic-results", "speaking", "B1", "מרפאה — תוצאות בדיקה",
             "מסביר תהליך, מכוון לרופא, נשאר בתפקיד",
             ["בוקר טוב", "אני רוצה את תוצאות הבדיקה", "עשיתי בדיקת דם",
              "מתי הן מוכנות?", "צריך לדבר עם הרופא?", "תודה רבה"]),
    _session("office-vacation", "speaking", "B2", "משרד — בקשת חופשה",
             "עמית מנהל שיחה על חופשה ברמה גבוהה",
             ["שלום", "אני רוצה לבקש חופשה", "שבוע בחודש הבא",
              "למי אני צריך לפנות?", "צריך למלא טופס?", "תודה על המידע", "נתראה"]),
    _session("office-deadline", "speaking", "B2", "משרד — בעיה בלוח זמנים",
             "דיון על דדליין/בעיה, שומר על רמה",
             ["היי", "יש לי בעיה עם הפרויקט", "אני לא אספיק עד מחר",
              "אפשר עוד יומיים?", "מה אני אומר למנהל?", "תודה רבה"]),
    _session("word-mistake-a1", "daily-word", "A1", "מילת היום — תלמיד טועה",
             "מלמד מילה; כשהתלמיד כותב משפט שגוי (היא גר) מתקן בעדינות",
             ["שלום", "מוכן", "מה המילה?", "היא גר",
              "אני גר בתל אביב", "עוד מילה", "תודה"]),
    _session("word-b1", "daily-word", "B1", "מילת היום — B1",
             "מילה ברמת B1 (שירות/עבודה), הסבר ותרגול",
             ["שלום", "אני מוכן ללמוד", "תן לי מילה",
              "מה הפירוש?", "אפשר דוגמה?", "כתבתי משפט: אני הלך לעבודה", "תודה"]),
    _session("letters-mistake", "letters", "A1", "אותיות — תלמיד טועה + דריפט",
             "מתקן זיהוי שגוי של אות, מחזיר לתרגול عند الانحراف",
             ["שלום", "אני רוצה ללמוד אות", "מה האות?", "האות ב נשמעת ששש",
              "כמה השעה?", "אוקיי האות מ", "מים מתחיל במ", "תודה"]),
    _session("letters-a2", "letters", "A2", "אותיות — A2",
             "אות אחת בכל פעם, מילת דוגמה, מבקש לחזור",
             ["היי", "מוכן", "תן לי אות", "האות ר",
              "רחוב מתחיל בר", "עוד אות", "תודה רבה"]),
    _session("listen-place", "listening", "A1", "האזנה — A1 מקומות",
             "אומר משפט קצר על מקום ובודק הבנה",
             ["שלום", "מוכן", "תגיד משפט", "לא הבנתי",
              "אפשר שוב?", "עכשיו הבנתי", "עוד משפט", "תודה"]),
    _session("listen-b1", "listening", "B1", "האזנה — B1",
             "משפטים ארוכים יותר, נושאי שירות, בדיקת הבנה",
             ["בוקר טוב", "מוכן להאזין", "תגיד לי משפט",
              "הבנתי חצי", "אפשר לאט יותר?", "כן הבנתי", "תודה"]),
    _session("quiz-wrong-a1", "quiz", "A1", "חידון — תלמיד يجاوب غلط",
             "כשالإجابة غلط يصحّح بلطف ثم سؤال جديد",
             ["שלום", "מוכן לחידון", "תשאל", "אני חושב מים",
              "לא יודע", "נסיון: בית", "עוד שאלה", "תודה"]),
    _session("quiz-a2-b", "quiz", "A2", "חידון — A2",
             "أسئلة A2 مع تصحيح قصير",
             ["היי", "מוכן", "שאלה ראשונה", "התשובה ארוחה",
              "כן", "אולי לא", "עוד אחת", "תודה רבה"]),
    _session("quiz-b2", "quiz", "B2", "חידون — B2",
             "أسئلة B2 (حياة عامة/عمل)",
             ["שלום", "מוכן לחידון מתקדם", "תשאל אותי",
              "אני חושב שזה כלכלה", "כן בטוח", "שאלה הבאה", "תודה"]),
    _session("culture-food-a1", "culture", "A1", "טיפ ثقافي — أكل A1",
             "نصيحة ثقافية بسيطة عن الأكل ثم سؤال خفيف",
             ["שלום", "כן רוצה לשמוע", "מעניין", "אצלנו אוכלים אחרת",
              "מה עוד?", "תודה", "ביי"]),
    _session("culture-holiday-b1", "culture", "B1", "טיپ ثقافي — أعياد B1",
             "نصيحة أغنى عن عادة/عيد ثم محادثة B1",
             ["שלום", "ספר לי על חג", "זה דומה אצלנו",
              "מה אוכלים בחג?", "מעניין מאוד", "תודה על המידע", "נתראה"]),
    _session("culture-work-b2", "culture", "B2", "טيپ ثقافي — عمل B2",
             "نصيحة عن ثقافة العمل ثم نقاش B2",
             ["שלום", "אשמח לטיפ על עבודה", "זה שונה אצלנו",
              "מה לגבי פגישות?", "תודה רבה", "נתראה"]),
]


def _post(session_id, scenario, level, message):
    headers = {
        "X-Internal-Service-Secret": SECRET,
        "X-User-ID": session_id,
        "Content-Type": "application/json",
    }
    body = {
        "message": message,
        "level": level,
        "scenario": scenario,
        "sessionId": session_id,
        "includeArabic": False,
    }
    r = requests.post(BASE, headers=headers, json=body, timeout=60)
    return r.json()


def main():
    lines = [
        "# 20 محادثة سيناريو حية — batch 2 (مواقف مختلفة تماماً)\n",
        f"_running · {datetime.now():%Y-%m-%d %H:%M}_\n",
        "كل جلسة موقف جديد. لكل تور: 🧑‍🎓 رسالتي · 🤖 رد الذكاء.\n\n---\n",
    ]
    consecutive_quota = 0
    ok_turns = 0
    fb_turns = 0

    for s in SESSIONS:
        lines.append(f"## {s['session_id']} — {s['situation']}")
        lines.append(f"- **scenario**: `{s['scenario']}` · **level**: {s['level']}")
        lines.append(f"- **🎯 المتوقع**: {s['expected']}\n")

        for i, msg in enumerate(s["turns"], 1):
            try:
                data = _post(s["session_id"], s["scenario"], s["level"], msg)
            except Exception as exc:  # noqa: BLE001
                lines.append(f"**تور {i}** — 🧑‍🎓 {msg}\n  - ⚠️ {exc}\n")
                break

            answer = data.get("answerHe") or ""
            fb = data.get("fallbackUsed")
            reason = data.get("fallbackReason")
            cache = data.get("cacheHit")

            lines.append(f"**تور {i}** — 🧑‍🎓 `{msg}`")
            lines.append(f"  - 🤖 {answer}")
            meta = f"fallback={fb}"
            if reason:
                meta += f" · reason={reason}"
            meta += f" · cacheHit={cache}"
            lines.append(f"  - <sub>{meta}</sub>\n")

            if reason == "PROVIDER_QUOTA":
                fb_turns += 1
                consecutive_quota += 1
                if consecutive_quota >= MAX_CONSECUTIVE_QUOTA:
                    lines.append(
                        "\n> ⛔ توقّف: حصة Gemini مستهلكة. باقي الجلسات أُلغيت.\n"
                    )
                    _write(lines)
                    print("ABORTED: quota exhausted")
                    return
            else:
                consecutive_quota = 0
                ok_turns += 1 if not fb else 0
                fb_turns += 1 if fb else 0

            time.sleep(PACE_SECONDS)

        lines.append("---\n")
        _write(lines)

    lines.append(f"\n## ملخص\n- ناجحة: {ok_turns} · fallback: {fb_turns}\n")
    _write(lines)
    print(f"DONE: ok={ok_turns} fallback={fb_turns}")


def _write(lines):
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    main()
