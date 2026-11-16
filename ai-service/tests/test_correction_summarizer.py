"""Internal summarize-corrections endpoint: secret guard + JSON parsing.

The LLM is always mocked — no provider is contacted.
"""
from __future__ import annotations

import json
import os
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from services import correction_summarizer as cs
from services.chat_provider import ProviderResult

PATH = "/api/ai/internal/summarize-corrections"
BODY = {
    "level": "A1",
    "rules": [
        {"id": "r1", "ruleText": "Address the learner as את."},
        {"id": "r2", "ruleText": "Use feminine verbs with her."},
        {"id": "r3", "ruleText": "Use short sentences."},
    ],
}
GOOD_JSON = {
    "summary": "Address her as את with feminine verbs. Keep sentences short.",
    "sentences": [
        {"text": "Address her as את with feminine verbs.", "ruleIds": ["r1", "r2"]},
        {"text": "Keep sentences short.", "ruleIds": ["r3"]},
    ],
}


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


def _provider_answer(answer, captured=None):
    def fake(provider, model, system_message, question, options=None):
        if captured is not None:
            captured.append((system_message, question, options))
        return ProviderResult(
            answer=answer, latency_seconds=0.01, input_tokens=10, output_tokens=10,
            provider="gemini", model="gemini-test",
        )

    return fake


def test_missing_secret_is_rejected(client):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": "s"}), \
            mock.patch.object(cs, "call_provider", side_effect=AssertionError("no call")):
        assert client.post(PATH, json=BODY).status_code == 401
        assert client.post(PATH, json=BODY, headers={"X-Internal-Service-Secret": "x"}).status_code == 403


def test_production_without_secret_fails_closed(client):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": "", "ENV_MODE": "production"}), \
            mock.patch.object(cs, "call_provider", side_effect=AssertionError("no call")):
        assert client.post(PATH, json=BODY).status_code == 401


def test_returns_parsed_summary_with_low_temperature(client):
    captured = []
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": "s"}), \
            mock.patch.object(cs, "call_provider", side_effect=_provider_answer(json.dumps(GOOD_JSON), captured)):
        resp = client.post(PATH, json=BODY, headers={"X-Internal-Service-Secret": "s"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["summary"] == GOOD_JSON["summary"]
    assert data["sentences"][0]["ruleIds"] == ["r1", "r2"]
    assert data["model"] == "gemini-test"
    system, question, options = captured[0]
    assert options.temperature <= 0.2
    assert "NEVER drop a rule" in system and "A1" in system
    assert '"r3"' in question


def test_fenced_json_is_parsed():
    raw = "```json\n" + json.dumps(GOOD_JSON, ensure_ascii=False) + "\n```"
    parsed = cs.parse_summary_json(raw)
    assert parsed.summary == GOOD_JSON["summary"]
    assert len(parsed.sentences) == 2


def test_summary_falls_back_to_joined_sentences():
    parsed = cs.parse_summary_json(json.dumps({"sentences": GOOD_JSON["sentences"]}))
    assert parsed.summary == "Address her as את with feminine verbs. Keep sentences short."


@pytest.mark.parametrize("raw", [
    "not json at all",
    "{\"summary\": \"x\"}",
    "{\"summary\": \"x\", \"sentences\": [{\"text\": \"a\"}]}",
    "{\"summary\": \"x\", \"sentences\": [\"a\"]}",
])
def test_bad_json_raises(raw):
    with pytest.raises(cs.SummaryParseError):
        cs.parse_summary_json(raw)


def test_bad_model_answer_returns_502(client):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": ""}), \
            mock.patch.object(cs, "call_provider", side_effect=_provider_answer("sorry, no")):
        resp = client.post(PATH, json=BODY)
    assert resp.status_code == 502


def test_provider_failure_returns_502(client):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": ""}), \
            mock.patch.object(cs, "call_provider", side_effect=RuntimeError("all providers down")):
        resp = client.post(PATH, json=BODY)
    assert resp.status_code == 502


def test_empty_rules_rejected(client):
    with mock.patch.dict(os.environ, {"AI_SERVICE_INTERNAL_SECRET": ""}):
        resp = client.post(PATH, json={"level": "A1", "rules": []})
    assert resp.status_code == 422
