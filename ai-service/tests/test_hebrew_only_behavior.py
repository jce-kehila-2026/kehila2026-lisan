"""
Sprint 2 Hebrew-only behavior tests.

Run:
    cd ai-service
    python -m pytest tests/test_hebrew_only_behavior.py -v
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.chat_cache import EXACT_RESPONSE_CACHE

client = TestClient(app)
CHAT_URL = "/api/ai/chat"


def post_chat(message: str, include_arabic: bool = False):
    return client.post(
        CHAT_URL,
        json={
            "message": message,
            "level": "A1",
            "includeArabic": include_arabic,
        },
    )


@pytest.mark.parametrize(
    "message",
    [
        "مرحبا",
        "كيف الحال؟",
        "بدي أتعلم عبري",
    ],
)
def test_arabic_input_is_rejected(message: str):
    EXACT_RESPONSE_CACHE.clear()
    response = post_chat(message)
    data = response.json()

    assert response.status_code == 200
    assert data["fallbackUsed"] is True
    assert data["fallbackReason"] == "MIXED_LANGUAGE"
    assert data["answerAr"] is None


@pytest.mark.parametrize(
    "message",
    [
        "hello",
        "How do I say thank you?",
        "I want to practice Hebrew",
    ],
)
def test_english_input_is_rejected(message: str):
    EXACT_RESPONSE_CACHE.clear()
    response = post_chat(message)
    data = response.json()

    assert response.status_code == 200
    assert data["fallbackUsed"] is True
    assert data["fallbackReason"] == "MIXED_LANGUAGE"
    assert data["answerAr"] is None


@pytest.mark.parametrize(
    "message",
    [
        "שלום hello",
        "שלום مرحبا",
        "תודה thank you",
        "איך אומרים coffee?",
    ],
)
def test_mixed_language_input_is_rejected(message: str):
    EXACT_RESPONSE_CACHE.clear()
    response = post_chat(message)
    data = response.json()

    assert response.status_code == 200
    assert data["fallbackUsed"] is True
    assert data["fallbackReason"] == "MIXED_LANGUAGE"
    assert data["answerAr"] is None


@pytest.mark.parametrize(
    "message",
    [
        "שלום",
        "תודה",
        "קפה",
        "מה שלומך?",
        "מה השם שלך?",
    ],
)
def test_answer_ar_is_always_null_when_arabic_requested(message: str):
    EXACT_RESPONSE_CACHE.clear()
    response = post_chat(message, include_arabic=True)
    data = response.json()

    assert response.status_code == 200
    assert data["answerHe"]
    assert data["answerAr"] is None


def test_hebrew_only_cache_key_ignores_arabic_flag():
    EXACT_RESPONSE_CACHE.clear()

    first = post_chat("שלום", include_arabic=False).json()
    second = post_chat("שלום", include_arabic=True).json()

    assert first["answerAr"] is None
    assert second["answerAr"] is None
    assert second["cacheHit"] is True
