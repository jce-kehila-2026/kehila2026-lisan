from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.answer_templates import render_correction, render_known_phrase, render_word_meaning
from services.chat_intents import detect_intent, extract_hebrew_part, has_arabic
from services.chat_schemas import ChatRequest, RetrievalContext
from services.chat_engine import generate_chat_response
from services.curriculum_index import build_curriculum_index, search_curriculum
from services.fuzzy_vocab import best_vocab_match
from services.llm_gatekeeper import decide_local_answer
from services.offline_embeddings_index import get_offline_embeddings_status
from services.prompt_budgeter import estimate_tokens, fit_text_to_budget
from services.prompt_cache_by_intent import (
    get_intent_cached_response,
    store_intent_cached_response,
)
from services.response_policy import get_bool, get_float, get_int
from services.retrieval_scorer import filter_retrieval_context


def test_intents_handle_arabic_hebrew_mixed_text():
    message = "شو يعني בית؟"
    intent = detect_intent(message)
    assert intent is not None
    assert intent.name == "WORD_MEANING"
    assert intent.target_word == "בית"
    assert has_arabic(message)
    assert extract_hebrew_part(message) == "בית"


def test_answer_templates_cover_common_local_tasks():
    meaning = render_word_meaning("בית")
    assert meaning is not None
    assert "בית" in meaning.answer_he
    assert meaning.answer_ar
    assert render_known_phrase("נעים מאוד", "A2") is not None
    assert render_correction("תקן אני רוצים") is not None


def test_llm_gatekeeper_returns_no_llm_answer_for_word_meaning():
    decision = decide_local_answer("شو يعني בית؟", "A1")
    assert decision is not None
    assert decision.needs_llm is False
    assert decision.template.cache_intent == "meaning:בית"


def test_chat_pipeline_uses_gatekeeper_before_provider():
    response = generate_chat_response(
        ChatRequest(message="شو يعني בית؟", level="A1", includeArabic=True, sessionId="free-quality-gate")
    )
    assert response.fallbackUsed is False
    assert response.routerHit is True
    assert response.answerAr


def test_prompt_budgeter_trims_context_without_tiktoken():
    long_text = "\n".join(f"שורה {index} עם הרבה מילים" for index in range(100))
    trimmed, meta = fit_text_to_budget(long_text, budget_tokens=30)
    assert trimmed
    assert meta.trimmed is True
    assert estimate_tokens(trimmed) <= 40


def test_retrieval_scorer_filters_weak_context():
    context = RetrievalContext(
        chunk_ids=["a", "b"],
        context_text="too much context",
        chunks_count=2,
        relevance_scores=[0.01, 0.9],
    )
    filtered = filter_retrieval_context(context)
    assert filtered.chunk_ids == ["b"]
    assert filtered.context_text == ""


def test_fuzzy_vocab_has_free_fallback():
    assert best_vocab_match("ביית", {"בית", "מים"}) == "בית"


def test_intent_cache_reuses_response_object():
    response = generate_chat_response(ChatRequest(message="מה זה אומר בית?", level="A1"))
    key = "meaning:בית"
    store_intent_cached_response(key, response)
    cached = get_intent_cached_response(key)
    assert cached is not None
    assert cached.cacheHit is True


def test_response_policy_is_loaded_from_file():
    assert get_bool("allow_arabic_support") is True
    assert get_int("prompt_token_budget") > 0
    assert get_float("min_retrieval_score") >= 0


def test_curriculum_index_builds_and_searches(tmp_path: Path):
    index_path = tmp_path / "curriculum.sqlite"
    build_curriculum_index(index_path=index_path, levels=["A1"])
    assert index_path.exists()
    assert isinstance(search_curriculum("איפה", level="A1", index_path=index_path), list)


def test_offline_embeddings_status_is_free_local():
    status = get_offline_embeddings_status()
    assert status.available is True
    assert status.backend


def test_expected_behavior_dataset_is_valid_jsonl():
    dataset = Path(__file__).resolve().parents[1] / "evals" / "eval_expected_behavior.jsonl"
    rows = [json.loads(line) for line in dataset.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(rows) >= 5
    assert all("message" in row for row in rows)


def test_instructor_structured_call(monkeypatch):
    pytest.importorskip("instructor")
    monkeypatch.setenv("OPENAI_API_KEY", "fake-key")
    from pydantic import BaseModel
    from services.chat_provider import call_provider_structured
    
    class UserIntentSchema(BaseModel):
        intent: str
        confidence: float
        
    class MockCompletions:
        def create(self, **kwargs):
            return UserIntentSchema(intent="WORD_MEANING", confidence=0.95)
            
    class MockChat:
        completions = MockCompletions()
        
    class MockClient:
        chat = MockChat()
        
    monkeypatch.setattr("instructor.from_openai", lambda *args, **kwargs: MockClient())
    
    res = call_provider_structured(
        provider="openai",
        model="gpt-4",
        system_message="Classify intent.",
        question="What is the meaning of life?",
        response_model=UserIntentSchema,
    )
    assert res.intent == "WORD_MEANING"
    assert res.confidence == 0.95
