"""
vocab_tracker.py

Analyses transcribed Hebrew text against the approved A1 vocabulary,
then fires an HTTP POST to the backend to update the student's word
mastery record.

Design:
  - Called fire-and-forget from the voice endpoint (no await, no blocking)
  - Falls back silently on any network / config error
  - Uses the same AI_SERVICE_INTERNAL_SECRET header the backend expects
  - Backend URL read from BACKEND_URL env var (default http://localhost:3000)
"""
from __future__ import annotations

import logging
import os
import threading
import time

import httpx

from services.chat_guardrails import hebrew_words, normalize_hebrew_token
from services.chat_cache import get_level_bundle

logger = logging.getLogger("lisan.vocab_tracker")

_BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000")
_VOCAB_PATH = os.getenv("VOCAB_TRACK_PATH", "/api/vocab/progress")
_VOCAB_ENDPOINT = f"{_BACKEND_URL}{_VOCAB_PATH}"
_REQUEST_TIMEOUT = 5.0   # seconds — fire-and-forget, short timeout

# Track in-flight tracker threads so we can join them on shutdown.
# Without this, daemon threads get killed mid-POST during rolling deploys
# and the student's vocab progress is silently lost.
_INFLIGHT_LOCK = threading.Lock()
_INFLIGHT_THREADS: list[threading.Thread] = []


def wait_for_inflight(timeout: float = 5.0) -> int:
    """
    Block until all in-flight tracker threads finish (or timeout).
    Call from app shutdown hook.
    Returns the number of threads that did NOT finish in time.
    """
    with _INFLIGHT_LOCK:
        threads = list(_INFLIGHT_THREADS)
    deadline = time.monotonic() + timeout
    not_done = 0
    for t in threads:
        remaining = max(0.0, deadline - time.monotonic())
        t.join(timeout=remaining)
        if t.is_alive():
            not_done += 1
    return not_done


def _get_internal_secret() -> str:
    return os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()


def extract_known_words(
    transcribed_text: str,
    level: str,
) -> list[dict[str, object]]:
    """
    Compare words in transcribed_text against the approved vocabulary for
    the given level.

    Returns a list of dicts:  [{word: str, correct: bool}]
      correct=True  — word is in the approved vocabulary for this level
      correct=False — word was spoken but is not in the approved list
    """
    bundle = get_level_bundle(level)
    approved: frozenset[str] = bundle.vocab_set

    seen_words: list[dict[str, object]] = []
    seen_normalized: set[str] = set()

    for raw_token in hebrew_words(transcribed_text):
        normalized = normalize_hebrew_token(raw_token)
        if not normalized or normalized in seen_normalized:
            continue
        seen_normalized.add(normalized)
        seen_words.append({
            "word": normalized,
            "correct": normalized in approved,
        })

    return seen_words


def _post_to_backend(user_id: str, words: list[dict], level: str) -> None:
    """Blocking HTTP POST — run in a daemon thread."""
    secret = _get_internal_secret()
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Internal-Service-Secret"] = secret

    payload = {
        "userId": user_id,
        "words": words,
        "level": level,
    }

    try:
        with httpx.Client(timeout=_REQUEST_TIMEOUT) as client:
            resp = client.post(_VOCAB_ENDPOINT, json=payload, headers=headers)
        if resp.status_code not in (200, 201):
            logger.warning({
                "event": "vocab_tracker_non_200",
                "status": resp.status_code,
                "body": resp.text[:200],
            })
    except Exception as exc:
        # Was logger.debug — silently dropped real failures.
        # Vocab tracking outages need to be observable in production.
        logger.warning({
            "event": "vocab_tracker_error",
            "endpoint": _VOCAB_ENDPOINT,
            "user_id": user_id,
            "word_count": len(words),
            "detail": str(exc),
        })


def track_vocab_async(
    transcribed_text: str,
    user_id: str | None,
    level: str,
) -> None:
    """
    Fire-and-forget: extract words and POST to backend in a daemon thread.
    Returns immediately — never blocks the voice response path.
    Silently skips if user_id is absent or text is empty.
    """
    uid = (user_id or "").strip()
    text = (transcribed_text or "").strip()
    if not uid or not text:
        return

    words = extract_known_words(text, level)
    if not words:
        return

    def _runner():
        try:
            _post_to_backend(uid, words, level)
        finally:
            with _INFLIGHT_LOCK:
                try:
                    _INFLIGHT_THREADS.remove(threading.current_thread())
                except ValueError:
                    pass

    thread = threading.Thread(target=_runner, daemon=True)
    with _INFLIGHT_LOCK:
        # Cap the in-flight list so it can't grow unbounded under load.
        _INFLIGHT_THREADS.append(thread)
        if len(_INFLIGHT_THREADS) > 200:
            _INFLIGHT_THREADS.pop(0)
    thread.start()
