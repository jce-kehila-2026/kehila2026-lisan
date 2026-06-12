"""
test_scenario_engine.py

Locks in the "quick activity" modes:

  1. scenario_engine builds a non-empty, level-aware prompt for every id, and
     the role-play (speaking) prompt carries the defining rule — lead the scene,
     never reject as "out of scope".
  2. openings are Hebrew-always, Arabic-only-on-request.
  3. through the engine, an active scenario goes STRAIGHT to the LLM
     (bypassing cache) and an off-topic line is NOT turned into an OUT_OF_SCOPE
     fallback — the scene stays open.
"""
from __future__ import annotations

from services.chat_provider import ProviderResult
from services.chat_schemas import ChatRequest
from services.scenario_engine import (
    DAILY_WORD,
    LETTERS,
    LISTENING,
    QUIZ,
    SPEAKING,
    CULTURE,
    build_scenario_prompt,
    is_scenario,
    scenario_opening,
)

ALL_IDS = [SPEAKING, DAILY_WORD, LETTERS, LISTENING, QUIZ, CULTURE]


# ── unit: registry ───────────────────────────────────────────────────────────

def test_is_scenario_accepts_known_ids_only():
    assert all(is_scenario(i) for i in ALL_IDS)
    assert not is_scenario("nope")
    assert not is_scenario(None)
    assert not is_scenario("")


# ── unit: prompt building ─────────────────────────────────────────────────────

def test_every_scenario_builds_a_nonempty_level_aware_prompt():
    for scenario_id in ALL_IDS:
        for level in ("A1", "A2", "B1", "B2"):
            prompt = build_scenario_prompt(scenario_id, level, include_arabic=False)
            assert prompt and prompt.strip()
            assert f"Level {level}" in prompt


def test_speaking_prompt_leads_and_never_rejects():
    prompt = build_scenario_prompt(SPEAKING, "A1", include_arabic=False)
    # The core behaviour the generic tutor lacked.
    assert "ROLE-PLAY" in prompt
    assert "out of scope" in prompt.lower()  # appears inside "NEVER ... out of scope"
    assert "NEVER" in prompt
    # A1 role-play is a cafe waiter — the scene must be concrete.
    assert "מלצר" in prompt


def test_speaking_scene_changes_with_level():
    a1 = build_scenario_prompt(SPEAKING, "A1", include_arabic=False)
    b1 = build_scenario_prompt(SPEAKING, "B1", include_arabic=False)
    assert a1 != b1  # different role/scene per level


def test_arabic_rule_only_present_when_requested():
    without = build_scenario_prompt(QUIZ, "A1", include_arabic=False)
    with_ar = build_scenario_prompt(QUIZ, "A1", include_arabic=True)
    assert "Do not use Arabic" in without
    assert "Arabic line" in with_ar


# ── unit: openings ─────────────────────────────────────────────────────────────

def test_opening_is_hebrew_always_arabic_on_request():
    for scenario_id in ALL_IDS:
        he, ar = scenario_opening(scenario_id, "A1", include_arabic=False)
        assert he and he.strip()
        assert ar is None
        he2, ar2 = scenario_opening(scenario_id, "A1", include_arabic=True)
        assert he2 and he2.strip()
        assert ar2 and ar2.strip()


# ── integration: engine path ──────────────────────────────────────────────────

def _fake_provider_result() -> ProviderResult:
    # A valid, level-appropriate Hebrew reply that ends with a question.
    return ProviderResult(
        answer="יפה מאוד! מה תרצה לשתות?",
        latency_seconds=0.01,
        input_tokens=20,
        output_tokens=8,
        provider="gemini",
        model="gemini-2.5-flash-lite",
    )


def test_scenario_request_reaches_llm_and_skips_cache(monkeypatch):
    from services import chat_engine

    calls: list[str] = []

    def fake_call(provider, model, system, question, options=None):
        calls.append(system)
        return _fake_provider_result()

    monkeypatch.setattr(chat_engine, "call_provider", fake_call)

    resp = chat_engine.generate_chat_response(
        ChatRequest(
            message="שלום",  # שלום
            level="A1",
            scenario="speaking",
            sessionId="scenario-test-1",
        )
    )

    assert calls, "scenario turn must reach the LLM"
    assert "ROLE-PLAY" in calls[0]  # the scenario prompt, not the generic tutor
    assert resp.fallbackUsed is False
    assert resp.cacheHit is False


def test_scenario_offtopic_does_not_dead_end(monkeypatch):
    """An off-topic line in scenario mode must NOT become OUT_OF_SCOPE."""
    from services import chat_engine

    monkeypatch.setattr(
        chat_engine, "call_provider", lambda *a, **k: _fake_provider_result()
    )

    # "how is the stock market today" — would be OUT_OF_SCOPE in normal A1 chat.
    resp = chat_engine.generate_chat_response(
        ChatRequest(
            message="איך הבורסה היום",
            level="A1",
            scenario="speaking",
            sessionId="scenario-test-2",
        )
    )

    assert resp.fallbackReason != "OUT_OF_SCOPE"
    assert resp.fallbackUsed is False
