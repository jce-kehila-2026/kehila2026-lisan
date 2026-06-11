from __future__ import annotations

from collections import OrderedDict
from threading import Lock

from services.chat_schemas import ChatResponse


_LOCK = Lock()
_MAX_ENTRIES = 512
_CACHE: "OrderedDict[str, ChatResponse]" = OrderedDict()


def build_intent_cache_key(intent: str, level: str, target: str | None = None, language: str = "he") -> str:
    return f"{intent}:{level}:{language}:{target or ''}".lower()


def get_intent_cached_response(key: str) -> ChatResponse | None:
    with _LOCK:
        response = _CACHE.get(key)
        if response is None:
            return None
        _CACHE.move_to_end(key)
        cached = response.model_copy(deep=True)
        cached.cacheHit = True
        return cached


def store_intent_cached_response(key: str, response: ChatResponse) -> None:
    if response.fallbackUsed:
        return
    with _LOCK:
        _CACHE[key] = response.model_copy(deep=True)
        _CACHE.move_to_end(key)
        while len(_CACHE) > _MAX_ENTRIES:
            _CACHE.popitem(last=False)
