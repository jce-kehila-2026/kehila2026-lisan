"""
conftest.py — shared pytest fixtures for ai-service tests.

Clears response cache and conversation memory between tests so that
test order doesn't affect results.
"""
from __future__ import annotations

import os

# Force-disable auth in tests. We removed the PYTEST_CURRENT_TEST bypass
# from the auth middleware (P01) because it was a production security hole.
# Tests instead disable auth explicitly by clearing the secrets here BEFORE
# any application module is imported — so .env values don't bleed into tests.
os.environ["AI_SERVICE_INTERNAL_SECRET"] = ""
os.environ["JWT_SECRET"] = ""

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

    # Reset semantic cache so previous tests don't bleed over
    try:
        from services.chat_cache import SEMANTIC_CACHE_MANAGER
        import faiss
        with SEMANTIC_CACHE_MANAGER._lock:
            SEMANTIC_CACHE_MANAGER.keys = []
            SEMANTIC_CACHE_MANAGER.index = faiss.IndexFlatIP(1024)
            SEMANTIC_CACHE_MANAGER.disk_cache.clear()
    except Exception:
        pass

    # Reset rate limiter so previous tests don't bleed over
    RATE_LIMITER.reset()

    # Clear all conversation sessions
    with CONVERSATION_MEMORY._lock:
        CONVERSATION_MEMORY._sessions.clear()

    # Reset provider circuit breakers to prevent state bleed
    from services.chat_provider import clear_provider_runtime_state, provider_circuit
    clear_provider_runtime_state()
    provider_circuit.reset()

    # Reset voice circuit breakers — only catch the narrow set of import/
    # attribute errors that can legitimately occur in a partial install.
    # Hiding all Exception masks real bugs (AttributeError on stale code).
    try:
        from services.voice_circuits import stt_circuit, tts_circuit
        stt_circuit.reset()
        tts_circuit.reset()
    except (ImportError, AttributeError):
        pass

    # Reset analytics start time so uptime_seconds stays near 0 in tests
    import services.analytics as _analytics
    _analytics._START_TIME = __import__('time').time()

    # Reset SetFit module-level globals so a model loaded by one test does
    # NOT bleed into the next test and non-deterministically change intent
    # classification results (was causing flaky vocabulary-leakage failures).
    try:
        import services.chat_intents as _chat_intents
        _chat_intents._SETFIT_MODEL = None
        _chat_intents._SETFIT_MODEL_LOADED = False
    except (ImportError, AttributeError):
        pass

    # Clear the in-process intent-response cache so stored responses from one
    # test (e.g. test_intent_cache_reuses_response_object) don't bleed into
    # subsequent tests.
    try:
        from services.prompt_cache_by_intent import _CACHE as _intent_cache, _LOCK as _intent_lock
        with _intent_lock:
            _intent_cache.clear()
    except (ImportError, AttributeError):
        pass

    yield
