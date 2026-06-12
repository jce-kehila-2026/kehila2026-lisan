"""
canonical_cache.py

A phrasing-invariant, deterministic-only response cache for low-risk intents.

Why a second cache?
-------------------
The exact response cache (chat_cache) keys on the FULL raw message, so two
phrasings of the same question miss each other:

    "شو يعني בית؟"   and   "ما معنى בית"

both ask the meaning of בית, but hash differently and each can independently
fall through to the LLM. This cache keys on the *intent + normalized target*
instead, so every phrasing of "meaning of בית at A1" collapses to ONE key:

    meaning:בית:A1:v1

No semantic similarity, no embeddings — just deterministic normalization. That
keeps it safe: we only ever store answers for intents whose replies are
deterministic (word meaning, translation, correction) plus out-of-domain
rejections, never free-form tutor generation.

Key format
----------
    {intent}:{target}:{level}:{version}

  intent  ∈ {meaning, translate, correction, ood}
  target  — normalized Hebrew word, or normalized message for correction/ood
  level   — A1 / A2 / B1 / B2
  version — CANONICAL_CACHE_VERSION env (default "v1"); bump to invalidate all

Backed by an in-process bounded store, mirrored to Redis when configured so
the cache is shared across workers/replicas.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from dataclasses import dataclass

from services.chat_guardrails import normalize_hebrew_token
from services.chat_schemas import ChatResponse

logger = logging.getLogger("lisan.chat")

CANONICAL_CACHE_VERSION = os.getenv("CANONICAL_CACHE_VERSION", "v1").strip() or "v1"
CANONICAL_CACHE_TTL_SECONDS = int(
    os.getenv("CANONICAL_CACHE_TTL_SECONDS", "604800")  # 7 days
)
CANONICAL_CACHE_MAX_ENTRIES = int(
    os.getenv("CANONICAL_CACHE_MAX_ENTRIES", "5000")
)

# Only these intents are eligible — their answers are deterministic.
LOW_RISK_INTENTS = ("meaning", "translate", "correction", "ood")

# Map detect_intent() names → canonical intent labels. Intents NOT in this map
# (ASK_ME, EXAMPLE_REQUEST, FORMAL_DRAFT) are deliberately excluded: their
# replies vary, so caching them would serve stale or wrong content.
_INTENT_LABELS = {
    "WORD_MEANING": "meaning",
    "TRANSLATE_REQUEST": "translate",
    "CORRECTION_REQUEST": "correction",
}

_WHITESPACE_RE = re.compile(r"\s+")


@dataclass
class _Entry:
    response: ChatResponse
    expires_at: float


class CanonicalCache:
    def __init__(
        self,
        ttl_seconds: int = CANONICAL_CACHE_TTL_SECONDS,
        max_entries: int = CANONICAL_CACHE_MAX_ENTRIES,
    ) -> None:
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._lock = threading.Lock()
        self._entries: dict[str, _Entry] = {}
        self._hits = 0
        self._misses = 0

    def lookup(self, key: str) -> ChatResponse | None:
        if not key:
            return None

        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                raw = redis_client.get(f"canonical:{key}")
                if raw:
                    with self._lock:
                        self._hits += 1
                    return ChatResponse.model_validate_json(raw)
                with self._lock:
                    self._misses += 1
                return None
            except Exception as exc:
                logger.warning(f"Redis canonical lookup failed: {exc}")

        now = time.time()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self._misses += 1
                return None
            if entry.expires_at <= now:
                del self._entries[key]
                self._misses += 1
                return None
            self._hits += 1
            return entry.response.model_copy(deep=True)

    def store(
        self, key: str, response: ChatResponse, allow_fallback: bool = False
    ) -> None:
        # Never cache a TRANSIENT degraded answer (LLM timeout/quota/error) —
        # it would freeze a one-off failure into a permanent wrong reply. The
        # ONLY fallback we cache is a deterministic local rejection (OUT_OF_
        # SCOPE), which callers opt into with allow_fallback=True.
        if not key or response is None:
            return
        if response.fallbackUsed and not allow_fallback:
            return

        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                redis_client.set(
                    f"canonical:{key}", response.model_dump_json(), ex=self._ttl
                )
                return
            except Exception as exc:
                logger.warning(f"Redis canonical store failed: {exc}")

        now = time.time()
        with self._lock:
            if key not in self._entries and len(self._entries) >= self._max_entries:
                self._evict_oldest_locked()
            self._entries[key] = _Entry(
                response=response.model_copy(deep=True),
                expires_at=now + self._ttl,
            )

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "size": len(self._entries),
                "hits": self._hits,
                "misses": self._misses,
            }

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._hits = 0
            self._misses = 0

    def _evict_oldest_locked(self) -> None:
        if not self._entries:
            return
        oldest = min(self._entries, key=lambda k: self._entries[k].expires_at)
        del self._entries[oldest]


# Module-level singleton — shared across all requests in the process.
CANONICAL_CACHE = CanonicalCache()


def _normalize_message(message: str) -> str:
    """Collapse whitespace + lowercase for a stable correction/ood key."""
    return _WHITESPACE_RE.sub(" ", (message or "").strip()).lower()


def canonical_key(intent: str, target: str, level: str) -> str:
    return f"{intent}:{target}:{level}:{CANONICAL_CACHE_VERSION}"


def derive_intent_key(
    message: str,
    level: str,
    language_profile=None,
) -> str | None:
    """Build the canonical key for a low-risk gatekeeper intent, or None.

    Runs the same detect_intent() the gatekeeper uses, so the key matches the
    answer the gatekeeper would produce. Returns None for intents that are not
    deterministic (so they bypass this cache entirely).
    """
    from services.chat_intents import detect_intent

    intent = detect_intent(message, language_profile)
    if intent is None:
        return None
    label = _INTENT_LABELS.get(intent.name)
    if label is None:
        return None

    if label in ("meaning", "translate"):
        target = normalize_hebrew_token((intent.target_word or "").strip())
        if not target:
            return None
        return canonical_key(label, target, level)

    # correction has no target word — key on the normalized erroneous sentence
    # so the SAME mistake maps to the SAME fix regardless of spacing/case.
    norm = _normalize_message(message)
    if not norm:
        return None
    return canonical_key("correction", norm, level)


def derive_ood_key(message: str, level: str) -> str | None:
    """Canonical key for a deterministic local rejection.

    Rejections are now complexity-based, not topic-blacklist based. Cache them
    by the too-complex token at the current CEFR level so a B2 student is not
    polluted by an A1 rejection for the same topic.
    """
    from services.complexity_checker import canonical_complexity_target

    target = canonical_complexity_target(message, level)
    if target:
        return canonical_key("ood", target, level)
    norm = _normalize_message(message)
    if not norm:
        return None
    return canonical_key("ood", norm, level)
