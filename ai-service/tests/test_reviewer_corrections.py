"""
test_reviewer_corrections.py

Human-reviewer corrections (approved by the owner in the admin queue) are
fetched from the backend per level, cached, and injected into the tutor
system prompt. The fetch must never block or break a chat.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from services import chat_engine
from services import reviewer_corrections as rc
from services.chat_provider import ProviderResult
from services.chat_schemas import ChatRequest


@pytest.fixture(autouse=True)
def _reset_corrections(monkeypatch):
    rc.clear_corrections_cache()
    monkeypatch.setenv("BACKEND_URL", "http://backend.test")
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)
    yield
    rc.clear_corrections_cache()


class _FakeResponse:
    def __init__(self, payload, status=200):
        self._body = json.dumps(payload).encode("utf-8")
        self.status = status

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _backend_with(rules_by_level, calls=None):
    def fake_urlopen(request, timeout=None):
        url = request.full_url
        if calls is not None:
            calls.append((url, dict(request.header_items()), timeout))
        level = url.split("level=")[-1]
        rules = rules_by_level.get(level, [])
        return _FakeResponse({"success": True, "corrections": rules})

    return fake_urlopen


def _stub_provider(captured):
    def spy(provider, model, system_message, *args, **kwargs):
        captured.append(system_message)
        return ProviderResult(
            answer="בטח! קפה אחד. עוד משהו?",
            latency_seconds=0.01,
            input_tokens=20,
            output_tokens=8,
            provider="gemini",
            model="gemini-2.5-flash-lite",
        )

    return spy


def test_fetches_rules_for_requested_level_with_secret(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_INTERNAL_SECRET", "s3cret")
    calls = []
    fake = _backend_with({"A1": [{"ruleText": "Use simple words"}]}, calls)
    with patch.object(rc.urllib.request, "urlopen", side_effect=fake):
        rules = rc.get_active_corrections("a1")
    assert rules == ["Use simple words"]
    url, headers, timeout = calls[0]
    assert url == "http://backend.test/api/internal/ai-corrections?level=A1"
    assert headers.get("X-internal-service-secret") == "s3cret"
    assert timeout is not None and timeout <= 2


def test_rules_are_cached_per_level(monkeypatch):
    calls = []
    fake = _backend_with({"A1": [{"ruleText": "A1 rule"}], "B1": [{"ruleText": "B1 rule"}]}, calls)
    with patch.object(rc.urllib.request, "urlopen", side_effect=fake):
        assert rc.get_active_corrections("A1") == ["A1 rule"]
        assert rc.get_active_corrections("A1") == ["A1 rule"]
        assert rc.get_active_corrections("B1") == ["B1 rule"]
    assert len(calls) == 2


def test_backend_down_returns_empty_and_does_not_raise():
    with patch.object(rc.urllib.request, "urlopen", side_effect=OSError("refused")):
        assert rc.get_active_corrections("A1") == []


def test_backend_down_keeps_last_known_rules(monkeypatch):
    fake = _backend_with({"A1": [{"ruleText": "Keep me"}]})
    with patch.object(rc.urllib.request, "urlopen", side_effect=fake):
        assert rc.get_active_corrections("A1") == ["Keep me"]
    rc._expire_cache_for_tests("A1")
    with patch.object(rc.urllib.request, "urlopen", side_effect=OSError("down")):
        assert rc.get_active_corrections("A1", background=False) == ["Keep me"]


def test_no_backend_url_means_no_rules(monkeypatch):
    monkeypatch.delenv("BACKEND_URL", raising=False)
    monkeypatch.delenv("RAG_BACKEND_URL", raising=False)
    with patch.object(rc.urllib.request, "urlopen", side_effect=AssertionError("no call")):
        assert rc.get_active_corrections("A1") == []


def test_block_is_bounded_in_count_and_chars():
    rules = [f"rule number {i} " + "x" * 400 for i in range(50)]
    block = rc.build_corrections_block(rules)
    assert block.startswith("Corrections from human reviewers")
    assert len(block) <= rc.MAX_BLOCK_CHARS + 200
    assert block.count("\n- ") <= rc.MAX_RULES
    # most recent (first) rule is kept
    assert "rule number 0" in block


def test_empty_rules_give_empty_block_and_version():
    assert rc.build_corrections_block([]) == ""
    assert rc.corrections_version([]) == ""
    assert rc.corrections_version(["a"]) != rc.corrections_version(["b"])


def test_prompt_includes_active_rules_for_that_level_only():
    fake = _backend_with({
        "A1": [{"ruleText": "Never use the word מזגן with A1 learners"}],
        "B2": [{"ruleText": "B2 ONLY RULE"}],
    })
    captured = []
    with patch.object(rc.urllib.request, "urlopen", side_effect=fake), \
            patch.object(chat_engine, "call_provider", side_effect=_stub_provider(captured)):
        chat_engine.generate_chat_response(
            ChatRequest(message="אני רוצה לקנות חלב", level="A1", sessionId="rc-1")
        )
    assert captured, "turn did not reach the LLM"
    prompt = captured[-1]
    assert "Corrections from human reviewers" in prompt
    assert "Never use the word מזגן with A1 learners" in prompt
    assert "B2 ONLY RULE" not in prompt


def test_chat_still_works_when_backend_down():
    captured = []
    with patch.object(rc.urllib.request, "urlopen", side_effect=OSError("down")), \
            patch.object(chat_engine, "call_provider", side_effect=_stub_provider(captured)):
        response = chat_engine.generate_chat_response(
            ChatRequest(message="אני רוצה לקנות חלב", level="A1", sessionId="rc-2")
        )
    assert response.answerHe
    assert captured
    assert "Corrections from human reviewers" not in captured[-1]


def test_cache_key_changes_when_rules_change():
    with patch.object(rc.urllib.request, "urlopen",
                      side_effect=_backend_with({"A1": [{"ruleText": "rule v1"}]})):
        key1 = chat_engine._build_request_context(
            ChatRequest(message="מה זה בית", level="A1")
        ).cache_key
    rc.clear_corrections_cache()
    with patch.object(rc.urllib.request, "urlopen",
                      side_effect=_backend_with({"A1": [{"ruleText": "rule v2"}]})):
        key2 = chat_engine._build_request_context(
            ChatRequest(message="מה זה בית", level="A1")
        ).cache_key
    assert key1 != key2
    # level must still be extractable from the key
    from services.chat_cache import _extract_level_from_cache_key
    assert _extract_level_from_cache_key(key1) == "A1"


# ── AI-written summary of the rules ─────────────────────────────────────────

def _backend_with_summary(rules, summary_text, version):
    def fake_urlopen(request, timeout=None):
        payload = {"success": True, "corrections": rules}
        if summary_text is not None:
            payload["summary"] = {"text": summary_text, "version": version}
        return _FakeResponse(payload)

    return fake_urlopen


def test_prompt_uses_summary_instead_of_raw_list_when_present():
    rules = [{"id": f"r{i}", "ruleText": f"RAW RULE {i}"} for i in range(20)]
    fake = _backend_with_summary(rules, "Always address her in feminine forms. Keep A1 words simple.", 3)
    captured = []
    with patch.object(rc.urllib.request, "urlopen", side_effect=fake), \
            patch.object(chat_engine, "call_provider", side_effect=_stub_provider(captured)):
        chat_engine.generate_chat_response(
            ChatRequest(message="אני רוצה לקנות חלב", level="A1", sessionId="rc-sum-1")
        )
    assert captured
    prompt = captured[-1]
    assert "Corrections from human reviewers — follow these:" in prompt
    assert "Always address her in feminine forms." in prompt
    assert "RAW RULE" not in prompt


def test_prompt_falls_back_to_raw_list_without_summary():
    rules = [{"id": "r1", "ruleText": "RAW RULE ONE"}]
    fake = _backend_with_summary(rules, None, None)
    captured = []
    with patch.object(rc.urllib.request, "urlopen", side_effect=fake), \
            patch.object(chat_engine, "call_provider", side_effect=_stub_provider(captured)):
        chat_engine.generate_chat_response(
            ChatRequest(message="אני רוצה לקנות חלב", level="A1", sessionId="rc-sum-2")
        )
    assert "- RAW RULE ONE" in captured[-1]


def test_summary_block_is_bounded_and_raw_cap_only_applies_to_list():
    long_summary = "Use feminine forms. " * 200
    guidance = rc.CorrectionsGuidance(rules=tuple(f"r{i}" for i in range(40)), summary=long_summary, summary_version="1")
    block = rc.build_guidance_block(guidance)
    assert block.startswith(rc.SUMMARY_HEADER)
    assert len(block) <= rc.MAX_SUMMARY_CHARS + len(rc.SUMMARY_HEADER) + 1
    raw = rc.build_guidance_block(rc.CorrectionsGuidance(rules=tuple(f"rule {i}" for i in range(40))))
    assert raw.count("\n- ") <= rc.MAX_RULES
    assert rc.build_guidance_block(rc.EMPTY_GUIDANCE) == ""


def test_summary_with_bad_version_is_ignored():
    fake = _backend_with_summary([{"ruleText": "RAW"}], "Some summary", None)
    with patch.object(rc.urllib.request, "urlopen", side_effect=fake):
        guidance = rc.get_corrections_guidance("A1")
    assert guidance.summary == ""
    assert guidance.rules == ("RAW",)


def test_cache_key_changes_when_summary_version_changes():
    rules = [{"id": "r1", "ruleText": "same rule"}]
    keys = []
    for version in (1, 2):
        rc.clear_corrections_cache()
        with patch.object(rc.urllib.request, "urlopen",
                          side_effect=_backend_with_summary(rules, "Same summary text.", version)):
            keys.append(chat_engine._build_request_context(
                ChatRequest(message="מה זה בית", level="A1")
            ).cache_key)
    rc.clear_corrections_cache()
    with patch.object(rc.urllib.request, "urlopen",
                      side_effect=_backend_with_summary(rules, None, None)):
        keys.append(chat_engine._build_request_context(
            ChatRequest(message="מה זה בית", level="A1")
        ).cache_key)
    assert len(set(keys)) == 3
    from services.chat_cache import _extract_level_from_cache_key
    assert all(_extract_level_from_cache_key(k) == "A1" for k in keys)
