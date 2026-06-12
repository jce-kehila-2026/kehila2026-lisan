"""Probe which PATH handles each turn of the user's supermarket chat (no scenario)."""
from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

from unittest.mock import patch  # noqa: E402
from services import chat_engine  # noqa: E402
from services.chat_schemas import ChatRequest  # noqa: E402

MSGS = ["יאללה שיחה בסופר", "אבטיח", "אני רוצה לקנות חלב", "מסטיק"]

llm_used = {"n": 0}


def _spy(*a, **k):
    llm_used["n"] += 1
    raise Exception("LLM-REACHED")  # mark that it tried the model


with patch.object(chat_engine, "call_provider", side_effect=_spy):
    for m in MSGS:
        llm_used["n"] = 0
        r = chat_engine.generate_chat_response(
            ChatRequest(message=m, level="A1", sessionId="probe-super")
        )
        path = "LLM" if llm_used["n"] else (
            "cache" if r.cacheHit else (
                "router/local" if r.routerHit else (
                    "fallback:" + str(r.fallbackReason) if r.fallbackUsed else "local"
                )
            )
        )
        print(f"[{path:12}] {m}  ->  {r.answerHe}")
