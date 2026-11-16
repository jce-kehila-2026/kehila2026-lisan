"""Ops monitoring: OpenRouter usage cost must flow into ProviderResult and the
public response schemas (additive, optional fields only)."""
from __future__ import annotations

from types import SimpleNamespace

import services.chat_provider as chat_provider
from services.chat_provider import ProviderResult, _extract_usage_cost
from services.chat_schemas import ChatResponse, VoiceChatResponse


class _FakeCompletions:
    def __init__(self, response):
        self._response = response

    def create(self, **kwargs):
        return self._response


class _FakeClient:
    def __init__(self, response):
        self.chat = SimpleNamespace(completions=_FakeCompletions(response))


def _openrouter_response(usage):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="שלום"))],
        usage=usage,
    )


def test_extract_usage_cost_reads_attribute_and_model_extra():
    assert _extract_usage_cost(SimpleNamespace(cost=0.00012)) == 0.00012
    assert _extract_usage_cost(SimpleNamespace(model_extra={"cost": "0.5"})) == 0.5
    assert _extract_usage_cost({"cost": 0.25}) == 0.25
    assert _extract_usage_cost(None) is None
    assert _extract_usage_cost(SimpleNamespace(cost="nope")) is None
    assert _extract_usage_cost(SimpleNamespace(cost=-1)) is None


def test_call_openrouter_returns_cost_when_reported(monkeypatch):
    usage = SimpleNamespace(prompt_tokens=100, completion_tokens=20, cost=0.000031)
    monkeypatch.setattr(chat_provider, "_get_openrouter_keys", lambda: ["k1"])
    monkeypatch.setattr(
        chat_provider,
        "_create_openrouter_client",
        lambda timeout, key: _FakeClient(_openrouter_response(usage)),
    )
    result = chat_provider._call_openrouter("google/gemini-2.5-flash-lite", "sys", "q", 5.0)
    assert result.cost_usd == 0.000031
    assert result.input_tokens == 100
    assert result.provider == "openrouter"


def test_call_openrouter_cost_none_when_missing(monkeypatch):
    usage = SimpleNamespace(prompt_tokens=1, completion_tokens=1)
    monkeypatch.setattr(chat_provider, "_get_openrouter_keys", lambda: ["k1"])
    monkeypatch.setattr(
        chat_provider,
        "_create_openrouter_client",
        lambda timeout, key: _FakeClient(_openrouter_response(usage)),
    )
    result = chat_provider._call_openrouter("m", "sys", "q", 5.0)
    assert result.cost_usd is None


def test_provider_result_cost_defaults_to_none():
    result = ProviderResult(answer="x", latency_seconds=0.1, input_tokens=1, output_tokens=1)
    assert result.cost_usd is None


def test_response_schemas_accept_optional_cost():
    base = dict(
        answerHe="שלום", answerAr=None, fallbackUsed=False, fallbackReason=None,
        level="A1", model="m", latencyMs=10,
    )
    assert ChatResponse(**base).costUsd is None
    assert ChatResponse(**base, costUsd=0.001).costUsd == 0.001
    assert VoiceChatResponse().costUsd is None
    assert VoiceChatResponse(costUsd=0.002).costUsd == 0.002
