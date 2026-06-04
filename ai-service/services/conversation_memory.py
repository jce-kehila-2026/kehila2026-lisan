"""
conversation_memory.py

In-memory multi-turn conversation history per session.

Design:
  - Keyed by session_id (opaque string from caller)
  - Each session stores at most MAX_TURNS turn-pairs (user + assistant)
  - Sessions expire after TTL_SECONDS of inactivity
  - Thread-safe via a single lock per store

History format (matches OpenAI/Anthropic message format):
  [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, ...]
"""
from __future__ import annotations

import threading
import time
import os
import logging
import json
from collections import deque
from dataclasses import dataclass, field
from typing import Callable

logger = logging.getLogger("lisan.chat")


MAX_TURNS = 5          # keep last N user+assistant pairs = 2*N messages
TTL_SECONDS = 1800     # 30 minutes of inactivity → evict session
MAX_SESSIONS = 2000    # guard against unbounded growth


@dataclass
class _Session:
    messages: deque[dict[str, str]]
    last_accessed: float = field(default_factory=time.time)


class ConversationMemory:
    def __init__(
        self,
        max_turns: int = MAX_TURNS,
        ttl_seconds: int = TTL_SECONDS,
        max_sessions: int = MAX_SESSIONS,
        time_func: Callable[[], float] | None = None,
    ) -> None:
        self._max_turns = max_turns
        self._ttl = ttl_seconds
        self._max_sessions = max_sessions
        self._time = time_func or time.time
        self._lock = threading.Lock()
        self._sessions: dict[str, _Session] = {}

    def get_history(self, session_id: str) -> list[dict[str, str]]:
        """Return message list for the session (newest at the end). Empty if unknown."""
        sid = (session_id or "").strip()
        if not sid:
            return []

        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                key = f"session:{sid}"
                data = redis_client.get(key)
                if data:
                    return json.loads(data)
                return []
            except Exception as exc:
                logger.warning(f"Redis get_history failed: {exc}")

        with self._lock:
            self._evict_expired_locked()
            session = self._sessions.get(sid)
            if session is None:
                return []
            session.last_accessed = self._time()
            return list(session.messages)

    def append_turn(
        self,
        session_id: str,
        user_message: str,
        assistant_message: str,
    ) -> None:
        """Append one user+assistant turn; trim to MAX_TURNS pairs.

        Uses Redis WATCH/MULTI/EXEC optimistic-lock pattern when Redis is
        available, so concurrent writers to the same session_id can't
        clobber each other's turns.
        """
        sid = (session_id or "").strip()
        if not sid or not user_message.strip():
            return

        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                key = f"session:{sid}"
                max_msgs = self._max_turns * 2
                new_msgs = [
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": assistant_message or ""},
                ]
                # WATCH/MULTI/EXEC loop — retries on concurrent modification
                for _ in range(5):
                    with redis_client.pipeline() as pipe:
                        try:
                            pipe.watch(key)
                            raw = pipe.get(key)
                            history = json.loads(raw) if raw else []
                            history.extend(new_msgs)
                            while len(history) > max_msgs:
                                history.pop(0)
                            pipe.multi()
                            pipe.set(key, json.dumps(history), ex=self._ttl)
                            pipe.execute()
                            return
                        except Exception as watch_exc:
                            # WatchError or similar — retry
                            if "WatchError" not in type(watch_exc).__name__:
                                raise
                            continue
                logger.warning(f"Redis append_turn gave up after retries for {sid}")
                return
            except Exception as exc:
                logger.warning(f"Redis append_turn failed: {exc}")

        with self._lock:
            self._evict_expired_locked()
            if sid not in self._sessions:
                if len(self._sessions) >= self._max_sessions:
                    self._evict_oldest_locked()
                self._sessions[sid] = _Session(messages=deque())
            session = self._sessions[sid]
            session.messages.append({"role": "user", "content": user_message})
            session.messages.append(
                {"role": "assistant", "content": assistant_message or ""}
            )
            max_msgs = self._max_turns * 2
            while len(session.messages) > max_msgs:
                session.messages.popleft()
            session.last_accessed = self._time()

    def clear_session(self, session_id: str) -> None:
        sid = (session_id or "").strip()
        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                redis_client.delete(f"session:{sid}")
            except Exception as exc:
                logger.warning(f"Redis clear_session failed: {exc}")

        with self._lock:
            self._sessions.pop(sid, None)

    def session_count(self) -> int:
        from services.redis_client import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            try:
                keys = redis_client.keys("session:*")
                return len(keys)
            except Exception as exc:
                logger.warning(f"Redis session_count failed: {exc}")

        with self._lock:
            return len(self._sessions)

    def _evict_expired_locked(self) -> None:
        now = self._time()
        expired = [
            sid for sid, s in self._sessions.items()
            if now - s.last_accessed > self._ttl
        ]
        if not expired:
            return
        # Delete from Redis too so storage doesn't bloat with stale sessions.
        # (Redis TTL also handles this, but local evictions should mirror.)
        try:
            from services.redis_client import get_redis_client
            redis_client = get_redis_client()
            if redis_client:
                redis_client.delete(*[f"session:{sid}" for sid in expired])
        except Exception as exc:
            logger.warning(f"Redis eviction cleanup failed: {exc}")
        for sid in expired:
            del self._sessions[sid]

    def _evict_oldest_locked(self) -> None:
        if not self._sessions:
            return
        oldest = min(self._sessions, key=lambda s: self._sessions[s].last_accessed)
        del self._sessions[oldest]



# Module-level singleton — shared across all requests in the process
CONVERSATION_MEMORY = ConversationMemory()
