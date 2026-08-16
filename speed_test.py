import json
import os
import time
import urllib.request

API_KEY = os.environ.get("OPENROUTER_API_KEYS", "").split(",")[0].strip()
MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite")

if not API_KEY:
    print("FAILED: OPENROUTER_API_KEYS is not set in the environment")
    raise SystemExit(1)

payload = json.dumps({
    "model": MODEL,
    "messages": [
        {"role": "user", "content": "מה ההבדל בין תפוח לתפוז? תענה במשפט אחד קצר."}
    ],
}).encode("utf-8")

req = urllib.request.Request(
    "https://openrouter.ai/api/v1/chat/completions",
    data=payload,
    method="POST",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
)

started = time.perf_counter()
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
except Exception as e:
    print("FAILED:", repr(e))
    raise SystemExit(1)
elapsed = time.perf_counter() - started

print(f"MODEL: {MODEL}")
print(f"TIME: {elapsed:.2f} seconds")
print(f"PROMPT_TOKENS: {body['usage']['prompt_tokens']}")
print(f"COMPLETION_TOKENS: {body['usage']['completion_tokens']}")
print(f"COST: ${body['usage']['cost']}")
print("ANSWER:", body["choices"][0]["message"]["content"])
