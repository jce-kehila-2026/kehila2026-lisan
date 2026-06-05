"""
test_adaptive_guardrails.py

Tests for T6: Adaptive Guardrails.

Covers:
  - _get_config returns correct config for A1 and A2
  - Unknown-level falls back to A1 config
  - A1: is_clearly_out_of_scope triggers at lower thresholds
  - A2: is_clearly_out_of_scope is more lenient (same input passes)
  - A1: evaluate_vocabulary enforces strict vocab list
  - A2: evaluate_vocabulary skips vocab check (vocab_strict=False)
  - get_max_words_for_level returns correct caps
  - get_max_message_length_for_level returns correct caps
  - A1 config: vocab_strict is True
  - A2 config: vocab_strict is False
"""
from __future__ import annotations

import os

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from services.chat_guardrails import (
    _get_config,
    _LEVEL_CONFIGS,
    evaluate_vocabulary,
    get_max_message_length_for_level,
    get_max_words_for_level,
    is_clearly_out_of_scope,
)


# ---------------------------------------------------------------------------
# Config lookup
# ---------------------------------------------------------------------------

class TestLevelConfigLookup:
    def test_a1_config_exists(self):
        cfg = _get_config("A1")
        assert cfg is _LEVEL_CONFIGS["A1"]

    def test_a2_config_exists(self):
        cfg = _get_config("A2")
        assert cfg is _LEVEL_CONFIGS["A2"]

    def test_unknown_level_returns_a1_config(self):
        cfg = _get_config("B1")
        assert cfg is _LEVEL_CONFIGS["A1"]

    def test_none_level_returns_a1_config(self):
        cfg = _get_config(None)
        assert cfg is _LEVEL_CONFIGS["A1"]

    def test_lowercase_a1_works(self):
        cfg = _get_config("a1")
        assert cfg is _LEVEL_CONFIGS["A1"]

    def test_a1_vocab_strict_true(self):
        assert _LEVEL_CONFIGS["A1"].vocab_strict is True

    def test_a2_vocab_strict_false(self):
        assert _LEVEL_CONFIGS["A2"].vocab_strict is False

    def test_a2_thresholds_higher_than_a1(self):
        a1 = _LEVEL_CONFIGS["A1"]
        a2 = _LEVEL_CONFIGS["A2"]
        assert a2.oos_all_unknown_min > a1.oos_all_unknown_min
        assert a2.oos_unknown_ratio >= a1.oos_unknown_ratio
        assert a2.oos_advanced_no_known > a1.oos_advanced_no_known
        assert a2.max_hebrew_words > a1.max_hebrew_words
        assert a2.max_message_length > a1.max_message_length


# ---------------------------------------------------------------------------
# get_max_words_for_level / get_max_message_length_for_level
# ---------------------------------------------------------------------------

class TestLevelHelpers:
    def test_a1_max_words(self):
        assert get_max_words_for_level("A1") == _LEVEL_CONFIGS["A1"].max_hebrew_words

    def test_a2_max_words_greater(self):
        assert get_max_words_for_level("A2") > get_max_words_for_level("A1")

    def test_a1_max_message_length(self):
        assert get_max_message_length_for_level("A1") == _LEVEL_CONFIGS["A1"].max_message_length

    def test_a2_max_message_length_greater(self):
        assert get_max_message_length_for_level("A2") > get_max_message_length_for_level("A1")

    def test_unknown_level_same_as_a1(self):
        assert get_max_words_for_level("C1") == get_max_words_for_level("A1")


# ---------------------------------------------------------------------------
# is_clearly_out_of_scope — A1 vs A2 behaviour
# ---------------------------------------------------------------------------

# Small known vocab set shared across tests
_KNOWN = {"שלום", "מה", "שמך", "אני", "גר", "פה"}
_ADVANCED: set[str] = set()


class TestOosA1Strict:
    def test_three_unknown_words_triggers_oos_a1(self):
        # 3 words, all unknown at A1 → triggers (oos_all_unknown_min=3)
        result = is_clearly_out_of_scope("פרלמנט אוניברסיטה מדינה", _KNOWN, _ADVANCED, level="A1")
        assert result is True

    def test_two_unknown_words_not_oos_a1(self):
        # Only 2 unknown tokens — below min=3 → not OOS
        result = is_clearly_out_of_scope("פרלמנט אוניברסיטה", _KNOWN, _ADVANCED, level="A1")
        assert result is False

    def test_high_unknown_ratio_triggers_oos_a1(self):
        # 4 tokens, 3 unknown (75%) ≥ 50% threshold + len≥4 → OOS
        result = is_clearly_out_of_scope("שלום פרלמנט אוניברסיטה טכנולוגיה", _KNOWN, _ADVANCED, level="A1")
        assert result is True

    def test_mostly_known_not_oos_a1(self):
        # 3 tokens, all known → not OOS
        result = is_clearly_out_of_scope("שלום מה שמך", _KNOWN, _ADVANCED, level="A1")
        assert result is False


class TestOosA2Lenient:
    def test_three_unknown_words_not_oos_a2(self):
        # 3 tokens all unknown — below A2 min (5) → NOT OOS
        result = is_clearly_out_of_scope("פרלמנט אוניברסיטה מדינה", _KNOWN, _ADVANCED, level="A2")
        assert result is False

    def test_four_unknown_words_not_oos_a2(self):
        # 4 tokens all unknown — still below A2 min (5) → NOT OOS
        result = is_clearly_out_of_scope("פרלמנט אוניברסיטה מדינה קומוניזם", _KNOWN, _ADVANCED, level="A2")
        assert result is False

    def test_five_unknown_words_oos_a2(self):
        # 5 tokens all unknown — hits A2 threshold → OOS
        result = is_clearly_out_of_scope(
            "פרלמנט אוניברסיטה מדינה קומוניזם טכנולוגיה",
            _KNOWN, _ADVANCED, level="A2"
        )
        assert result is True

    def test_a1_triggers_where_a2_does_not(self):
        # 3 tokens all unknown: OOS at A1 but not at A2
        msg = "פרלמנט אוניברסיטה מדינה"
        assert is_clearly_out_of_scope(msg, _KNOWN, _ADVANCED, level="A1") is True
        assert is_clearly_out_of_scope(msg, _KNOWN, _ADVANCED, level="A2") is False


# ---------------------------------------------------------------------------
# evaluate_vocabulary — A1 strict vs A2 lenient
# ---------------------------------------------------------------------------

_VOCAB = ["שלום", "מה", "שמך", "אני", "גר", "פה", "טוב"]


class TestEvaluateVocabA1Strict:
    def test_unknown_word_blocked_at_a1(self):
        # "אוניברסיטה" is not in _VOCAB → blocked at A1
        decision = evaluate_vocabulary("שלום אוניברסיטה", _VOCAB, level="A1")
        assert decision.fallback_used is False
        assert decision.fallback_reason is None
        assert "אוניברסיטה" in decision.blocked_tokens

    def test_dominated_unknown_sentence_blocked_at_a1(self):
        answer = (
            "\u05e4\u05d9\u05dc\u05d5\u05e1\u05d5\u05e4\u05d9\u05d4 "
            "\u05de\u05d5\u05d3\u05e8\u05e0\u05d9\u05ea "
            "\u05d0\u05d5\u05e0\u05d9\u05d1\u05e8\u05e1\u05d9\u05d8\u05d4 "
            "\u05ea\u05d0\u05d5\u05e8\u05d9\u05d4 "
            "\u05de\u05d5\u05e8\u05db\u05d1\u05ea"
        )
        decision = evaluate_vocabulary(answer, _VOCAB, level="A1")
        assert decision.fallback_used is True
        assert decision.fallback_reason == "VOCAB_LEAKAGE"

    def test_all_known_passes_at_a1(self):
        decision = evaluate_vocabulary("שלום טוב", _VOCAB, level="A1")
        assert decision.fallback_used is False
        assert decision.blocked_tokens == []

    def test_empty_answer_not_blocked_a1(self):
        decision = evaluate_vocabulary("", _VOCAB, level="A1")
        assert decision.fallback_used is False


class TestEvaluateVocabA2Lenient:
    def test_unknown_word_not_blocked_at_a2(self):
        # vocab_strict=False at A2 → no blocking regardless of word
        decision = evaluate_vocabulary("שלום אוניברסיטה", _VOCAB, level="A2")
        assert decision.fallback_used is False
        assert decision.blocked_tokens == []

    def test_completely_unknown_sentence_not_blocked_at_a2(self):
        decision = evaluate_vocabulary("פרלמנט קומוניזם טכנולוגיה", _VOCAB, level="A2")
        assert decision.fallback_used is False

    def test_a1_blocks_what_a2_allows(self):
        answer = "שלום אוניברסיטה"
        a1_decision = evaluate_vocabulary(answer, _VOCAB, level="A1")
        a2_decision = evaluate_vocabulary(answer, _VOCAB, level="A2")
        assert a1_decision.fallback_used is False
        assert a1_decision.blocked_tokens
        assert a2_decision.fallback_used is False
