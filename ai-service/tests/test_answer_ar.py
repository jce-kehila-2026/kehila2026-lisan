"""
test_answer_ar.py

The LLM path must deliver an Arabic gloss (answerAr) when the learner asked for
Arabic help (includeArabic=True) — the 50-session audit found answerAr was
always None on the model path.
"""
from __future__ import annotations

from unittest.mock import patch

from services import chat_engine as ce
from services.chat_engine import _extract_arabic_gloss
from services.chat_provider import ProviderResult
from services.chat_schemas import ChatRequest


def _result(answer: str) -> ProviderResult:
    return ProviderResult(
        answer=answer,
        latency_seconds=0.01,
        input_tokens=10,
        output_tokens=5,
        provider="gemini",
        model="gemini-2.5-flash-lite",
    )


def test_extract_arabic_gloss():
    assert _extract_arabic_gloss("שלום!\nAR: مرحبا بكِ!") == "مرحبا بكِ!"
    assert _extract_arabic_gloss("יופי!\nمرحبا بك") == "مرحبا بك"  # no marker
    assert _extract_arabic_gloss("שלום! מה שלומך?") is None       # hebrew only


def test_llm_answer_ar_populated_when_requested(monkeypatch):
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)

    def fake(*a, **k):
        return _result("נעים מאוד! מה שלומך?\nAR: تشرفنا! كيف حالك؟")

    with patch.object(ce, "call_provider", side_effect=fake):
        r = ce.generate_chat_response(
            ChatRequest(
                message="ספרי לי על ירושלים",
                level="A1",
                includeArabic=True,
                sessionId="ar-1",
            )
        )
    assert r.fallbackUsed is False
    assert r.answerHe and "AR:" not in r.answerHe   # gloss stripped from Hebrew
    assert r.answerAr and "حال" in r.answerAr        # gloss delivered separately


def test_no_answer_ar_when_not_requested(monkeypatch):
    monkeypatch.delenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", raising=False)

    def fake(*a, **k):
        return _result("נעים מאוד! מה שלומך?")

    with patch.object(ce, "call_provider", side_effect=fake):
        r = ce.generate_chat_response(
            ChatRequest(
                message="ספרי לי על ירושלים",
                level="A1",
                includeArabic=False,
                sessionId="ar-2",
            )
        )
    assert r.answerAr is None
