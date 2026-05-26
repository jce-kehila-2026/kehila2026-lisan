from __future__ import annotations

from services.pronunciation import VALIDATOR
from services.pronunciation import assess_pronunciation


def test_validate_word_exact_match():
    result = VALIDATOR.validate_word("\u05e9\u05dc\u05d5\u05dd", "A1")
    assert result["valid"] is True
    assert result["feedback"] == "exact_match"


def test_validate_word_similar_match():
    result = VALIDATOR.validate_word("\u05e9\u05dc\u05d5\u05de", "A1")
    assert result["valid"] is False
    assert result["feedback"] == "similar_match"
    assert "\u05e9\u05dc\u05d5\u05dd" in result["suggestions"]


def test_validate_word_not_found():
    result = VALIDATOR.validate_word("\u05de\u05d8\u05d5\u05e1", "A1")
    assert result["valid"] is False
    assert result["feedback"] == "not_found"
    assert result["suggestions"] == []


def test_assess_pronunciation_rejects_unapproved_reference_before_azure():
    result = assess_pronunciation(b"fake-audio", "\u05de\u05d8\u05d5\u05e1", "A1")
    assert result["success"] is False
    assert result["error"] == "Reference text contains words outside approved vocabulary"
    assert result["validation"]["valid"] is False
