"""
test_scenario_robustness.py

Regression guards for the four failure modes observed in the 20 live scenario
conversations (evals/scenario_conversations.md). Each test targets the ROOT
cause, not the specific sentences that happened to trigger it:

  A. VOCAB_LEAKAGE killed price/place replies   → scenario now retries once for
     a Hebrew-only rewrite before degrading; digits (prices) are accepted.
  B. Replies truncated mid-word                 → Gemini 'thinking' disabled for
     flash models so the full token budget goes to the visible answer.
  C. MODEL_ERROR on trivial input               → an empty/blocked candidate is
     read safely (answer="") instead of raising → EMPTY_RESPONSE, not a
     provider error.
  D. CIRCUIT_OPEN cascade killed a session       → because (C) no longer raises a
     provider error, transient empties don't trip the circuit.
"""
from __future__ import annotations

import services.chat_provider as cp
from services.chat_provider import ProviderCallOptions, ProviderResult
from services.chat_schemas import ChatRequest


# ── B: Gemini thinking disabled for flash models ─────────────────────────────

def test_gemini_config_disables_thinking_for_flash():
    cfg = cp._build_gemini_config("sys", ProviderCallOptions(), "gemini-2.5-flash-lite")
    tc = getattr(cfg, "thinking_config", None)
    assert tc is not None and tc.thinking_budget == 0


def test_gemini_config_leaves_non_flash_models_untouched():
    cfg = cp._build_gemini_config("sys", ProviderCallOptions(), "gemini-2.5-pro")
    assert getattr(cfg, "thinking_config", None) is None


# ── C: empty/blocked candidate is read safely (no raise) ─────────────────────

class _RaisingTextResponse:
    """Mimics a genai response whose `.text` raises (MAX_TOKENS, no text part)."""
    candidates: list = []

    @property
    def text(self):
        raise ValueError("no text part in candidate")


class _PartsResponse:
    """Response with no top-level text but text inside candidate parts."""
    text = None

    class _Part:
        def __init__(self, t):
            self.text = t

    class _Content:
        def __init__(self, parts):
            self.parts = parts

    class _Cand:
        def __init__(self, parts):
            self.content = _PartsResponse._Content(parts)

    def __init__(self, chunks):
        self.candidates = [self._Cand([self._Part(c) for c in chunks])]


def test_safe_text_returns_empty_when_text_accessor_raises():
    assert cp._safe_response_text(_RaisingTextResponse()) == ""


def test_safe_text_recovers_from_candidate_parts():
    assert cp._safe_response_text(_PartsResponse(["שלום ", "עולם"])) == "שלום עולם"


# ── Engine-level scenario regressions ────────────────────────────────────────

def _result(answer: str) -> ProviderResult:
    return ProviderResult(
        answer=answer,
        latency_seconds=0.01,
        input_tokens=10,
        output_tokens=5,
        provider="gemini",
        model="gemini-2.5-flash-lite",
    )


def _scenario_request(message: str, session: str) -> ChatRequest:
    return ChatRequest(
        message=message, level="A1", scenario="speaking", sessionId=session
    )


def test_C_D_empty_output_is_empty_response_not_model_error(monkeypatch):
    """Empty model output → EMPTY_RESPONSE and the circuit stays closed."""
    from services import chat_engine
    from services.chat_provider import provider_circuit

    provider_circuit.reset()
    monkeypatch.setattr(chat_engine, "call_provider", lambda *a, **k: _result(""))

    resp = chat_engine.generate_chat_response(_scenario_request("שלום", "rob-empty"))

    assert resp.fallbackReason == "EMPTY_RESPONSE"
    assert resp.fallbackReason != "MODEL_ERROR"
    # D: a content-empty turn must NOT trip the provider circuit.
    assert provider_circuit.allow_request() is True


def test_A_leak_then_hebrew_retry_keeps_scene(monkeypatch):
    """A stray English fragment triggers ONE Hebrew-only retry, not a fallback."""
    from services import chat_engine

    calls = {"n": 0}

    def fake_call(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            return _result("Sure! קפה אחד. עוד משהו?")   # leaked English word
        return _result("בטח! קפה אחד. עוד משהו?")          # clean Hebrew retry

    monkeypatch.setattr(chat_engine, "call_provider", fake_call)

    resp = chat_engine.generate_chat_response(
        _scenario_request("אני רוצה קפה", "rob-leak")
    )

    assert calls["n"] == 2, "should retry exactly once on a leak"
    assert resp.fallbackUsed is False
    assert "קפה" in resp.answerHe


def test_A_persistent_leak_degrades_without_looping(monkeypatch):
    """If the leak persists, degrade once (no infinite retry, no cache loop)."""
    from services import chat_engine

    calls = {"n": 0}

    def fake_call(*a, **k):
        calls["n"] += 1
        return _result("Sorry, here is your coffee")  # always non-Hebrew

    monkeypatch.setattr(chat_engine, "call_provider", fake_call)

    resp = chat_engine.generate_chat_response(
        _scenario_request("אני רוצה קפה", "rob-leak2")
    )

    assert calls["n"] == 2, "exactly one retry, then degrade — never a loop"
    assert resp.fallbackUsed is True
    assert resp.fallbackReason == "VOCAB_LEAKAGE"


def test_A_price_with_digits_is_accepted(monkeypatch):
    """A waiter/shop reply with a numeric price must pass (digits are allowed)."""
    from services import chat_engine

    monkeypatch.setattr(
        chat_engine,
        "call_provider",
        lambda *a, **k: _result("זה עולה 10 שקלים. עוד משהו?"),
    )

    resp = chat_engine.generate_chat_response(
        _scenario_request("כמה זה עולה?", "rob-price")
    )

    assert resp.fallbackUsed is False
    assert "10" in resp.answerHe
