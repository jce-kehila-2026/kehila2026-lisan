from __future__ import annotations

from services.chat_guardrails import classify_fast_reject
from services.complexity_checker import check_complexity, is_too_complex_for_level


def test_a1_rejects_advanced_vocabulary_by_complexity_not_topic_name():
    decision = check_complexity("מה זה קריפטו", "A1")
    assert decision.too_complex is True
    assert decision.estimated_rank > decision.allowed_rank
    assert classify_fast_reject("מה זה קריפטו", level="A1") == "OUT_OF_SCOPE"


def test_b2_allows_public_life_topics_that_a1_cannot_handle():
    assert classify_fast_reject("מה זה מניות", level="A1") == "OUT_OF_SCOPE"
    assert classify_fast_reject("מה זה מניות", level="B2") is None
    assert classify_fast_reject("מה זה פוליטיקה", level="B2") is None


def test_doctor_conversation_depends_on_level_complexity():
    assert is_too_complex_for_level("שיחה עם דוקטור במרפאה", "A1") is True
    assert classify_fast_reject("שיחה עם דוקטור במרפאה", level="B1") is None
    assert classify_fast_reject("שיחה עם דוקטור במרפאה", level="B2") is None


def test_simple_a1_daily_life_still_passes():
    assert classify_fast_reject("אני רוצה קפה", level="A1") is None
