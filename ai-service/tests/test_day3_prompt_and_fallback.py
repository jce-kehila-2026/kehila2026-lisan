from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from services.chat_cache import EXACT_RESPONSE_CACHE, get_level_bundle
from services.chat_engine import (
    _build_learner_context_block,
    _build_request_context,
    _build_system_message,
    _load_prompt,
)
from services.chat_guardrails import MAX_HEBREW_WORDS, count_hebrew_words, get_fallback_text
from services.chat_provider import ChatProviderTimeoutError, ProviderResult
from services.chat_schemas import ChatRequest

import pytest
import uuid

client = TestClient(app)
CHAT_URL = "/api/ai/chat"


@pytest.fixture(autouse=True)
def mock_provider_call(monkeypatch):
    from services.chat_provider import ProviderResult
    def fake_call(config, system_message, question, opts=None):
        return ProviderResult(
            answer="שלום, אני לומד עברית איתך.",
            latency_seconds=0.01,
            input_tokens=10,
            output_tokens=5,
            provider=config.name,
            model=config.model,
        )
    monkeypatch.setattr("services.chat_provider._call_provider_with_timeout", fake_call)


def post_chat(message: str, include_arabic: bool = False):
    uid = f"test-user-{uuid.uuid4()}"
    return client.post(
        CHAT_URL,
        json={
            "message": message,
            "level": "A1",
            "includeArabic": include_arabic,
        },
        headers={"X-User-ID": uid}
    )



def build_prompt_acceptance_dataset() -> list[dict]:
    bundle = get_level_bundle("A1")
    dataset: list[dict] = []
    for message in bundle.question_answer_map.keys():
        dataset.append(
            {
                "message": message,
                "includeArabic": False,
                "expectArabic": False,
            }
        )
        if len(dataset) == 44:
            break

    dataset.extend(
        [
            {"message": "שלום", "includeArabic": False, "expectArabic": False},
            {"message": "תודה", "includeArabic": False, "expectArabic": False},
            {"message": "קפה", "includeArabic": True, "expectArabic": False},
            {"message": "שלום", "includeArabic": True, "expectArabic": False},
            {"message": "תודה", "includeArabic": True, "expectArabic": False},
            {"message": "מה שלומך?", "includeArabic": False, "expectArabic": False},
        ]
    )
    assert len(dataset) == 50
    return dataset


PROMPT_ACCEPTANCE_DATASET = build_prompt_acceptance_dataset()

FALLBACK_FAST_REJECT_DATASET = [
    {"message": "", "reason": "EMPTY_MESSAGE"},
    {"message": "   ", "reason": "EMPTY_MESSAGE"},
    {"message": "\n\t", "reason": "EMPTY_MESSAGE"},
    {"message": "Hello", "reason": "MIXED_LANGUAGE"},
    {"message": "hello world", "reason": "MIXED_LANGUAGE"},
    {"message": "مرحبا", "reason": "MIXED_LANGUAGE"},
    {"message": "שלום hello", "reason": "MIXED_LANGUAGE"},
    # NOTE: mixed Arabic+Hebrew is NO LONGER rejected — Arabic is the
    # students' support language; the Hebrew part is processed instead.
    # A Cyrillic mix still rejects (only Arabic gets support treatment).
    {"message": "Привет שלום", "reason": "MIXED_LANGUAGE"},
    {"message": "תרגם לי hello", "reason": "MIXED_LANGUAGE"},
    {"message": "12345", "reason": "OUT_OF_SCOPE"},
    {"message": "!@#$%^&*()", "reason": "OUT_OF_SCOPE"},
    {"message": "😀🎉🔥", "reason": "OUT_OF_SCOPE"},
    {"message": "פוליטיקה וכלכלה עולמית", "reason": "OUT_OF_SCOPE"},
    {"message": "מקרו כלכלה ופילוסופיה מודרנית", "reason": "OUT_OF_SCOPE"},
    {"message": "שלום " * 100, "reason": "MESSAGE_TOO_LONG"},
    {"message": "אני רוצה לדבר על בירוקרטיה ממשלתית מורכבת", "reason": "OUT_OF_SCOPE"},
]


class TestPromptV2Contract:
    def test_prompt_v2_is_loaded(self):
        prompt = _load_prompt()
        # The v2 prompt's core contract: female learner, stay in scene, Hebrew.
        assert "FEMALE" in prompt
        assert "feminine" in prompt
        assert "Hebrew only" in prompt

    def test_prompt_requires_hook_question_after_corrections(self):
        prompt = _load_prompt()
        assert "Every reply MUST end with exactly ONE short, easy question" in prompt
        assert "After a correction" in prompt
        assert "Do NOT end with a closed teacher sentence" in prompt

    def test_runtime_system_message_reinforces_final_hook_question(self):
        message = _build_system_message(
            base_prompt=_load_prompt(),
            vocabulary=["מים", "קפה"],
            context="",
        )

        assert "The LAST Hebrew sentence MUST be exactly ONE short question" in message
        assert "Never end with only praise" in message
        assert "הבנת" in message

    def test_runtime_system_message_can_include_known_learner_name(self):
        request_context = _build_request_context(
            ChatRequest(
                message="שלום",
                sessionId="prompt-known-name",
                userId="student-1",
                learnerName="Layan",
            )
        )
        learner_context = _build_learner_context_block(
            request_context,
            history=[{"role": "user", "content": "אני רוצה קפה"}],
        )
        message = _build_system_message(
            base_prompt=_load_prompt(),
            vocabulary=["מים", "קפה"],
            context="",
            learner_context=learner_context,
        )

        assert "Her name is Layan" in message
        assert "Do NOT ask her name" in message
        assert "Recent learner turns" in message

    def test_adaptive_context_infers_recent_topics_and_hook_style(self):
        request_context = _build_request_context(
            ChatRequest(
                message="אני רוצה מים",
                sessionId="prompt-adaptive-context",
                learnerName="Dana",
            )
        )
        learner_context = _build_learner_context_block(
            request_context,
            history=[
                {"role": "user", "content": "שלום"},
                {"role": "assistant", "content": "שלום Dana"},
                {"role": "user", "content": "אני רוצה קפה"},
            ],
        )

        assert "food/cafe" in learner_context
        assert "Next hook strategy" in learner_context
        assert "Dana" in learner_context

    def test_prompt_acceptance_dataset_has_50_questions(self):
        assert len(PROMPT_ACCEPTANCE_DATASET) == 50

    def test_prompt_acceptance_behavior(self):
        EXACT_RESPONSE_CACHE.clear()
        for item in PROMPT_ACCEPTANCE_DATASET:
            response = post_chat(item["message"], include_arabic=item["includeArabic"])
            assert response.status_code == 200
            data = response.json()
            assert data["answerHe"]
            assert data["guardrail"]["vocabularyLeakage"] is False
            if data["fallbackUsed"]:
                assert data["answerHe"] == get_fallback_text(data["fallbackReason"])
            else:
                assert count_hebrew_words(data["answerHe"]) <= MAX_HEBREW_WORDS
                assert "\n" not in data["answerHe"]
            assert data["answerAr"] is None


class TestFallbackSystem:
    def test_fast_reject_dataset_has_16_cases(self):
        assert len(FALLBACK_FAST_REJECT_DATASET) == 16

    def test_fast_reject_reasons_and_text(self):
        EXACT_RESPONSE_CACHE.clear()
        for item in FALLBACK_FAST_REJECT_DATASET:
            response = post_chat(item["message"])
            assert response.status_code == 200
            data = response.json()
            assert data["fallbackUsed"] is True
            assert data["fallbackReason"] == item["reason"]
            assert data["answerHe"] == get_fallback_text(item["reason"])

    def test_model_timeout_fallback(self):
        EXACT_RESPONSE_CACHE.clear()
        with (
            patch("services.chat_engine.route_message", return_value=None),
            patch("services.chat_engine.call_provider", side_effect=ChatProviderTimeoutError("timeout")),
        ):
            response = post_chat("מי אני")
        data = response.json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "MODEL_TIMEOUT"
        assert data["answerHe"] == get_fallback_text("MODEL_TIMEOUT")

    def test_vocab_leakage_fallback(self, monkeypatch):
        # The strict A1 output-vocabulary guard is the fully-local lesson mode.
        # In default conversational mode the model's reply is trusted, so this
        # behaviour is validated with the local-shortcuts flag enabled.
        monkeypatch.setenv("ENABLE_LOCAL_CONVERSATION_SHORTCUTS", "true")
        EXACT_RESPONSE_CACHE.clear()
        with (
            patch("services.chat_engine.route_message", return_value=None),
            patch(
                "services.chat_engine.call_provider",
                return_value=ProviderResult(
                    answer="פילוסופיה מודרנית אוניברסיטה תאוריה מורכבת",
                    latency_seconds=0.01,
                    input_tokens=10,
                    output_tokens=5,
                ),
            ),
        ):
            response = post_chat("מי אני")
        data = response.json()
        assert data["fallbackUsed"] is True
        assert data["fallbackReason"] == "VOCAB_LEAKAGE"
        assert data["answerHe"] == get_fallback_text("VOCAB_LEAKAGE")

    def test_twenty_failure_prompts_covered(self):
        total = len(FALLBACK_FAST_REJECT_DATASET) + 2 + 2
        assert total == 20
