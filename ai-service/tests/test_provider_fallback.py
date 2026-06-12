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
        answer="\u05e9\u05dc\u05d5\u05dd.",
        latency_seconds=0.01,
        input_tokens=10,
        output_tokens=5,
        provider=provider,
        model=model,
    )


def test_default_provider_chain_is_gemini_only(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    clear_provider_runtime_state()
    calls: list[str] = []

    def fake_call(
        config: ProviderConfig,
        system_message: str,
        question: str,
        options=None,
    ) -> ProviderResult:
        calls.append(config.name)
        raise ChatProviderError(f"{config.name} failed")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    try:
        call_provider("gemini", "gemini-2.5-flash-lite", "system", "question")
    except AllProvidersFailedError as exc:
        assert [failure.provider for failure in exc.failures] == ["gemini"]
        assert exc.primary_error.__class__ is ChatProviderError
    else:
        raise AssertionError("Expected AllProvidersFailedError")

    assert calls == ["gemini"]


def test_requested_non_default_provider_falls_back_to_gemini(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    clear_provider_runtime_state()

    def fake_call(
        config: ProviderConfig,
        system_message: str,
        question: str,
        options=None,
    ) -> ProviderResult:
        if config.name == "custom":
            raise ChatProviderError("custom failed")
        if config.name == "gemini":
            return _result(config.name, config.model)
        raise AssertionError(f"unexpected provider {config.name}")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    result = call_provider("custom", "custom-model", "system", "question")
    assert result.provider == "gemini"
    assert result.model == "gemini-2.5-flash-lite"
    assert [attempt.provider for attempt in result.attempts] == ["custom", "gemini"]
    assert result.attempts[0].status == "failed"
    assert result.attempts[1].status == "success"


def test_all_configured_providers_failed_raises_aggregate_error(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    clear_provider_runtime_state()

    def fake_call(
        config: ProviderConfig,
        system_message: str,
        question: str,
        options=None,
    ) -> ProviderResult:
        raise ChatProviderAuthError(f"{config.name} auth failed")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    try:
        call_provider("gemini", "gemini-2.5-flash-lite", "system", "question")
    except AllProvidersFailedError as exc:
        assert len(exc.failures) == 1
        assert exc.failures[0].provider == "gemini"
        assert exc.primary_error.__class__ is ChatProviderAuthError
    else:
        raise AssertionError("Expected AllProvidersFailedError")


def test_logs_endpoint_filters_failed_provider_attempts(monkeypatch):
    clear_provider_runtime_state()

    def fake_call(
        config: ProviderConfig,
        system_message: str,
        question: str,
        options=None,
    ) -> ProviderResult:
        raise ChatProviderError("gemini failed")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    with patch("services.chat_engine.get_exact_cached_response", return_value=None), patch(
        "services.chat_engine.store_exact_cached_response", lambda *args, **kwargs: None
    ), patch("services.chat_engine.route_message", return_value=None), patch(
        "services.chat_engine.is_clearly_out_of_scope", return_value=False
    ), patch(
        "services.chat_engine.classify_fast_reject", return_value=None
    ), patch(
        # Defer the deterministic pre-LLM local-answer path so this message
        # reaches the provider — the point of this test is provider-failure
        # logging, not local routing.
        "services.chat_engine._build_pre_llm_response", return_value=None
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
            json={
                "message": "\u05d1\u05d3\u05d9\u05e7\u05ea \u05e0\u05e4\u05d9\u05dc\u05d4 \u05d9\u05d9\u05d7\u05d5\u05d3\u05d9\u05ea 2026",
                "level": "A1",
                "includeArabic": False,
            },
        )

    assert response.status_code == 200
    assert response.json()["provider"] == "gemini"
    assert response.json()["fallbackUsed"] is True
    assert response.json()["fallbackReason"] == "MODEL_ERROR"

    logs_response = client.get(
        "/api/ai/logs", params={"provider": "gemini", "status": "failed"}
    )
    assert logs_response.status_code == 200
    body = logs_response.json()
    assert body["count"] >= 1
    assert all(item["provider"] == "gemini" for item in body["items"])
    assert all(item["status"] == "failed" for item in body["items"])


def test_groq_key_adds_free_fallback_after_gemini(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    monkeypatch.setenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    clear_provider_runtime_state()

    calls: list[str] = []

    def fake_call(
        config: ProviderConfig,
        system_message: str,
        question: str,
        options=None,
    ) -> ProviderResult:
        calls.append(config.name)
        if config.name == "gemini":
            raise ChatProviderError("gemini quota")
        if config.name == "groq":
            return _result(config.name, config.model)
        raise AssertionError(f"unexpected provider {config.name}")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    result = call_provider("gemini", "gemini-2.5-flash-lite", "system", "question")

    assert result.provider == "groq"
    assert result.model == "llama-3.3-70b-versatile"
    assert calls == ["gemini", "groq"]
    assert [attempt.provider for attempt in result.attempts] == ["gemini", "groq"]


def test_cloudflare_credentials_add_workers_ai_fallback(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "test-cloudflare-token")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "test-cloudflare-account")
    monkeypatch.setenv("CLOUDFLARE_AI_MODEL", "@cf/meta/llama-4-scout-17b-16e-instruct")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    clear_provider_runtime_state()

    calls: list[str] = []

    def fake_call(
        config: ProviderConfig,
        system_message: str,
        question: str,
        options=None,
    ) -> ProviderResult:
        calls.append(config.name)
        if config.name == "gemini":
            raise ChatProviderError("gemini quota")
        if config.name == "cloudflare":
            return _result(config.name, config.model)
        raise AssertionError(f"unexpected provider {config.name}")

    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)

    result = call_provider("gemini", "gemini-2.5-flash-lite", "system", "question")

    assert result.provider == "cloudflare"
    assert result.model == "@cf/meta/llama-4-scout-17b-16e-instruct"
    assert calls == ["gemini", "cloudflare"]
    assert [attempt.provider for attempt in result.attempts] == ["gemini", "cloudflare"]
