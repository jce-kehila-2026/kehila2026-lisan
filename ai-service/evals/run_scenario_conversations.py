"""
run_scenario_conversations.py

Drives 20 multi-turn conversations against the LIVE local ai-service, one per
session, each playing a learner in a real-life situation (cafe, shop, clinic,
office, plus the word/letter/listening/quiz/culture activities). Records every
turn — what the "student" said, what the tutor replied, and what we expected —
to evals/scenario_conversations.md for review.

Run while the server is up:  python evals/run_scenario_conversations.py
"""
from __future__ import annotations

import time
from datetime import datetime

import requests

BASE = "http://localhost:8000/api/ai/chat"
SECRET = "lisan-dev-secret-2026"
OUT = "evals/scenario_conversations.md"

# Pace between LLM turns to respect Gemini free-tier RPM.
PACE_SECONDS = 6.5
# Abort the whole run if the model quota dies (avoid logging 100s of fallbacks).
MAX_CONSECUTIVE_QUOTA = 6


def _session(session_id, scenario, level, situation, expected, turns):
    return {
        "session_id": session_id,
        "scenario": scenario,
        "level": level,
        "situation": situation,   # human description of the real-life place
        "expected": expected,     # what we expect the tutor to do overall
        "turns": turns,           # learner messages (Hebrew), in order
    }


# 20 sessions. Each learner script is believable for the situation, includes a
# small mistake or two (to see correction) and usually ONE off-topic drift (to
# test that the tutor re-anchors instead of closing the scene).
SESSIONS = [
    _session("cafe-1", "speaking", "A1", "בית קפה — הזמנת קפה",
             "המלצר מוביל: שואל מה להזמין, מגיב להזמנה, שואל שאלה אחת בכל תור",
             ["שלום", "אני רוצה קפה", "כמה זה עולה?", "תודה רבה",
              "אני רוצה גם עוגה", "מה יש לכם לשתות?", "מים בבקשה", "ביי"]),
    _session("cafe-2", "speaking", "A1", "בית קפה — דריפט מחוץ לנושא",
             "כשהתלמיד שואל על משהו לא קשור (בורסה) המלצר מחזיר אותו לסצנה, לא דוחה",
             ["שלום", "בוקר טוב", "אני רוצה תה", "איך הבורסה היום?",
              "אוקיי, גם לחם", "כמה הכל?", "תודה"]),
    _session("shop-1", "speaking", "A2", "חנות מכולת — קניות",
             "המוכר עוזר, שואל כמה, מציע מוצרים, מתקן בעדינות",
             ["שלום", "אני מחפש לחם", "כמה לחם יש?", "אני רוצה גם חלב",
              "איפה הסוכר?", "כמה הכל עולה?", "אני משלם עכשיו", "להתראות"]),
    _session("shop-2", "speaking", "A2", "חנות — חיפוש מוצר ומחיר",
             "המוכר מוביל שיחת קנייה פשוטה ושומר על העברית",
             ["היי", "יש לכם מים?", "אני רוצה שניים", "כמה זה?",
              "יש הנחה?", "מתי אתם סוגרים?", "תודה רבה"]),
    _session("clinic-1", "speaking", "B1", "מרפאה — קביעת תור",
             "פקיד הקבלה מנהל קביעת תור: שואל פרטים, מציע זמן",
             ["שלום", "אני רוצה לקבוע תור לרופא", "אני חולה",
              "יש תור היום?", "באיזו שעה?", "כמה זמן זה ייקח?",
              "תודה על העזרה", "להתראות"]),
    _session("clinic-2", "speaking", "B1", "מרפאה — תיאור תחושה לא טובה",
             "הפקיד מגיב לתלונה, מכוון לרופא, נשאר בתפקיד",
             ["בוקר טוב", "כואב לי הראש", "אני צריך תרופה",
              "איפה בית המרקחת?", "מתי הרופא מגיע?", "תודה"]),
    _session("office-1", "speaking", "B2", "משרד — היכרות עם עמית",
             "העמית מנהל שיחת היכרות במקום עבודה, ברמה B2",
             ["שלום, נעים מאוד", "אני עובד חדש כאן", "מה אתה עושה בעבודה?",
              "יש לי פגישה היום", "איפה המשרד של המנהל?",
              "אפשר לשאול שאלה על הפרויקט?", "תודה רבה", "נתראה"]),
    _session("office-2", "speaking", "B2", "משרד — דיון על משימה",
             "העמית מדבר על משימה/פגישה ושומר על רמה גבוהה",
             ["היי", "יש לנו פגישה מחר", "על מה נדבר בפגישה?",
              "אני צריך לכתוב מכתב", "מתי לשלוח אותו?", "תודה על העזרה"]),
    _session("word-a1", "daily-word", "A1", "מילת היום — A1",
             "בוחר מילה אחת, מלמד אותה, מבקש משפט, נשאר על אותה מילה",
             ["שלום", "כן, מוכן", "מה המילה?", "אני לא יודע מה זה",
              "בית זה מקום", "אני גר בבית", "עוד מילה בבקשה", "תודה"]),
    _session("word-a2", "daily-word", "A2", "מילת היום — A2",
             "מילה ברמת A2, הסבר פשוט, תרגול במשפט",
             ["היי", "מוכן ללמוד", "תן לי מילה", "מה הפירוש?",
              "אפשר דוגמה?", "הבנתי", "עוד אחת", "תודה רבה"]),
    _session("letters-1", "letters", "A1", "אותיות — A1",
             "מתרגל אות אחת: צליל ומילה לדוגמה, מבקש לחזור",
             ["שלום", "כן", "איזו אות?", "אות א",
              "אבא מתחיל באות א", "עוד אות", "אות ב", "תודה"]),
    _session("letters-2", "letters", "A1", "אותיות — דריפט קצר",
             "כשהתלמיד שואל שאלה לא קשורה, חוזר לתרגול האותיות",
             ["היי", "אני רוצה ללמוד אותיות", "מה האות הראשונה?",
              "מה אתה אוכל בצהריים?", "אוקיי, אות ש", "שלום מתחיל בש",
              "תודה"]),
    _session("listen-1", "listening", "A1", "האזנה — A1",
             "אומר משפט קצר ומבקש מהתלמיד להבין/לענות",
             ["שלום", "מוכן", "תגיד משפט", "אני חושב שהבנתי",
              "אתה אומר שלום", "עוד משפט", "כן הבנתי", "תודה"]),
    _session("listen-2", "listening", "A2", "האזנה — A2",
             "משפטים מעט ארוכים יותר ברמת A2, בדיקת הבנה",
             ["היי", "מוכן להאזין", "תגיד לי משפט", "לא הבנתי, אפשר שוב?",
              "עכשיו הבנתי", "עוד אחד", "תודה רבה"]),
    _session("quiz-a1", "quiz", "A1", "חידון — A1",
             "שואל שאלה אחת בכל פעם, מתקן/משבח, ממשיך לשאלה הבאה",
             ["שלום", "מוכן לחידון", "תשאל אותי", "התשובה היא בית",
              "אני לא בטוח", "כן שלום", "עוד שאלה", "תודה"]),
    _session("quiz-a2", "quiz", "A2", "חידון — A2",
             "חידון ברמת A2 עם משוב קצר",
             ["היי", "מוכן", "שאלה ראשונה בבקשה", "אני חושב שזה מים",
              "כן", "לא יודע את זאת", "עוד אחת", "תודה רבה"]),
    _session("quiz-b1", "quiz", "B1", "חידון — B1",
             "חידון ברמת B1, נושאי שירות/בריאות",
             ["שלום", "מוכן לחידון", "תשאל", "התשובה היא רופא",
              "אני חושב שכן", "שאלה הבאה", "תודה"]),
    _session("culture-a1", "culture", "A1", "טיפ תרבותי — A1",
             "נותן טיפ תרבותי קצר ואז שאלה קלה לשיחה",
             ["שלום", "כן, רוצה לשמוע", "מעניין", "מה עוד?",
              "אני אוהב את זה", "תודה", "ביי"]),
    _session("culture-a2", "culture", "A2", "טיפ תרבותי — A2",
             "טיפ על חיי יום-יום ושיחה קצרה",
             ["היי", "ספר לי טיפ", "באמת?", "אצלנו זה שונה",
              "מעניין מאוד", "תודה רבה", "להתראות"]),
    _session("culture-b1", "culture", "B1", "טיפ תרבותי — B1",
             "טיפ עשיר יותר ושיחה ברמת B1",
             ["שלום", "אשמח לשמוע טיפ", "זה דומה אצלנו",
              "מה לגבי אוכל?", "תודה על המידע", "נתראה"]),
    _session("cafe-mistake", "speaking", "A1", "בית קפה — תלמיד עם טעויות",
             "התלמיד טועה (אני רוצה לשתות קפה שחור הרבה) והמלצר מתקן בעדינות וממשיך",
             ["שלום", "אני רוצה שותה קפה", "קפה שחור",
              "כמה כסף?", "אני נותן עשר שקל", "תודה רבא", "ביי"]),
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
    lines = []
    lines.append("# 20 محادثة سيناريو حية — transcript\n")
    lines.append(f"_running model: gemini-2.5-flash · {datetime.now():%Y-%m-%d %H:%M}_\n")
    lines.append(
        "كل جلسة = موقف واقعي. لكل تور: 🧑‍🎓 رسالتي (طالب) · 🤖 رد الذكاء · "
        "🎯 اللي كنت متوقعه.\n\n---\n"
    )

    consecutive_quota = 0
    ok_turns = 0
    fb_turns = 0

    for s in SESSIONS:
        lines.append(f"## {s['session_id']} — {s['situation']}")
        lines.append(f"- **scenario**: `{s['scenario']}` · **level**: {s['level']}")
        lines.append(f"- **🎯 المتوقع عموماً**: {s['expected']}\n")

        for i, msg in enumerate(s["turns"], 1):
            try:
                data = _post(s["session_id"], s["scenario"], s["level"], msg)
            except Exception as exc:  # noqa: BLE001
                lines.append(f"**تور {i}** — 🧑‍🎓 {msg}")
                lines.append(f"  - ⚠️ request error: {exc}\n")
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
                        "\n> ⛔ توقّف: حصة Gemini انستهلكت "
                        "(عدة أخطاء quota متتالية). باقي الجلسات أُلغيت.\n"
                    )
                    _write(lines)
                    print("ABORTED: quota exhausted")
                    return
            else:
                consecutive_quota = 0
                if fb:
                    fb_turns += 1
                else:
                    ok_turns += 1

            time.sleep(PACE_SECONDS)

        lines.append("---\n")
        _write(lines)  # incremental save so partial progress is never lost

    lines.append(f"\n## ملخص\n- تورات ناجحة (LLM): {ok_turns}\n- تورات fallback: {fb_turns}\n")
    _write(lines)
    print(f"DONE: ok={ok_turns} fallback={fb_turns}")


def _write(lines):
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    main()
