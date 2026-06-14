"""Live probe: home-page story topics now embody a role-play character."""
from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

from services.chat_engine import generate_chat_response  # noqa: E402
from services.scenario_engine import is_scenario, scenario_opening  # noqa: E402
from services.chat_schemas import ChatRequest  # noqa: E402

for sid in ["doctor-appointment", "at-restaurant", "job-interview"]:
    print(f"\n===== {sid}  (is_scenario={is_scenario(sid)}) =====")
    he, _ = scenario_opening(sid, "A1", False)
    print(f"opening: {he}")
    turns = ["שלום", "כואב לי הראש", "נפלתי אתמול"] if sid == "doctor-appointment" \
        else (["שלום", "אני רוצה סלט", "כמה זה עולה"] if sid == "at-restaurant"
              else ["שלום", "יש לי ניסיון בהוראה", "מתי אתם פותחים"])
    sess = f"story-{sid}"
    for t in turns:
        r = generate_chat_response(
            ChatRequest(message=t, level="A1", scenario=sid,
                        sessionId=sess, userId=sess)
        )
        print(f"  🧑‍🎓 {t}\n  🤖 {r.answerHe or '['+str(r.fallbackReason)+']'}")
