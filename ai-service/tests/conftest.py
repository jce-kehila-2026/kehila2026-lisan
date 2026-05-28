"""
conftest.py — shared pytest fixtures for ai-service tests.

Clears response cache and conversation memory between tests so that
test order doesn't affect results.
"""
from __future__ import annotations

import os
os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

import pytest


@pytest.fixture(autouse=True)
def _clear_caches():
    """Reset in-process caches before every test."""
    from services.chat_cache import EXACT_RESPONSE_CACHE
    from services.chat_cache import RATE_LIMITER
    from services.chat_cache import RESPONSE_CACHE_MANAGER
    from services.conversation_memory import CONVERSATION_MEMORY

    # Clear exact response cache
    with RESPONSE_CACHE_MANAGER._lock:
        RESPONSE_CACHE_MANAGER._entries.clear()
        RESPONSE_CACHE_MANAGER._hits = 0
        RESPONSE_CACHE_MANAGER._misses = 0
    EXACT_RESPONSE_CACHE.clear()

    # Reset rate limiter so previous tests don't bleed over
    RATE_LIMITER.reset()

    # Clear all conversation sessions
    with CONVERSATION_MEMORY._lock:
        CONVERSATION_MEMORY._sessions.clear()

    # Reset provider circuit breakers to prevent state bleed
    from services.chat_provider import clear_provider_runtime_state, provider_circuit
    clear_provider_runtime_state()
    provider_circuit.reset()

    yield
