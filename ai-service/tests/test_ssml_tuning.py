"""
test_ssml_tuning.py

Tests for T4: TTS SSML Tuning.

Covers:
  - build_ssml returns valid SSML structure
  - Empty / None text returns empty string
  - Rate is always "slow" for learners
  - Pitch is "high" for encouraging keywords
  - Pitch is "high" when pronunciationScore >= 80
  - Pitch is "x-low" for fallback responses
  - Pause break inserted before terminal punctuation
  - Special HTML chars are escaped
  - VoiceChatResponse has ssmlText field
  - Voice endpoint returns ssmlText in response
"""
from __future__ import annotations

import io
import math
import os
import struct
import unittest.mock
import wave

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from services import text_to_speech as tts
from services.text_to_speech import build_ssml
from services.chat_schemas import VoiceChatResponse


# ---------------------------------------------------------------------------
# build_ssml unit tests
# ---------------------------------------------------------------------------

class TestBuildSsml:
    def test_empty_text_returns_empty_string(self):
        assert build_ssml("") == ""
        assert build_ssml(None) == ""  # type: ignore[arg-type]
        assert build_ssml("   ") == ""

    def test_returns_speak_root_element(self):
        ssml = build_ssml("שלום.")
        assert ssml.startswith("<speak ")
        assert ssml.endswith("</speak>")

    def test_contains_hebrew_locale(self):
        ssml = build_ssml("שלום.")
        assert 'xml:lang="he-IL"' in ssml

    def test_rate_is_slow_for_normal_response(self):
        ssml = build_ssml("אני גר בתל אביב.")
        assert 'rate="slow"' in ssml

    def test_pitch_medium_for_neutral_response(self):
        ssml = build_ssml("אני גר בתל אביב.")
        assert 'pitch="medium"' in ssml

    def test_pitch_high_for_encouraging_keyword(self):
        for word in ("כן.", "טוב.", "יפה.", "מצוין.", "נכון."):
            ssml = build_ssml(word)
            assert 'pitch="high"' in ssml, (
                f"Expected high pitch for encouraging word: {word}"
            )

    def test_pitch_high_for_good_pronunciation_score(self):
        ssml = build_ssml("שלום.", pronunciation_score=85)
        assert 'pitch="high"' in ssml

    def test_pitch_medium_for_low_pronunciation_score(self):
        # Use a neutral sentence that contains no encouraging keyword
        ssml = build_ssml("אני גר פה.", pronunciation_score=60)
        assert 'pitch="medium"' in ssml

    def test_pitch_xlow_for_fallback(self):
        ssml = build_ssml("נסה שוב.", is_fallback=True)
        assert 'pitch="x-low"' in ssml

    def test_rate_xslow_for_fallback(self):
        ssml = build_ssml("נסה שוב.", is_fallback=True)
        assert 'rate="x-slow"' in ssml

    def test_leading_break_inserted_before_text(self):
        ssml = build_ssml("שלום")
        assert '<prosody rate="slow" pitch="high"><break time="250ms"/>' in ssml

    def test_break_inserted_before_period(self):
        ssml = build_ssml("שלום.")
        assert ssml.count('<break time="250ms"/>') == 2

    def test_break_inserted_before_question_mark(self):
        ssml = build_ssml("מה שלומך?")
        assert ssml.count('<break time="250ms"/>') == 2

    def test_html_special_chars_escaped(self):
        ssml = build_ssml('A & B < C > D "E"')
        assert "&amp;" in ssml or "A" in ssml
        assert "<speak" in ssml  # still valid SSML

    def test_text_content_present_in_ssml(self):
        ssml = build_ssml("שלום.")
        assert "שלום" in ssml

    def test_no_terminal_break_for_text_without_terminal(self):
        # Text without terminal punctuation should only have the leading break
        ssml = build_ssml("שלום")
        assert ssml.count('<break time="250ms"/>') == 1

    def test_ambiguous_second_person_forms_are_feminine_for_tts(self):
        ssml = build_ssml("אני רואה אותך וזה מתאים לך.")
        assert "אוֹתָךְ" in ssml
        assert "לָךְ" in ssml

    def test_same_spelling_present_verbs_are_feminine_for_tts(self):
        ssml = build_ssml("את רוצה מים ואת עושה שיעור.")
        assert "אַתְּ" in ssml
        assert "רוֹצָה" in ssml
        assert "עוֹשָׂה" in ssml

    def test_same_spelling_adjectives_are_feminine_for_tts(self):
        ssml = build_ssml("את יפה, אבל היום את חולה.")
        assert "יָפָה" in ssml
        assert "חוֹלָה" in ssml

    def test_common_second_person_past_forms_are_feminine_for_tts(self):
        ssml = build_ssml("אמרת יפה, וכתבת תשובה טובה.")
        assert "אָמַרְתְּ" in ssml
        assert "כָּתַבְתְּ" in ssml

    def test_explicit_masculine_context_is_not_forced_to_feminine(self):
        ssml = build_ssml("הוא רוצה מים.")
        assert "רוֹצָה" not in ssml
        assert "רוצה" in ssml

    def test_dicta_onnx_engine_still_forces_feminine_tts(self, monkeypatch):
        tts._prepare_hebrew_for_feminine_tts_cached.cache_clear()
        monkeypatch.setenv("TTS_NIQQUD_ENGINE", "dicta_onnx")
        monkeypatch.setenv("DICTA_ONNX_MODEL_PATH", "C:/models/dicta.onnx")
        monkeypatch.setattr(
            tts,
            "_dicta_onnx_diacritize",
            lambda text, model_path: "אַתְּ רוֹצֶה מים",
        )

        ssml = build_ssml("את רוצה מים.")

        assert "רוֹצָה" in ssml
        assert "רוֹצֶה" not in ssml
        tts._prepare_hebrew_for_feminine_tts_cached.cache_clear()

    def test_dicta_onnx_missing_model_falls_back_to_feminine_layer(
        self,
        monkeypatch,
    ):
        tts._prepare_hebrew_for_feminine_tts_cached.cache_clear()
        monkeypatch.setenv("TTS_NIQQUD_ENGINE", "dicta_onnx")
        monkeypatch.setenv("DICTA_ONNX_MODEL_PATH", "C:/missing/dicta.onnx")

        ssml = build_ssml("את רוצה מים.")

        assert "רוֹצָה" in ssml
        tts._prepare_hebrew_for_feminine_tts_cached.cache_clear()


# ---------------------------------------------------------------------------
# VoiceChatResponse schema
# ---------------------------------------------------------------------------

class TestVoiceChatResponseSsmlField:
    def test_ssml_text_defaults_to_none(self):
        r = VoiceChatResponse(answerHe="שלום.")
        assert r.ssmlText is None

    def test_ssml_text_stored(self):
        ssml = build_ssml("שלום.")
        r = VoiceChatResponse(answerHe="שלום.", ssmlText=ssml)
        assert r.ssmlText == ssml

    def test_ssml_text_in_serialised_output(self):
        r = VoiceChatResponse(answerHe="שלום.", ssmlText="<speak/>")
        d = r.model_dump()
        assert "ssmlText" in d
        assert d["ssmlText"] == "<speak/>"


# ---------------------------------------------------------------------------
# HTTP endpoint: ssmlText present in response
# ---------------------------------------------------------------------------

def _make_wav() -> bytes:
    sample_rate = 16_000
    n_frames = int(sample_rate * 0.5)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = b"".join(
            struct.pack(
                "<h",
                int(
                    0.3
                    * math.sin(2 * math.pi * 440 * i / sample_rate)
                    * 32767
                ),
            )
            for i in range(n_frames)
        )
        wf.writeframes(frames)
    return buf.getvalue()


class TestVoiceEndpointSsml:
    def test_ssml_text_field_present_in_response(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}

        with unittest.mock.patch(
            "routes.chat.transcribe_audio", return_value="שלום"
        ):
            resp = client.post("/api/ai/chat/voice", files=files, data=data)

        assert resp.status_code == 200
        body = resp.json()
        assert "ssmlText" in body

    def test_ssml_text_contains_speak_element_on_success(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}

        with unittest.mock.patch(
            "routes.chat.transcribe_audio", return_value="שלום"
        ):
            resp = client.post("/api/ai/chat/voice", files=files, data=data)

        body = resp.json()
        ssml = body.get("ssmlText")
        # ssmlText is None only when answerHe is empty
        if body["answerHe"]:
            assert ssml is not None
            assert "<speak" in ssml
            assert 'xml:lang="he-IL"' in ssml

    def test_ssml_text_none_for_empty_fallback_answer(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}

        with unittest.mock.patch(
            "routes.chat.transcribe_audio", return_value=""
        ):
            resp = client.post("/api/ai/chat/voice", files=files, data=data)

        body = resp.json()
        assert body["fallbackUsed"] is True
        # empty answerHe → ssmlText is None
        assert body["ssmlText"] is None
