from __future__ import annotations

import threading
import time
from collections import Counter
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from services.chat_guardrails import is_short_hebrew_answer, normalize_hebrew_token, normalize_level
from services.chat_retrieval import Chunk, chunk_transcripts, extract_vocabulary, load_transcripts
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
DEFAULT_RESPONSE_CACHE_TTL_SECONDS = 3600
DEFAULT_RESPONSE_CACHE_MAX_ENTRIES = 256
DEFAULT_RATE_LIMIT_MAX_REQUESTS = 10
DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60


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
        now = self._time_func()
        with self._lock:
            self._clear_expired_entries_locked()
            if len(self._entries) >= self.max_entries:
                self._evict_oldest_entry_locked()

            cache_key = self._build_key(query_hash, normalized_level)
            effective_ttl = ttl or self.default_ttl
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
        with self._lock:
            requests = self._get_active_requests_locked(normalized_user_id)
            if len(requests) >= self.max_requests:
                retry_after = max(1, int(requests[0] + self.window_seconds - self._time_func()))
                return False, retry_after

            requests.append(self._time_func())
            return True, 0

    def get_status(self, user_id: str) -> dict[str, int | bool | str]:
        normalized_user_id = (user_id or "anonymous").strip() or "anonymous"
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
EXACT_RESPONSE_CACHE: dict[str, ChatResponse] = {}
RESPONSE_CACHE_MANAGER = CacheManager()
RATE_LIMITER = RateLimiter()


def warm_startup_chat_cache() -> None:
    with _CACHE_LOCK:
        if CHAT_CACHE:
            return

        discovered_levels = sorted(
            path.name.upper()
            for path in TRANSCRIPTS_DIR.iterdir()
            if path.is_dir()
        )

        raw_level_data: dict[str, tuple[list[str], list[Chunk], list]] = {}
        for level in discovered_levels:
            transcripts, _ = load_transcripts(level)
            vocabulary = extract_vocabulary(transcripts)
            chunks = chunk_transcripts(transcripts)
            raw_level_data[level] = (vocabulary, chunks, transcripts)

        cumulative_levels = sorted(raw_level_data.keys())
        for level in cumulative_levels:
            vocabulary, chunks, transcripts = raw_level_data[level]
            higher_level_tokens = _collect_higher_level_tokens(level, raw_level_data)
            CHAT_CACHE[level] = CachedLevelBundle(
                level=level,
                vocab=vocabulary,
                vocab_set=frozenset(vocabulary),
                chunks=chunks,
                advanced_only_tokens=frozenset(higher_level_tokens - set(vocabulary)),
                glossary=dict(DIRECT_HEBREW_WORD_RESPONSES),
                question_answer_map=_build_question_answer_map(transcripts, set(vocabulary)),
                token_frequency=_build_token_frequency_map(transcripts),
            )


def get_level_bundle(level: str) -> CachedLevelBundle:
    warm_startup_chat_cache()
    normalized_level = normalize_level(level)
    return CHAT_CACHE.get(normalized_level) or CHAT_CACHE["A1"]


def build_cache_key(message: str, level: str, include_arabic: bool) -> str:
    normalized_message = normalize_message_for_cache(message)
    return f"{normalized_message}:{normalize_level(level)}:{str(include_arabic).lower()}"


def normalize_message_for_cache(message: str) -> str:
    parts = [normalize_hebrew_token(part) or part.strip().lower() for part in (message or "").split()]
    return " ".join(part for part in parts if part)


def get_exact_cached_response(cache_key: str) -> ChatResponse | None:
    level = _extract_level_from_cache_key(cache_key)
    return RESPONSE_CACHE_MANAGER.get_cached_response(cache_key, level)


def store_exact_cached_response(cache_key: str, response: ChatResponse) -> None:
    level = _extract_level_from_cache_key(cache_key)
    RESPONSE_CACHE_MANAGER.set_cached_response(cache_key, level, response)
    with _EXACT_CACHE_LOCK:
        EXACT_RESPONSE_CACHE[cache_key] = response.model_copy(deep=True)


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


warm_startup_chat_cache()
