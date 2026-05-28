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
from typing import Sequence

import httpx

from services.chat_guardrails import hebrew_words, normalize_hebrew_token
from services.chat_cache import get_level_bundle

logger = logging.getLogger("lisan.vocab_tracker")

_BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000")
_VOCAB_ENDPOINT = f"{_BACKEND_URL}/api/vocab/progress"
_REQUEST_TIMEOUT = 5.0   # seconds — fire-and-forget, short timeout


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
        logger.debug({"event": "vocab_tracker_error", "detail": str(exc)})


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

    thread = threading.Thread(
        target=_post_to_backend,
        args=(uid, words, level),
        daemon=True,
    )
    thread.start()
