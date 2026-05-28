"""
test_grammar_rules.py

Tests for T5: Dynamic Grammar Retrieval.

Covers:
  - detect_grammar_errors returns [] for empty / non-Hebrew input
  - Masculine pronoun + feminine verb → GENDER_VERB error
  - Feminine pronoun + masculine verb → GENDER_VERB error
  - Plural pronoun + singular verb → PLURAL_VERB error
  - Feminine noun + masculine adjective → GENDER_ADJ error
  - Masculine noun + feminine adjective → GENDER_ADJ error
  - Identical-form verbs (e.g. רוצה) are not flagged
  - At most one error returned
  - build_grammar_hint returns "" when no errors
  - build_grammar_hint returns bracketed instruction when errors present
  - Hint text instructs LLM not to mention error to student
  - chat_engine._build_system_message includes grammar hint when provided
  - grammar hint injected into system message during generate_chat_response
"""
from __future__ import annotations

import os
import unittest.mock

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from services.grammar_rules import (
    GrammarError,
    build_grammar_hint,
    detect_grammar_errors,
)


# ---------------------------------------------------------------------------
# detect_grammar_errors — edge cases
# ---------------------------------------------------------------------------

class TestDetectGrammarErrorsEdgeCases:
    def test_empty_string_returns_empty(self):
        assert detect_grammar_errors("") == []

    def test_whitespace_only_returns_empty(self):
        assert detect_grammar_errors("   ") == []

    def test_none_returns_empty(self):
        assert detect_grammar_errors(None) == []  # type: ignore[arg-type]

    def test_non_hebrew_returns_empty(self):
        assert detect_grammar_errors("hello world") == []

    def test_single_word_returns_empty(self):
        assert detect_grammar_errors("גר") == []

    def test_correct_sentence_returns_empty(self):
        # הוא גר — masculine pronoun + masculine verb, correct
        assert detect_grammar_errors("הוא גר") == []

    def test_at_most_one_error_returned(self):
        # Both pronoun-verb and noun-adj errors in one sentence
        # "היא גר ילדה טוב" — fem pronoun + masc verb AND fem noun + masc adj
        errors = detect_grammar_errors("היא גר ילדה טוב")
        assert len(errors) <= 1


# ---------------------------------------------------------------------------
# GENDER_VERB errors — pronoun + verb
# ---------------------------------------------------------------------------

class TestGenderVerbErrors:
    def test_masc_pronoun_fem_verb_detected(self):
        # הוא גרה — masculine pronoun + feminine verb
        errors = detect_grammar_errors("הוא גרה")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_VERB"
        assert errors[0].found == "הוא גרה"
        assert errors[0].expected == "הוא גר"

    def test_atah_fem_verb_detected(self):
        # אתה גרה — masculine pronoun + feminine verb
        errors = detect_grammar_errors("אתה גרה")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_VERB"

    def test_fem_pronoun_masc_verb_detected(self):
        # היא גר — feminine pronoun + masculine verb
        errors = detect_grammar_errors("היא גר")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_VERB"
        assert errors[0].found == "היא גר"
        assert errors[0].expected == "היא גרה"

    def test_at_masc_verb_detected(self):
        # את עובד — feminine pronoun + masculine verb
        errors = detect_grammar_errors("את עובד")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_VERB"
        assert errors[0].expected == "את עובדת"

    def test_identical_form_verb_not_flagged(self):
        # רוצה is the same for masc and fem — should not be flagged
        # היא רוצה — correct (fem pronoun + same-form verb)
        errors = detect_grammar_errors("היא רוצה")
        assert errors == []

    def test_correct_masc_verb_not_flagged(self):
        # הוא עובד — correct
        errors = detect_grammar_errors("הוא עובד")
        assert errors == []

    def test_correct_fem_verb_not_flagged(self):
        # היא עובדת — correct
        errors = detect_grammar_errors("היא עובדת")
        assert errors == []

    def test_masc_pronoun_masc_verb_correct(self):
        # הוא לומד — correct
        errors = detect_grammar_errors("הוא לומד")
        assert errors == []

    def test_hint_text_present(self):
        errors = detect_grammar_errors("היא גר")
        assert errors
        assert "גרה" in errors[0].hint
        assert "גר" in errors[0].hint


# ---------------------------------------------------------------------------
# PLURAL_VERB errors — plural pronoun + singular verb
# ---------------------------------------------------------------------------

class TestPluralVerbErrors:
    def test_hem_singular_verb_detected(self):
        # הם גר — plural pronoun + singular verb
        errors = detect_grammar_errors("הם גר")
        assert len(errors) == 1
        assert errors[0].code == "PLURAL_VERB"
        assert "הם" in errors[0].found
        assert "גר" in errors[0].found

    def test_hen_singular_verb_detected(self):
        errors = detect_grammar_errors("הן עובד")
        assert len(errors) == 1
        assert errors[0].code == "PLURAL_VERB"

    def test_anachnu_singular_verb_detected(self):
        errors = detect_grammar_errors("אנחנו לומד")
        assert len(errors) == 1
        assert errors[0].code == "PLURAL_VERB"

    def test_hint_mentions_plural_form(self):
        errors = detect_grammar_errors("הם גר")
        assert errors
        assert "plural" in errors[0].hint.lower() or "הם" in errors[0].hint


# ---------------------------------------------------------------------------
# GENDER_ADJ errors — noun + adjective
# ---------------------------------------------------------------------------

class TestGenderAdjErrors:
    def test_fem_noun_masc_adj_detected(self):
        # ילדה טוב — feminine noun + masculine adjective
        errors = detect_grammar_errors("ילדה טוב")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_ADJ"
        assert errors[0].found == "ילדה טוב"
        assert errors[0].expected == "ילדה טובה"

    def test_fem_noun_masc_adj_gdol(self):
        errors = detect_grammar_errors("אישה גדול")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_ADJ"
        assert "גדולה" in errors[0].expected

    def test_masc_noun_fem_adj_detected(self):
        # ילד טובה — masculine noun + feminine adjective
        errors = detect_grammar_errors("ילד טובה")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_ADJ"
        assert errors[0].found == "ילד טובה"
        assert errors[0].expected == "ילד טוב"

    def test_masc_noun_fem_adj_gdola(self):
        errors = detect_grammar_errors("בן גדולה")
        assert len(errors) == 1
        assert errors[0].code == "GENDER_ADJ"

    def test_correct_fem_agreement_not_flagged(self):
        # ילדה טובה — correct
        errors = detect_grammar_errors("ילדה טובה")
        assert errors == []

    def test_correct_masc_agreement_not_flagged(self):
        # ילד טוב — correct
        errors = detect_grammar_errors("ילד טוב")
        assert errors == []

    def test_identical_form_adj_not_flagged(self):
        # יפה is same for masc and fem — should not be flagged
        errors = detect_grammar_errors("ילדה יפה")
        assert errors == []

    def test_hint_mentions_gender(self):
        errors = detect_grammar_errors("ילדה טוב")
        assert errors
        assert "feminine" in errors[0].hint or "ילדה" in errors[0].hint


# ---------------------------------------------------------------------------
# build_grammar_hint
# ---------------------------------------------------------------------------

class TestBuildGrammarHint:
    def test_empty_list_returns_empty_string(self):
        assert build_grammar_hint([]) == ""

    def test_hint_contains_grammar_note_prefix(self):
        errors = detect_grammar_errors("היא גר")
        hint = build_grammar_hint(errors)
        assert hint.startswith("[Grammar note")

    def test_hint_instructs_not_to_mention_to_student(self):
        errors = detect_grammar_errors("היא גר")
        hint = build_grammar_hint(errors)
        assert "do not mention" in hint

    def test_hint_contains_correction(self):
        errors = detect_grammar_errors("היא גר")
        hint = build_grammar_hint(errors)
        assert "גרה" in hint

    def test_hint_is_single_line(self):
        errors = detect_grammar_errors("היא גר")
        hint = build_grammar_hint(errors)
        assert "\n" not in hint


# ---------------------------------------------------------------------------
# Integration: grammar hint in system message
# ---------------------------------------------------------------------------

class TestGrammarHintInjection:
    def test_system_message_includes_hint(self):
        from services.chat_engine import _build_system_message

        hint = "[Grammar note — do not mention this to the student, but gently model the correct form: use גרה]"
        msg = _build_system_message(
            base_prompt="You are a Hebrew tutor.",
            vocabulary=["גר", "גרה", "היא"],
            context="lesson context",
            grammar_hint=hint,
        )
        assert hint in msg

    def test_system_message_no_hint_when_empty(self):
        from services.chat_engine import _build_system_message

        msg = _build_system_message(
            base_prompt="You are a Hebrew tutor.",
            vocabulary=["גר", "גרה"],
            context="lesson context",
            grammar_hint="",
        )
        assert "Grammar note" not in msg

    def test_grammar_hint_appended_in_generate_response(self):
        """Grammar hint from the student's input reaches the system prompt."""
        from services.chat_schemas import ChatRequest

        request = ChatRequest(message="היא גר", level="A1")

        captured: dict = {}

        def _fake_call_provider(provider, model, system_message, user_message, options=None):
            captured["system_message"] = system_message
            raise Exception("stop early")

        with (
            unittest.mock.patch("services.chat_engine.get_exact_cached_response", return_value=None),
            unittest.mock.patch("services.chat_engine.route_message", return_value=None),
            unittest.mock.patch("services.chat_engine.is_clearly_out_of_scope", return_value=False),
            unittest.mock.patch("services.chat_engine.call_provider", side_effect=_fake_call_provider),
        ):
            try:
                from services.chat_engine import generate_chat_response
                generate_chat_response(request)
            except Exception:
                pass

        assert "system_message" in captured, "call_provider was never reached"
        assert "Grammar note" in captured["system_message"]
        assert "גרה" in captured["system_message"]
