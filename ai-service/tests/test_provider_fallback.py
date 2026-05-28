from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from services.chat_provider import (
    AllProvidersFailedError,
    ChatProviderAuthError,
    ChatProviderError,
    ProviderConfig,
    ProviderResult,
    call_provider,
    clear_provider_runtime_state,
)

client = TestClient(app)


def _result(provider: str, model: str) -> ProviderResult:
    return ProviderResult(
        answer="שלום.",
        latency_seconds=0.01,
        input_tokens=10,
        output_tokens=5,
        provider=provider,
        model=model,
    )


def test_fallback_uses_second_provider_when_primary_fails(monkeypatch):
    clear_provider_runtime_state()

    def fake_call(config: ProviderConfig, system_message: str, question: str, options=None) -> ProviderResult:
        if config.name == "gemini":
            raise ChatProviderError("gemini failed")
        if config.name == "anthropic":
            return _result(config.name, config.model)
        raise AssertionError("OpenAI should not be used when Anthropic succeeds")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    result = call_provider("gemini", "gemini-2.5-flash-lite", "system", "question")
    assert result.provider == "anthropic"
    assert result.model == "claude-3-5-sonnet-20241022"
    assert [attempt.provider for attempt in result.attempts] == ["gemini", "anthropic"]
    assert result.attempts[0].status == "failed"
    assert result.attempts[1].status == "success"


def test_fallback_uses_third_provider_when_first_two_fail(monkeypatch):
    clear_provider_runtime_state()

    def fake_call(config: ProviderConfig, system_message: str, question: str, options=None) -> ProviderResult:
        if config.name in {"gemini", "anthropic"}:
            raise ChatProviderError(f"{config.name} failed")
        return _result(config.name, config.model)

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    result = call_provider("gemini", "gemini-2.5-flash-lite", "system", "question")
    assert result.provider == "openai"
    assert [attempt.provider for attempt in result.attempts] == ["gemini", "anthropic", "openai"]
    assert result.attempts[-1].status == "success"


def test_all_providers_failed_raises_aggregate_error(monkeypatch):
    clear_provider_runtime_state()

    def fake_call(config: ProviderConfig, system_message: str, question: str, options=None) -> ProviderResult:
        raise ChatProviderAuthError(f"{config.name} auth failed")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    try:
        call_provider("gemini", "gemini-2.5-flash-lite", "system", "question")
    except AllProvidersFailedError as exc:
        assert len(exc.failures) == 3
        assert exc.primary_error.__class__ is ChatProviderAuthError
    else:
        raise AssertionError("Expected AllProvidersFailedError")


def test_logs_endpoint_filters_failed_provider_attempts(monkeypatch):
    clear_provider_runtime_state()

    def fake_call(config: ProviderConfig, system_message: str, question: str, options=None) -> ProviderResult:
        if config.name == "gemini":
            raise ChatProviderError("gemini failed")
        return _result(config.name, config.model)

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    with patch("services.chat_engine.get_exact_cached_response", return_value=None), patch(
        "services.chat_engine.store_exact_cached_response", lambda *args, **kwargs: None
    ), patch("services.chat_engine.route_message", return_value=None), patch(
        "services.chat_engine.is_clearly_out_of_scope", return_value=False
    ), patch(
        "services.chat_engine.classify_fast_reject", return_value=None
    ), patch(
        "services.chat_engine.is_hebrew_only_answer", return_value=True
    ), patch(
        "services.chat_engine.evaluate_vocabulary"
    ) as mock_vocab:
        mock_vocab.return_value.fallback_used = False
        mock_vocab.return_value.fallback_reason = None
        mock_vocab.return_value.blocked_tokens = []
        response = client.post(
            "/api/ai/chat",
            json={"message": "בדיקת נפילה ייחודית 2026", "level": "A1", "includeArabic": False},
        )

    assert response.status_code == 200
    assert response.json()["provider"] == "anthropic"

    logs_response = client.get("/api/ai/logs", params={"provider": "gemini", "status": "failed"})
    assert logs_response.status_code == 200
    body = logs_response.json()
    assert body["count"] >= 1
    assert all(item["provider"] == "gemini" for item in body["items"])
    assert all(item["status"] == "failed" for item in body["items"])
