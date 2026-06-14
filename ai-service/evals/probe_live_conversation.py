"""Live multi-turn conversation through the real provider chain (default mode).

Checks the 4 fixes: feminine address, staying in the role/scene the learner set,
embodying the character, and explaining mistakes.
"""
from __future__ import annotations

import re
from dotenv import load_dotenv
load_dotenv()

from services.chat_engine import generate_chat_response  # noqa: E402
from services.chat_schemas import ChatRequest  # noqa: E402

TURNS = [
    "שלום",
    "את הרופאה ואני המטופלת",
    "כואב לי היד",
    "נפלתי על היד",
    "כן נפלתי אתמול",
    "מה את ממליצה",
]

SID = "live-doctor-demo"
masculine_hits = []
for i, msg in enumerate(TURNS, 1):
    r = generate_chat_response(
        ChatRequest(message=msg, level="A1", sessionId=SID, userId=SID)
    )
    ans = r.answerHe or f"[{r.fallbackReason}]"
    # crude masculine-address detector
    if re.search(r"(^|\s)אתה(\s|$)|את צריך(\s|$)|אתה ", ans):
        masculine_hits.append((i, ans))
    print(f"[{i}] 🧑‍🎓 {msg}")
    print(f"    🤖 {ans}")

print("\n--- gender check ---")
print("masculine-address hits:", masculine_hits or "NONE (good)")
