from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from services.chat_cache import CacheManager, build_cache_key
from services.chat_schemas import ChatResponse, GuardrailReport

import pytest

client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_provider_call(monkeypatch):
    from services.chat_provider import ProviderResult
    def fake_call(config, system_message, question, opts=None):
        return ProviderResult(
            answer="אני גר.",
            latency_seconds=0.01,
            input_tokens=10,
            output_tokens=5,
            provider=config.name,
            model=config.model,
        )
    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)



def make_response(answer: str = "שלום.") -> ChatResponse:
    return ChatResponse(
        answerHe=answer,
        answerAr=None,
        fallbackUsed=False,
        fallbackReason=None,
        level="A1",
        model="test-model",
        provider="test-provider",
        latencyMs=12,
        cacheHit=False,
        routerHit=False,
        contextChunkIds=[],
        guardrail=GuardrailReport(),
        suggestedNextPrompts=[],
    )


def test_cache_manager_tracks_hits_misses_and_size():
    fake_now = [1000.0]
    manager = CacheManager(time_func=lambda: fake_now[0])
    query_hash = build_cache_key("שלום", "A1", False)

    assert manager.get_cached_response(query_hash, "A1") is None
    manager.set_cached_response(query_hash, "A1", make_response())

    cached = manager.get_cached_response(query_hash, "A1")
    assert cached is not None
    assert cached.answerHe == "שלום."
    assert manager.get_cache_stats() == {"hits": 1, "misses": 1, "size": 1}


def test_cache_manager_expires_entries_after_ttl():
    fake_now = [1000.0]
    manager = CacheManager(time_func=lambda: fake_now[0])
    query_hash = build_cache_key("תודה", "A1", False)

    manager.set_cached_response(query_hash, "A1", make_response("בבקשה."), ttl=10)
    fake_now[0] += 11

    assert manager.get_cached_response(query_hash, "A1") is None
    assert manager.get_cache_stats()["size"] == 0


def test_cache_stats_endpoint_returns_response_cache_metrics():
    before = client.get("/api/ai/cache/stats")
    assert before.status_code == 200
    before_stats = before.json()

    message = "שלום בדיקת קאש"
    payload = {"message": message, "level": "A1", "includeArabic": False}
    first = client.post("/api/ai/chat", json=payload)
    second = client.post("/api/ai/chat", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["cacheHit"] is True

    after = client.get("/api/ai/cache/stats")
    assert after.status_code == 200
    after_stats = after.json()
    assert after_stats["hits"] >= before_stats["hits"] + 1
    assert after_stats["size"] >= before_stats["size"] + 1
