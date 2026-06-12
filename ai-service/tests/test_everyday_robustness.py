"""
test_everyday_robustness.py

Regression guards for the three problem CLASSES surfaced by the 200-turn manual
simulation — tested with INPUTS THAT ARE NOT in any other test or simulation,
so they verify the GENERAL behaviour, not memorised phrases:

  1. Everyday survival sentences (new words for the level) must be handled
     locally and NOT rejected as OUT_OF_SCOPE.
  2. Politeness / function words must NOT be treated as "a new word to practice"
     ("כתבת מילה חדשה").
  3. Genuinely bad input (English, empty, mixed-script) must STILL be rejected.

All provider calls are stubbed so these never depend on Gemini quota.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from services.chat_engine import generate_chat_response
from services.chat_provider import ProviderResult
from services.chat_schemas import ChatRequest


def _stub_provider(*args, **kwargs):
    # If anything reaches the LLM, return a benign Hebrew reply so the test
    # exercises routing, never the network/quota.
    return ProviderResult(
        answer="יפה מאוד. בוא נמשיך. מה זה בית?",
        latency_seconds=0.01,
        input_tokens=10,
        output_tokens=8,
        provider="gemini",
        model="gemini-2.5-flash-lite",
    )


# Everyday sentences a beginner really types — deliberately DIFFERENT from the
# simulation set, mixing in words above strict A1 (עייף, עזרה, בטן, עבודה ...).
EVERYDAY_SENTENCES = [
    "אני עייף היום",
    "יש לי שאלה",
    "אני צריך עזרה",
    "המים קרים מאוד",
    "אני רוצה לישון",
    "אני מחפש עבודה",
    "אני גר קרוב לים",
    "יש לי שני ילדים",
    "אני אוהב לאכול פירות",
    "הבית שלי גדול",
]


@pytest.mark.parametrize("message", EVERYDAY_SENTENCES)
def test_everyday_sentence_is_not_out_of_scope(message):
    with patch("services.chat_engine.call_provider", side_effect=_stub_provider):
        resp = generate_chat_response(ChatRequest(message=message, level="A1"))
    assert resp.fallbackReason != "OUT_OF_SCOPE", (
        f"everyday sentence wrongly rejected as out-of-scope: {message!r}"
    )


# Politeness / function words — the CLASS, not just the three that were patched.
POLITENESS_WORDS = [
    "תודה", "תודה רבה", "שלום", "בבקשה", "סליחה",
    "להתראות", "ביי", "אוקיי", "בסדר", "כן", "לא",
]


@pytest.mark.parametrize("message", POLITENESS_WORDS)
def test_politeness_word_is_not_treated_as_new_word(message):
    with patch("services.chat_engine.call_provider", side_effect=_stub_provider):
        resp = generate_chat_response(ChatRequest(message=message, level="A1"))
    # The bug signature is the single-new-word label "כתבת מילה חדשה: X".
    # ("עכשיו נתרגל מילה חדשה" is a fine transition, not a mislabel.)
    assert "כתבת מילה חדשה" not in (resp.answerHe or ""), (
        f"politeness/function word treated as a new vocabulary word: {message!r}"
    )


# Genuinely bad input must still be refused.
HARD_REJECTS = [
    ("hello how are you", "EN sentence"),
    ("", "empty"),
    ("שלום hello", "mixed Hebrew+Latin"),
    ("123 456", "digits only"),
]


@pytest.mark.parametrize("message,label", HARD_REJECTS)
def test_bad_input_is_still_rejected(message, label):
    with patch("services.chat_engine.call_provider", side_effect=_stub_provider):
        resp = generate_chat_response(ChatRequest(message=message, level="A1"))
    assert resp.fallbackUsed is True, f"bad input not rejected ({label}): {message!r}"
