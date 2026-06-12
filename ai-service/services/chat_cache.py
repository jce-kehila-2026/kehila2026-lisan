from __future__ import annotations

import threading
import time
import os
import logging
from collections import Counter, OrderedDict
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

logger = logging.getLogger("lisan.chat")


from services.chat_guardrails import is_short_hebrew_answer, normalize_hebrew_token, normalize_level
from services.chat_retrieval import (
    Chunk,
    chunk_transcripts,
    extract_vocabulary,
    get_transcript_source_status,
    is_backend_transcript_source_configured,
    load_transcripts,
)
from services.chat_schemas import ChatResponse

BASE_DIR = Path(__file__).resolve().parents[1]
TRANSCRIPTS_DIR = BASE_DIR / "data" / "transcripts"
CORE_TUTOR_VOCAB = [
    "שלום",
    "היי",
    "תודה",
    "כן",
    "לא",
    "אני",
    "אתה",
    "את",
    "הוא",
    "היא",
    "מה",
    "מי",
    "איפה",
    "זה",
    "זאת",
    "בסדר",
    "בבקשה",
    "יש",
    "אין",
    "גר",
    "גרה",
    "עובד",
    "עובדת",
    "רוצה",
    # ── Tutor politeness / encouragement / meta words ──────────────────────
    # Added so natural tutor replies ("תודה רבה", "מצוין", "גם") aren't
    # thrown away by the strict A1 vocab guard — that was nuking whole
    # answers on a single stray word and looping the canned fallback.
    "רבה", "מאוד", "גם", "יופי", "מצוין", "נכון", "נהדר", "אפשר",
    "עוד", "פעם", "מילה", "משפט", "שאלה", "תשובה", "סליחה",
    "להתראות", "בוקר", "ערב", "טוב",
    # ── Closed-class function words (universal A1) ─────────────────────────
    # Pronouns, deictics, and possessives every beginner uses from day one.
    # These belong to the language itself, not to any specific lesson, so
    # the input-side scope check must treat them as known — counting them
    # "unknown" inflated the out-of-scope ratio on legitimate A1 sentences.
    "אנחנו", "אתם", "הם", "הן",
    "כאן", "פה", "שם", "עכשיו", "היום", "מחר", "אתמול",
    "שלי", "שלך", "שלו", "שלה", "שלנו",
    "קוראים", "נעים", "צריך", "יכול",
]
DIRECT_HEBREW_WORD_RESPONSES = {
    "שלום": "שלום.",
    "היי": "שלום.",
    "תודה": "בבקשה.",
    "כן": "כן.",
    "לא": "לא.",
    "מים": "זה מים.",
    "קפה": "זה קפה.",
    "בית": "זה בית.",
    "אמא": "זאת אמא.",
    "אבא": "זה אבא.",
    "ילד": "זה ילד.",
    "ילדה": "זאת ילדה.",
    "אישה": "זאת אישה.",
    "איש": "זה איש.",
}
_CACHE_LOCK = threading.Lock()
_EXACT_CACHE_LOCK = threading.Lock()
# Bigger defaults than before (was 3600s / 256 entries). A larger, longer
# cache is the main lever for stretching the Gemini free quota across more
# users — repeated questions are served from memory instead of the LLM.
# Both are env-tunable.
DEFAULT_RESPONSE_CACHE_TTL_SECONDS = int(
    os.getenv("RESPONSE_CACHE_TTL_SECONDS", "86400")  # 24h
)
DEFAULT_RESPONSE_CACHE_MAX_ENTRIES = int(
    os.getenv("RESPONSE_CACHE_MAX_ENTRIES", "2000")
)
# Request-level limit (all paths, including the free local ones). Generous,
# because local answers cost nothing — this only stops outright flooding.
DEFAULT_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "10"))
DEFAULT_RATE_LIMIT_WINDOW_SECONDS = int(
    os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")
)
# LLM-path budget (only requests that actually reach the provider). Tighter,
# because THIS is what burns the free Gemini quota. A single identity can ask
# many questions a minute as long as cache/router/templates answer them; only
# the ones that fall through to the model are counted here.
DEFAULT_LLM_RATE_LIMIT_MAX_REQUESTS = int(
    os.getenv("LLM_RATE_LIMIT_MAX_REQUESTS", "4")
)
DEFAULT_LLM_RATE_LIMIT_WINDOW_SECONDS = int(
    os.getenv("LLM_RATE_LIMIT_WINDOW_SECONDS", "60")
)


@dataclass(frozen=True)
class CachedLevelBundle:
    level: str
    vocab: list[str]
    vocab_set: frozenset[str]
    chunks: list[Chunk]
    advanced_only_tokens: frozenset[str]
    glossary: dict[str, str]
    question_answer_map: dict[str, str]
    token_frequency: dict[str, int]


@dataclass
class CacheEntry:
    response: ChatResponse
    created_at: float
    expires_at: float
    hit_count: int = 0


class CacheManager:
    def __init__(
        self,
        default_ttl: int = DEFAULT_RESPONSE_CACHE_TTL_SECONDS,
        max_entries: int = DEFAULT_RESPONSE_CACHE_MAX_ENTRIES,
        time_func: Callable[[], float] | None = None,
    ) -> None:
        self.default_ttl = default_ttl
        self.max_entries = max_entries
        self._time_func = time_func or time.time
        self._lock = threading.Lock()
        self._entries: dict[tuple[str, str], CacheEntry] = {}
        self._hits = 0
        self._misses = 0

    def get_cached_response(self, query_hash: str, language_level: str) -> ChatResponse | None:
        normalized_level = normalize_level(language_level)
        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                cache_key = f"cache:{query_hash}:{normalized_level}"
                cached_data = redis_client.get(cache_key)
                if cached_data:
                    self._hits += 1
                    return ChatResponse.model_validate_json(cached_data)
                self._misses += 1
                return None
            except Exception as exc:
                logger.warning(f"Redis get failed: {exc}")

        with self._lock:
            self._clear_expired_entries_locked()
            cache_key = self._build_key(query_hash, normalized_level)
            entry = self._entries.get(cache_key)
            if entry is None:
                self._misses += 1
                return None

            entry.hit_count += 1
            self._hits += 1
            return entry.response.model_copy(deep=True)

    def set_cached_response(
        self,
        query_hash: str,
        language_level: str,
        response: ChatResponse,
        ttl: int = DEFAULT_RESPONSE_CACHE_TTL_SECONDS,
    ) -> None:
        normalized_level = normalize_level(language_level)
        effective_ttl = ttl or self.default_ttl

        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                cache_key = f"cache:{query_hash}:{normalized_level}"
                redis_client.set(cache_key, response.model_dump_json(), ex=effective_ttl)
                return
            except Exception as exc:
                logger.warning(f"Redis set failed: {exc}")

        now = self._time_func()
        with self._lock:
            self._clear_expired_entries_locked()
            if len(self._entries) >= self.max_entries:
                self._evict_oldest_entry_locked()

            cache_key = self._build_key(query_hash, normalized_level)
            self._entries[cache_key] = CacheEntry(
                response=response.model_copy(deep=True),
                created_at=now,
                expires_at=now + effective_ttl,
            )

    def clear_expired_entries(self) -> int:
        with self._lock:
            return self._clear_expired_entries_locked()

    def get_cache_stats(self) -> dict[str, int]:
        with self._lock:
            self._clear_expired_entries_locked()
            return {
                "hits": self._hits,
                "misses": self._misses,
                "size": len(self._entries),
            }

    def _build_key(self, query_hash: str, language_level: str) -> tuple[str, str]:
        return (query_hash, language_level)

    def _clear_expired_entries_locked(self) -> int:
        now = self._time_func()
        expired_keys = [
            cache_key
            for cache_key, entry in self._entries.items()
            if entry.expires_at <= now
        ]
        for cache_key in expired_keys:
            self._entries.pop(cache_key, None)
        return len(expired_keys)

    def _evict_oldest_entry_locked(self) -> None:
        oldest_key = min(
            self._entries,
            key=lambda cache_key: self._entries[cache_key].created_at,
        )
        self._entries.pop(oldest_key, None)


class RateLimiter:
    def __init__(
        self,
        max_requests: int = DEFAULT_RATE_LIMIT_MAX_REQUESTS,
        window_seconds: int = DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
        time_func: Callable[[], float] | None = None,
    ) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._time_func = time_func or time.time
        self._lock = threading.Lock()
        self._requests: dict[str, deque[float]] = {}

    def check_request(self, user_id: str) -> tuple[bool, int]:
        normalized_user_id = (user_id or "anonymous").strip() or "anonymous"
        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                now = self._time_func()
                cutoff = now - self.window_seconds
                key = f"ratelimit:{normalized_user_id}"
                
                pipe = redis_client.pipeline()
                pipe.zremrangebyscore(key, 0, cutoff)
                pipe.zcard(key)
                pipe.zadd(key, {str(now): now})
                pipe.expire(key, self.window_seconds)
                pipe.zrange(key, 0, 0, withscores=True)
                res = pipe.execute()
                
                req_count = res[1]
                if req_count >= self.max_requests:
                    redis_client.zrem(key, str(now))
                    oldest_ts = res[4][0][1] if (len(res) > 4 and res[4]) else now
                    retry_after = max(1, int(oldest_ts + self.window_seconds - now))
                    return False, retry_after
                return True, 0
            except Exception as exc:
                logger.warning(f"Redis rate limit check failed: {exc}")

        with self._lock:
            requests = self._get_active_requests_locked(normalized_user_id)
            if len(requests) >= self.max_requests:
                retry_after = max(1, int(requests[0] + self.window_seconds - self._time_func()))
                return False, retry_after

            requests.append(self._time_func())
            return True, 0

    def get_status(self, user_id: str) -> dict[str, int | bool | str]:
        normalized_user_id = (user_id or "anonymous").strip() or "anonymous"
        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                now = self._time_func()
                cutoff = now - self.window_seconds
                key = f"ratelimit:{normalized_user_id}"
                
                pipe = redis_client.pipeline()
                pipe.zremrangebyscore(key, 0, cutoff)
                pipe.zcard(key)
                pipe.zrange(key, 0, 0, withscores=True)
                res = pipe.execute()
                
                req_count = res[1]
                retry_after = 0
                if req_count >= self.max_requests:
                    oldest_ts = res[2][0][1] if (len(res) > 2 and res[2]) else now
                    retry_after = max(1, int(oldest_ts + self.window_seconds - now))
                remaining = max(0, self.max_requests - req_count)
                
                return {
                    "userId": normalized_user_id,
                    "maxRequests": self.max_requests,
                    "windowSeconds": self.window_seconds,
                    "requestsInWindow": req_count,
                    "remainingRequests": remaining,
                    "allowed": req_count < self.max_requests,
                    "retryAfterSeconds": retry_after,
                }
            except Exception as exc:
                logger.warning(f"Redis rate limit status failed: {exc}")

        with self._lock:
            requests = self._get_active_requests_locked(normalized_user_id)
            retry_after = 0
            if len(requests) >= self.max_requests:
                retry_after = max(1, int(requests[0] + self.window_seconds - self._time_func()))
            remaining = max(0, self.max_requests - len(requests))
            return {
                "userId": normalized_user_id,
                "maxRequests": self.max_requests,
                "windowSeconds": self.window_seconds,
                "requestsInWindow": len(requests),
                "remainingRequests": remaining,
                "allowed": len(requests) < self.max_requests,
                "retryAfterSeconds": retry_after,
            }

    def reset(self, user_id: str | None = None) -> None:
        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                if user_id is None:
                    keys = redis_client.keys("ratelimit:*")
                    if keys:
                        redis_client.delete(*keys)
                else:
                    normalized_user_id = (user_id or "anonymous").strip() or "anonymous"
                    redis_client.delete(f"ratelimit:{normalized_user_id}")
            except Exception as exc:
                logger.warning(f"Redis rate limit reset failed: {exc}")

        with self._lock:
            if user_id is None:
                self._requests.clear()
                return
            normalized_user_id = (user_id or "anonymous").strip() or "anonymous"

            self._requests.pop(normalized_user_id, None)

    def _get_active_requests_locked(self, user_id: str) -> deque[float]:
        now = self._time_func()
        cutoff = now - self.window_seconds
        requests = self._requests.setdefault(user_id, deque())
        while requests and requests[0] <= cutoff:
            requests.popleft()
        if not requests:
            self._requests[user_id] = deque()
            requests = self._requests[user_id]
        return requests


CHAT_CACHE: dict[str, CachedLevelBundle] = {}
CHAT_CACHE_LOADED_AT = 0.0
CHAT_CACHE_NEEDS_BACKEND_REFRESH = False
# Bounded LRU dict — preserves insertion order; oldest evicted when full.
EXACT_CACHE_MAX_ENTRIES = 512
EXACT_RESPONSE_CACHE: "OrderedDict[str, ChatResponse]" = OrderedDict()
RESPONSE_CACHE_MANAGER = CacheManager()
RATE_LIMITER = RateLimiter()
# Separate, tighter limiter for the LLM path only. Same sliding-window
# implementation, smaller budget. Consulted right before call_provider so
# local/cache/router answers never touch it.
LLM_RATE_LIMITER = RateLimiter(
    max_requests=DEFAULT_LLM_RATE_LIMIT_MAX_REQUESTS,
    window_seconds=DEFAULT_LLM_RATE_LIMIT_WINDOW_SECONDS,
)


def warm_startup_chat_cache(force: bool = False) -> None:
    global CHAT_CACHE_LOADED_AT, CHAT_CACHE_NEEDS_BACKEND_REFRESH

    with _CACHE_LOCK:
        if CHAT_CACHE and not force:
            return

        discovered_levels = _discover_curriculum_levels()

        raw_level_data: dict[str, tuple[list[str], list[Chunk], list]] = {}
        for level in discovered_levels:
            transcripts, _ = load_transcripts(level)
            vocabulary = extract_vocabulary(transcripts)
            chunks = chunk_transcripts(transcripts)
            raw_level_data[level] = (vocabulary, chunks, transcripts)

        next_cache: dict[str, CachedLevelBundle] = {}
        cumulative_levels = sorted(raw_level_data.keys())
        for level in cumulative_levels:
            vocabulary, chunks, transcripts = raw_level_data[level]
            higher_level_tokens = _collect_higher_level_tokens(level, raw_level_data)
            next_cache[level] = CachedLevelBundle(
                level=level,
                vocab=vocabulary,
                vocab_set=frozenset(vocabulary),
                chunks=chunks,
                advanced_only_tokens=frozenset(higher_level_tokens - set(vocabulary)),
                glossary=dict(DIRECT_HEBREW_WORD_RESPONSES),
                question_answer_map=_build_question_answer_map(transcripts, set(vocabulary)),
                token_frequency=_build_token_frequency_map(transcripts),
            )
        CHAT_CACHE.clear()
        CHAT_CACHE.update(next_cache)
        CHAT_CACHE_LOADED_AT = time.time()
        CHAT_CACHE_NEEDS_BACKEND_REFRESH = _cache_uses_local_fallback()


def get_level_bundle(level: str) -> CachedLevelBundle:
    warm_startup_chat_cache()
    _refresh_chat_cache_after_backend_startup()
    normalized_level = normalize_level(level)
    return CHAT_CACHE.get(normalized_level) or CHAT_CACHE["A1"]


def get_rag_cache_status() -> dict[str, object]:
    warm_startup_chat_cache()
    _refresh_chat_cache_after_backend_startup()
    return {
        "loaded": bool(CHAT_CACHE),
        "levels": sorted(CHAT_CACHE.keys()),
        "needsBackendRefresh": CHAT_CACHE_NEEDS_BACKEND_REFRESH,
        "transcripts": get_transcript_source_status(),
    }


def _discover_curriculum_levels() -> list[str]:
    configured_levels = [
        level.strip().upper()
        for level in os.getenv("RAG_LEVELS", "").split(",")
        if level.strip()
    ]
    if configured_levels:
        return configured_levels

    return sorted(
        path.name.upper()
        for path in TRANSCRIPTS_DIR.iterdir()
        if path.is_dir()
    )


def _rag_backend_retry_seconds() -> float:
    raw = os.getenv("RAG_BACKEND_RETRY_SECONDS", "").strip()
    try:
        value = float(raw)
    except ValueError:
        return 15.0
    return value if value > 0 else 15.0


def _cache_uses_local_fallback() -> bool:
    if not is_backend_transcript_source_configured():
        return False

    statuses = get_transcript_source_status()
    return any(
        status.get("source") != "backend"
        for level, status in statuses.items()
        if level in CHAT_CACHE
    )


def _refresh_chat_cache_after_backend_startup() -> None:
    if not CHAT_CACHE_NEEDS_BACKEND_REFRESH:
        return
    if not is_backend_transcript_source_configured():
        return
    if time.time() - CHAT_CACHE_LOADED_AT < _rag_backend_retry_seconds():
        return

    try:
        warm_startup_chat_cache(force=True)
    except Exception as exc:
        logger.warning(f"RAG backend refresh failed: {exc}")


_HASH_TO_QUERY_MAP: dict[str, str] = {}


def build_cache_key(message: str, level: str, include_arabic: bool) -> str:
    # Hash the normalized message so colons / whitespace / diacritics in the
    # input can't collide with the structural ":" separators in the key.
    import hashlib
    normalized_message = normalize_message_for_cache(message)
    msg_hash = hashlib.sha1(
        normalized_message.encode("utf-8"), usedforsecurity=False
    ).hexdigest()[:16]
    key = f"{msg_hash}:{normalize_level(level)}:{str(include_arabic).lower()}"
    _HASH_TO_QUERY_MAP[key] = message
    return key


def normalize_message_for_cache(message: str) -> str:
    # Strip Hebrew diacritics (nikud) and collapse whitespace so that
    # "שלום" and "שָׁלוֹם" and "שלום  " all map to the same cache entry.
    import re as _re
    raw = (message or "").strip().lower()
    # Hebrew points: niqqud (U+05B0..U+05BC, U+05BF, U+05C1..U+05C2, U+05C4..U+05C5, U+05C7)
    raw = _re.sub(r"[֑-ׇ]", "", raw)
    parts = [
        normalize_hebrew_token(part) or part.strip()
        for part in raw.split()
    ]
    return " ".join(part for part in parts if part)


def get_exact_cached_response(cache_key: str) -> ChatResponse | None:
    level = _extract_level_from_cache_key(cache_key)
    return RESPONSE_CACHE_MANAGER.get_cached_response(cache_key, level)


def store_exact_cached_response(cache_key: str, response: ChatResponse) -> None:
    # INVARIANT: only successful answers are cached. Fallbacks are either
    # deterministic and trivially cheap to recompute (fast-reject, OOS) or
    # transient provider state (quota, timeout, vocab leak) — caching them
    # froze a single bad classification onto a message for the full 24h TTL
    # (the live eval caught a stale OUT_OF_SCOPE served via cacheHit).
    if response.fallbackUsed:
        return
    level = _extract_level_from_cache_key(cache_key)
    RESPONSE_CACHE_MANAGER.set_cached_response(cache_key, level, response)
    with _EXACT_CACHE_LOCK:
        # LRU: move existing key to end, then evict oldest if over cap
        if cache_key in EXACT_RESPONSE_CACHE:
            EXACT_RESPONSE_CACHE.move_to_end(cache_key)
        EXACT_RESPONSE_CACHE[cache_key] = response.model_copy(deep=True)
        while len(EXACT_RESPONSE_CACHE) > EXACT_CACHE_MAX_ENTRIES:
            EXACT_RESPONSE_CACHE.popitem(last=False)
            
    # Also save to semantic cache!
    query = _HASH_TO_QUERY_MAP.get(cache_key)
    if query:
        store_semantic_cached_response(query, level, response)


def clear_expired_entries() -> int:
    cleared_count = RESPONSE_CACHE_MANAGER.clear_expired_entries()
    if cleared_count:
        with _EXACT_CACHE_LOCK:
            for cache_key in list(EXACT_RESPONSE_CACHE.keys()):
                manager_key = (
                    cache_key,
                    normalize_level(_extract_level_from_cache_key(cache_key)),
                )
                if manager_key not in RESPONSE_CACHE_MANAGER._entries:
                    EXACT_RESPONSE_CACHE.pop(cache_key, None)
    return cleared_count


def get_cache_stats() -> dict[str, int]:
    return RESPONSE_CACHE_MANAGER.get_cache_stats()


def initialize_chat_cache() -> None:
    warm_startup_chat_cache()
    clear_expired_entries()
    RATE_LIMITER.reset()


def is_startup_cache_ready() -> bool:
    return bool(CHAT_CACHE)


def check_rate_limit(user_id: str) -> tuple[bool, int]:
    return RATE_LIMITER.check_request(user_id)


def check_llm_rate_limit(identity: str) -> tuple[bool, int]:
    """Consume one unit of the tighter LLM-path budget for this identity.

    Returns (allowed, retry_after_seconds). Call ONLY when a request is about
    to reach the provider — local/cache/router answers must not count."""
    return LLM_RATE_LIMITER.check_request(identity)


def get_rate_limit_status(user_id: str) -> dict[str, int | bool | str]:
    return RATE_LIMITER.get_status(user_id)


def reset_rate_limit(user_id: str | None = None) -> None:
    RATE_LIMITER.reset(user_id)


def build_allowed_vocabulary(bundle: CachedLevelBundle, selected_chunks: list[Chunk]) -> list[str]:
    priority_tokens = list(CORE_TUTOR_VOCAB)
    allowed_tokens = set(priority_tokens)
    allowed_tokens.update(bundle.glossary.keys())

    ranked_chunk_tokens = _rank_chunk_tokens(bundle, selected_chunks)
    allowed_tokens.update(ranked_chunk_tokens)

    ordered_tokens = priority_tokens + sorted(bundle.glossary.keys()) + ranked_chunk_tokens
    return _dedupe_preserving_order(token for token in ordered_tokens if token in allowed_tokens)


def _collect_higher_level_tokens(
    level: str,
    raw_level_data: dict[str, tuple[list[str], list[Chunk], list]],
) -> set[str]:
    higher_tokens: set[str] = set()
    for other_level, (vocabulary, _, _) in raw_level_data.items():
        if other_level > level:
            higher_tokens.update(vocabulary)
    return higher_tokens


def _build_question_answer_map(transcripts, vocabulary: set[str]) -> dict[str, str]:
    question_answer_map: dict[str, str] = {}
    for transcript in transcripts:
        lines = [line.strip() for line in transcript.content.splitlines() if line.strip()]
        for index in range(len(lines) - 1):
            question = lines[index]
            answer = lines[index + 1]
            normalized_question = _normalize_question_key(question)
            if not normalized_question:
                continue
            answer_tokens = {
                normalize_hebrew_token(token)
                for token in answer.split()
                if normalize_hebrew_token(token)
            }
            if answer_tokens and answer_tokens.issubset(vocabulary) and is_short_hebrew_answer(answer):
                question_answer_map.setdefault(normalized_question, answer)
    return question_answer_map


def _normalize_question_key(text: str) -> str:
    normalized = " ".join(normalize_hebrew_token(part) for part in text.split() if normalize_hebrew_token(part))
    return normalized.strip()


def _build_token_frequency_map(transcripts) -> dict[str, int]:
    frequencies: Counter[str] = Counter()
    for transcript in transcripts:
        for token in transcript.content.split():
            normalized = normalize_hebrew_token(token)
            if normalized:
                frequencies[normalized] += 1
    return dict(frequencies)


def _rank_chunk_tokens(bundle: CachedLevelBundle, selected_chunks: list[Chunk]) -> list[str]:
    ranked: list[tuple[int, int, str]] = []
    seen_tokens: set[str] = set()
    for chunk in selected_chunks:
        for token in chunk.tokens:
            if not token or token in seen_tokens:
                continue
            seen_tokens.add(token)
            ranked.append((bundle.token_frequency.get(token, 0), -len(token), token))
    ranked.sort(reverse=True)
    return [token for _, _, token in ranked]


def _dedupe_preserving_order(tokens) -> list[str]:
    ordered_tokens: list[str] = []
    seen_tokens: set[str] = set()
    for token in tokens:
        if token in seen_tokens:
            continue
        seen_tokens.add(token)
        ordered_tokens.append(token)
    return ordered_tokens


def _extract_level_from_cache_key(cache_key: str) -> str:
    try:
        return cache_key.rsplit(":", 2)[1]
    except IndexError:
        return "A1"


def _semantic_cache_enabled() -> bool:
    if os.getenv("PYTEST_CURRENT_TEST") is not None:
        return True
    return os.getenv("ENABLE_SEMANTIC_CACHE", "").strip().lower() in {"1", "true", "yes", "on"}


def _semantic_cache_allowed(query: str, intent: str | None = None) -> bool:
    from services.chat_intents import detect_intent
    detected = intent or (detect_intent(query).name if detect_intent(query) else None)
    return detected in {"WORD_MEANING", "TRANSLATE_REQUEST", "EXAMPLE_REQUEST"}


class SemanticCacheManager:
    def __init__(self, cache_dir: Path | str, threshold: float = 0.92):
        self.cache_dir = Path(cache_dir)
        self.threshold = threshold
        self.enabled = _semantic_cache_enabled()
        self.available = False
        self.dimension = 1024
        self._lock = threading.Lock()
        self.keys: list[str] = []
        self.disk_cache = None
        self.index = None
        self.faiss_index_path = self.cache_dir / "faiss.index"

        if not self.enabled:
            return
        try:
            import diskcache  # type: ignore
            import faiss  # type: ignore
        except Exception as exc:
            logger.warning({"event": "semantic_cache_disabled", "reason": str(exc)})
            return

        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.disk_cache = diskcache.Cache(str(self.cache_dir / "disk_cache"))
        with self._lock:
            if self.faiss_index_path.exists():
                try:
                    self.index = faiss.read_index(str(self.faiss_index_path))
                except Exception:
                    self.index = faiss.IndexFlatIP(self.dimension)
            else:
                self.index = faiss.IndexFlatIP(self.dimension)
                
            self.keys = self.disk_cache.get("keys_list", [])
            self.available = True

    def lookup(self, query: str, level: str, include_arabic: bool, intent: str | None = None) -> ChatResponse | None:
        if not self.available or self.index is None or self.disk_cache is None:
            return None
        if not _semantic_cache_allowed(query, intent):
            return None
        try:
            from services.offline_embeddings_index import get_dense_embedding
            import numpy as np
            query_vector = get_dense_embedding(query)
            query_np = np.array([query_vector], dtype=np.float32)
            
            with self._lock:
                if self.index.ntotal == 0:
                    return None
                distances, indices = self.index.search(query_np, 1)
                
            score = float(distances[0][0])
            idx = int(indices[0][0])
            
            if idx != -1 and score >= self.threshold:
                with self._lock:
                    if idx < len(self.keys):
                        cache_key = self.keys[idx]
                    else:
                        return None
                        
                entry = self.disk_cache.get(cache_key)
                if entry:
                    response = ChatResponse.model_validate(entry)
                    if response.level == level and response.fallbackUsed is False:
                        from services.chat_intents import detect_intent
                        detected = detect_intent(query)
                        query_intent = intent or (detected.name if detected else None)
                        cached_intent = entry.get("intent") if isinstance(entry, dict) else None
                        if query_intent and query_intent == cached_intent:
                            response.cacheHit = True
                            response.latencyMs = 0
                            return response
        except Exception:
            pass
        return None

    def insert(self, query: str, level: str, response: ChatResponse):
        if not self.available or self.index is None or self.disk_cache is None:
            return
        if response.fallbackUsed or response.routerHit is False:
            return
        try:
            from services.chat_intents import detect_intent
            detected = detect_intent(query)
            intent = detected.name if detected else None
            if not _semantic_cache_allowed(query, intent):
                return
            from services.offline_embeddings_index import get_dense_embedding
            import numpy as np
            import faiss  # type: ignore
            query_vector = get_dense_embedding(query)
            query_np = np.array([query_vector], dtype=np.float32)
            
            import hashlib
            msg_hash = hashlib.sha1(query.encode("utf-8"), usedforsecurity=False).hexdigest()[:16]
            cache_key = f"sem:{msg_hash}:{level}"
            
            with self._lock:
                self.index.add(query_np)
                self.keys.append(cache_key)
                faiss.write_index(self.index, str(self.faiss_index_path))
                
                self.disk_cache.set("keys_list", self.keys)
                payload = response.model_dump()
                payload["intent"] = intent
                self.disk_cache.set(cache_key, payload)
        except Exception:
            pass


SEMANTIC_CACHE_MANAGER = SemanticCacheManager(BASE_DIR / "data" / "semantic_cache")


def store_semantic_cached_response(query: str, level: str, response: ChatResponse) -> None:
    if response.fallbackUsed:
        return
    try:
        SEMANTIC_CACHE_MANAGER.insert(query, level, response)
    except Exception:
        pass


try:
    from slowapi import Limiter  # type: ignore
    from slowapi.util import get_remote_address  # type: ignore

    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        SLO_LIMITER = Limiter(key_func=get_remote_address, storage_uri=redis_url)
    else:
        SLO_LIMITER = Limiter(key_func=get_remote_address)
except Exception:
    SLO_LIMITER = None


warm_startup_chat_cache()
