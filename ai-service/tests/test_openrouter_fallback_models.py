from types import SimpleNamespace
from unittest.mock import patch

from services import chat_provider as cp


def _resp(model):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="שלום! מה שלומך?"))],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5),
        model=model,
    )


def _run(monkeypatch, fallback_env, returned_model):
    monkeypatch.setenv("OPENROUTER_API_KEYS", "k1")
    if fallback_env is None:
        monkeypatch.delenv("OPENROUTER_FALLBACK_MODELS", raising=False)
    else:
        monkeypatch.setenv("OPENROUTER_FALLBACK_MODELS", fallback_env)
    seen = {}
    def create(**kwargs):
        seen.update(kwargs)
        return _resp(returned_model)
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    with patch.object(cp, "_create_openrouter_client", return_value=client):
        result = cp._call_openrouter("google/gemini-2.5-flash-lite", "sys", "שלום", 10)
    return seen, result


def test_fallback_models_sent_and_actual_model_reported(monkeypatch):
    seen, result = _run(monkeypatch, "google/gemini-2.5-flash, google/gemini-2.5-flash-lite", "google/gemini-2.5-flash")
    assert seen["extra_body"] == {"models": ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash"]}
    assert result.model == "google/gemini-2.5-flash"


def test_no_fallback_env_keeps_old_request(monkeypatch):
    seen, result = _run(monkeypatch, None, "google/gemini-2.5-flash-lite")
    assert "extra_body" not in seen
    assert result.model == "google/gemini-2.5-flash-lite"
