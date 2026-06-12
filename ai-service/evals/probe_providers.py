"""Quick live probe of every configured LLM provider in the failover chain."""
from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()

from services.chat_provider import (  # noqa: E402
    _call_cloudflare_workers_ai,
    _call_gemini,
    _call_groq,
    _build_fallback_chain,
)

SYS = "You are a Hebrew tutor. Reply in ONE short Hebrew sentence only."
Q = "תגיד שלום בעברית"

print("Configured fallback chain:",
      [c.name for c in _build_fallback_chain()])
print("-" * 60)

probes = [
    ("gemini", _call_gemini, "gemini-2.5-flash-lite"),
    ("groq", _call_groq, os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")),
    ("cloudflare", _call_cloudflare_workers_ai,
     os.getenv("CLOUDFLARE_AI_MODEL", "@cf/meta/llama-4-scout-17b-16e-instruct")),
]

for name, fn, model in probes:
    try:
        r = fn(model, SYS, Q, 12.0)
        ans = (r.answer or "").strip().replace("\n", " ")
        print(f"{name:11} OK  in={r.input_tokens} out={r.output_tokens}  {ans[:60]}")
    except Exception as e:  # noqa: BLE001
        print(f"{name:11} ERR {type(e).__name__}: {str(e)[:90]}")
