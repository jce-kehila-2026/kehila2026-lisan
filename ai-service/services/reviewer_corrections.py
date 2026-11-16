"""
reviewer_corrections.py — human-reviewer corrections for the tutor prompt.

Volunteer reviewers flag wrong AI replies; the owner approves a short rule in
the admin queue; the backend stores it in Firestore (`aiCorrections`). The
ai-service never talks to Firestore — it reads the active rules for a level
from the backend's internal endpoint:

    GET {BACKEND_URL}/api/internal/ai-corrections?level=A1
    X-Internal-Service-Secret: <AI_SERVICE_INTERNAL_SECRET>

Rules are cached per level (TTL, default 5 min). Fetching must never block or
break a chat: short timeout, stale-while-revalidate in a background thread,
and on any failure we keep the last known rules (or none).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from services.chat_guardrails import normalize_level

logger = logging.getLogger("lisan.reviewer_corrections")

MAX_RULES = 12
MAX_RULE_CHARS = 300
MAX_BLOCK_CHARS = 1500
DEFAULT_TTL_SECONDS = 300.0
DEFAULT_TIMEOUT_SECONDS = 1.0
# After a failed fetch, wait this long before trying the backend again so a
# dead backend does not add the timeout to every chat turn.
FAILURE_RETRY_SECONDS = 60.0

BLOCK_HEADER = "Corrections from human reviewers — follow these (most recent first):"


@dataclass
class _Entry:
    rules: list[str]
    expires_at: float


_cache: dict[str, _Entry] = {}
_refreshing: set[str] = set()
_lock = threading.Lock()


def _backend_base_url() -> str:
    return (
        os.getenv("BACKEND_URL", "")
        or os.getenv("RAG_BACKEND_URL", "")
    ).strip().rstrip("/")


def _float_env(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, "").strip())
    except ValueError:
        return default
    return value if value > 0 else default


def _ttl_seconds() -> float:
    return _float_env("AI_CORRECTIONS_TTL_SECONDS", DEFAULT_TTL_SECONDS)


def _timeout_seconds() -> float:
    return _float_env("AI_CORRECTIONS_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)


def _clean_rule(value: object) -> str:
    if not isinstance(value, str):
        return ""
    text = " ".join(value.split())
    if len(text) > MAX_RULE_CHARS:
        text = text[: MAX_RULE_CHARS - 1].rstrip() + "…"
    return text


def _fetch_from_backend(level: str) -> list[str]:
    base_url = _backend_base_url()
    url = f"{base_url}/api/internal/ai-corrections?level={urllib.parse.quote(level, safe='')}"
    headers = {"Accept": "application/json", "User-Agent": "lisan-ai-corrections/1.0"}
    secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()
    if secret:
        headers["X-Internal-Service-Secret"] = secret
    request = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
        status = getattr(response, "status", 200)
        if status < 200 or status >= 300:
            raise RuntimeError(f"backend status {status}")
        payload = json.loads(response.read().decode("utf-8"))

    records = payload.get("corrections") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise RuntimeError("invalid corrections payload")
    rules: list[str] = []
    for record in records:
        text = _clean_rule(record.get("ruleText") if isinstance(record, dict) else record)
        if text and text not in rules:
            rules.append(text)
    return rules[:MAX_RULES]


def _refresh(level: str, previous: list[str]) -> list[str]:
    try:
        rules = _fetch_from_backend(level)
        expires_at = time.monotonic() + _ttl_seconds()
    except Exception as exc:  # never let this reach a chat turn
        logger.warning({"event": "ai_corrections_fetch_failed", "level": level, "error": str(exc)})
        rules = previous
        expires_at = time.monotonic() + min(FAILURE_RETRY_SECONDS, _ttl_seconds())
    with _lock:
        _cache[level] = _Entry(rules=list(rules), expires_at=expires_at)
        _refreshing.discard(level)
    return list(rules)


def get_active_corrections(level: str | None, background: bool = True) -> list[str]:
    """Return active reviewer rules for a level, newest first. Never raises."""
    try:
        if not _backend_base_url():
            return []
        normalized = normalize_level(level)
        now = time.monotonic()
        with _lock:
            entry = _cache.get(normalized)
            if entry is not None and entry.expires_at > now:
                return list(entry.rules)
            if entry is not None and background:
                # Stale: serve last known rules, refresh off the request path.
                if normalized not in _refreshing:
                    _refreshing.add(normalized)
                    threading.Thread(
                        target=_refresh,
                        args=(normalized, list(entry.rules)),
                        daemon=True,
                    ).start()
                return list(entry.rules)
            previous = list(entry.rules) if entry is not None else []
        # First request for this level: short synchronous fetch.
        return _refresh(normalized, previous)
    except Exception as exc:
        logger.warning({"event": "ai_corrections_unavailable", "error": str(exc)})
        return []


def build_corrections_block(rules: list[str]) -> str:
    """Bounded prompt section; empty string when there are no rules."""
    if not rules:
        return ""
    lines: list[str] = []
    total = 0
    for rule in rules[:MAX_RULES]:
        text = _clean_rule(rule)
        if not text:
            continue
        line = f"- {text}"
        if total + len(line) > MAX_BLOCK_CHARS:
            break
        lines.append(line)
        total += len(line) + 1
    if not lines:
        return ""
    return BLOCK_HEADER + "\n" + "\n".join(lines)


def corrections_version(rules: list[str]) -> str:
    """Short stable hash of the rule set (empty when there are none)."""
    if not rules:
        return ""
    digest = hashlib.sha1("\n".join(rules).encode("utf-8"), usedforsecurity=False)
    return digest.hexdigest()[:10]


def clear_corrections_cache() -> None:
    with _lock:
        _cache.clear()
        _refreshing.clear()


def _expire_cache_for_tests(level: str) -> None:
    with _lock:
        entry = _cache.get(normalize_level(level))
        if entry is not None:
            entry.expires_at = 0.0
