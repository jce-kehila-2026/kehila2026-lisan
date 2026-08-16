import json
import os
import urllib.request

url = "http://localhost:8000/api/ai/chat"
secret = os.environ.get("AI_SERVICE_INTERNAL_SECRET", "dev-ai-secret-key-1234567890")

payload = json.dumps({
    "message": "מה ההבדל בין תפוח לתפוז?",
    "level": "A1",
}).encode("utf-8")

req = urllib.request.Request(
    url,
    data=payload,
    method="POST",
    headers={
        "Content-Type": "application/json",
        "X-Internal-Service-Secret": secret,
    },
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
        print("STATUS:", resp.status)
        print(json.dumps(json.loads(body), ensure_ascii=False, indent=2))
except urllib.error.HTTPError as e:
    print("HTTP ERROR:", e.code)
    print(e.read().decode("utf-8", errors="replace"))
except Exception as e:
    print("REQUEST FAILED:", repr(e))