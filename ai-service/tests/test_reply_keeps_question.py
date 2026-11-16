"""The tutor's closing question must survive reply trimming.

Regression: voice replies were cut to the first two sentences and long replies
were cut from the end, so "praise. correction. question?" lost its question and
the conversation died (seen in 53% of production AI replies on 2026-11-16).
"""
import pytest

from services.chat_engine import _split_answer, VOICE_MAX_WORDS, TEXT_MAX_WORDS
from services.chat_guardrails import count_hebrew_words


@pytest.mark.parametrize("raw, must_contain", [
    ('כמעט. אומרים "אני רוצה לשתות מים". את רוצה מים קרים או חמים?', 'אומרים "אני רוצה לשתות מים"'),
    ("נכון. יוגורט עם פירות זה בריא וטעים. מה את אוכלת בבוקר?", "יוגורט"),
    ("בסדר גמור. יש לי שאלה בשבילך. איפה את גרה?", "איפה את גרה"),
])
def test_voice_reply_keeps_final_question(raw, must_contain):
    out = _split_answer(raw, voice_mode=True)
    assert out.rstrip().endswith("?"), out
    assert must_contain in out, out


def test_voice_reply_keeps_correction_next_to_question():
    out = _split_answer('כמעט. אומרים "אני רוצה לשתות מים". את רוצה מים קרים או חמים?', voice_mode=True)
    assert 'אומרים "אני רוצה לשתות מים"' in out and out.endswith("חמים?")


def test_long_text_reply_trims_from_the_front_not_the_question():
    filler = "זה משפט ארוך מאוד עם הרבה מילים בעברית כדי לעבור את המגבלה של המערכת."
    raw = f"{filler} {filler} {filler} מה את רוצה לעשות עכשיו?"
    out = _split_answer(raw, voice_mode=False)
    assert out.endswith("מה את רוצה לעשות עכשיו?"), out
    assert count_hebrew_words(out) <= TEXT_MAX_WORDS + 8


def test_long_voice_reply_respects_word_cap_and_keeps_question():
    raw = "יופי מאוד! את מדברת עברית טובה מאוד היום. אומרים אני הולכת לשוק עם אמא שלי בבוקר. מה את קונה בשוק?"
    out = _split_answer(raw, voice_mode=True)
    assert out.endswith("מה את קונה בשוק?"), out
    assert count_hebrew_words(out) <= VOICE_MAX_WORDS, out


def test_reply_without_question_is_unchanged_in_shape():
    out = _split_answer("נכון מאוד. את אוהבת גלידה.", voice_mode=True)
    assert out == "נכון מאוד. את אוהבת גלידה."
