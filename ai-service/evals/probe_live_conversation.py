"""Live multi-turn conversation through the real provider chain (default mode)."""
from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

from services.chat_engine import generate_chat_response  # noqa: E402
from services.chat_schemas import ChatRequest  # noqa: E402

TURNS = [
    "יאללה שיחה בסופר",
    "אבטיח",
    "אני רוצה לקנות חלב",
    "מסטיק",
    "כמה הכל עולה?",
]

SID = "live-super-demo"
for i, msg in enumerate(TURNS, 1):
    r = generate_chat_response(
        ChatRequest(message=msg, level="A1", sessionId=SID, userId=SID)
    )
    src = "LLM" if (r.provider and not r.routerHit and not r.cacheHit
                    and not r.fallbackUsed) else (
        "fallback:" + str(r.fallbackReason) if r.fallbackUsed else
        ("cache" if r.cacheHit else "local/router"))
    print(f"[{i}] 🧑‍🎓 {msg}")
    print(f"    🤖 {r.answerHe}   <{src}>")
