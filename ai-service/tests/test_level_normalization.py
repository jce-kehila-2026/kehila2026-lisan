from __future__ import annotations

import pytest

from services import chat_guardrails, curriculum
from services.levels import is_beginner_level, normalize_cefr_level


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("A1", "A1"),
        ("a2", "A2"),
        (" B1 ", "B1"),
        ("B2", "B2"),
        ("א1", "A1"),
        ("א2", "A2"),
        ("ב1", "B1"),
        ("ב2", "B2"),
        ("ג", "B2"),
        ("ג׳", "B2"),
        ("beginner", "A1"),
        ("Beginner", "A1"),
        ("C1", "A1"),
        ("", "A1"),
        (None, "A1"),
        ("garbage", "A1"),
    ],
)
def test_normalize_cefr_level(raw, expected):
    assert normalize_cefr_level(raw) == expected


@pytest.mark.parametrize("normalizer", [curriculum.normalize_level, chat_guardrails.normalize_level])
def test_module_normalizers_accept_hebrew_labels(normalizer):
    assert normalizer("א1") == "A1"
    assert normalizer("ג") == "B2"
    assert normalizer("beginner") == "A1"
    assert normalizer("unknown") == "A1"


def test_hebrew_beginner_labels_are_beginners():
    assert is_beginner_level("א1")
    assert is_beginner_level("א2")
    assert is_beginner_level("beginner")
    assert not is_beginner_level("ב1")
    assert not is_beginner_level("ג")


def test_evaluation_treats_hebrew_beginner_as_beginner():
    from services.evaluation import has_retry_worthy_correction

    corrections = [{"type": "grammar", "severity": "low"}]
    assert has_retry_worthy_correction(corrections, "א1", False) is True
    assert has_retry_worthy_correction(corrections, "beginner", False) is True
    assert has_retry_worthy_correction(corrections, "ב2", False) is False
    assert has_retry_worthy_correction(corrections, "ג", False) is False


def test_azure_policy_treats_hebrew_beginner_as_beginner():
    from routes.evaluation import decide_azure_pronunciation

    decision = decide_azure_pronunciation(
        level="א1",
        activity_mode="guided_conversation",
        analysis_depth="standard",
        user_requested_pronunciation_check=True,
        remaining_pronunciation_checks=10,
        has_audio=True,
        has_reference_text=True,
    )
    assert decision.should_use is False
