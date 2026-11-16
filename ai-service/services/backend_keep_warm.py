"""Keep the backend (Firebase Cloud Function) warm at zero extra cost.

The backend scales to zero when idle; the next student then waits for a cold
start (seen locally: first voice reply 16.8s vs ~5.5s warm). The ai-service on
Render is always on anyway, so it pings the backend every few minutes. This
stays inside Firebase's free invocation quota (~360 calls/day of 2M/month)
and the Firestore free read quota (one `_health` read per ping via /api/ready).

Env:
  KEEP_WARM_BACKEND           "true"/"false" (default: true when ENV_MODE=production)
  KEEP_WARM_INTERVAL_SECONDS  default 240
  KEEP_WARM_PATH              default /api/ready (also keeps the DB connection warm)
"""
from __future__ import annotations

import logging
import os
import threading
import time
import urllib.request

logger = logging.getLogger("lisan.keep_warm")

_thread: threading.Thread | None = None
_stop = threading.Event()


def _enabled() -> bool:
    raw = os.getenv("KEEP_WARM_BACKEND", "").strip().lower()
    if raw:
        return raw in {"1", "true", "yes", "on"}
    return os.getenv("ENV_MODE", "").strip().lower() == "production"


def _base_url() -> str:
    url = (os.getenv("BACKEND_URL", "") or os.getenv("RAG_BACKEND_URL", "")).strip().rstrip("/")
    if url and "://" not in url:
        url = f"http://{url}"
    return url


def _interval() -> float:
    try:
        return max(60.0, float(os.getenv("KEEP_WARM_INTERVAL_SECONDS", "240")))
    except ValueError:
        return 240.0


def ping_once(timeout: float = 15.0) -> bool:
    """One keep-warm request. Never raises."""
    base = _base_url()
    if not base:
        return False
    path = os.getenv("KEEP_WARM_PATH", "/api/ready").strip() or "/api/ready"
    started = time.perf_counter()
    try:
        req = urllib.request.Request(f"{base}{path}", headers={"User-Agent": "lisan-keep-warm"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (own backend)
            ok = 200 <= resp.status < 500
        latency_ms = int((time.perf_counter() - started) * 1000)
        logger.info({"event": "backend_keep_warm", "ok": ok, "latency_ms": latency_ms})
        return ok
    except Exception as exc:  # network/HTTP errors must never crash the loop
        logger.warning({"event": "backend_keep_warm_failed", "error": str(exc)[:200]})
        return False


def _loop() -> None:
    while not _stop.wait(_interval()):
        ping_once()


def start() -> bool:
    """Start the background pinger once. Returns True if started."""
    global _thread
    if not _enabled() or not _base_url():
        return False
    if _thread is not None and _thread.is_alive():
        return False
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="backend-keep-warm", daemon=True)
    _thread.start()
    logger.info({"event": "backend_keep_warm_started", "interval_s": _interval()})
    return True


def stop() -> None:
    _stop.set()
