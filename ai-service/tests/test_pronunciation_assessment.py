"""
test_pronunciation_assessment.py

Tests for T1: Pronunciation Assessment integration with voice endpoint.

Verifies:
  - pronunciationScore is present in VoiceChatResponse schema
  - pronunciationScore is None when Azure credentials are absent
  - pronunciationScore is 0-100 when assessment returns a valid result
  - pronunciationScore is clamped to [0, 100] by model_validator
  - VoiceChatResponse serialises pronunciationScore correctly
  - Voice endpoint returns pronunciationScore field (even as None)
"""
from __future__ import annotations

import io
import math
import os
import struct
import unittest.mock
import wave

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from services.chat_schemas import VoiceChatResponse  # noqa: E402

client = TestClient(app)
VOICE_URL = "/api/ai/chat/voice"


def _make_wav(duration_s: float = 0.5, silent: bool = False) -> bytes:
    sample_rate = 16_000
    n_frames = int(sample_rate * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        if silent:
            wf.writeframes(b"\x00\x00" * n_frames)
        else:
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


# ---------------------------------------------------------------------------
# Schema unit tests
# ---------------------------------------------------------------------------

class TestPronunciationScoreSchema:
    def test_default_pronunciation_score_is_none(self):
        r = VoiceChatResponse(answerHe="שלום.", latencyMs=100)
        assert r.pronunciationScore is None

    def test_valid_score_is_stored(self):
        r = VoiceChatResponse(
            answerHe="שלום.", latencyMs=100, pronunciationScore=85
        )
        assert r.pronunciationScore == 85

    def test_score_clamped_above_100(self):
        r = VoiceChatResponse(
            answerHe="שלום.", latencyMs=0, pronunciationScore=120
        )
        assert r.pronunciationScore == 100

    def test_score_clamped_below_zero(self):
        r = VoiceChatResponse(
            answerHe="שלום.", latencyMs=0, pronunciationScore=-5
        )
        assert r.pronunciationScore == 0

    def test_score_at_boundaries(self):
        assert VoiceChatResponse(
            answerHe="", pronunciationScore=0
        ).pronunciationScore == 0
        assert VoiceChatResponse(
            answerHe="", pronunciationScore=100
        ).pronunciationScore == 100

    def test_pronunciation_score_in_serialised_output(self):
        r = VoiceChatResponse(answerHe="שלום.", pronunciationScore=72)
        d = r.model_dump()
        assert "pronunciationScore" in d
        assert d["pronunciationScore"] == 72

    def test_none_score_serialises_as_none(self):
        r = VoiceChatResponse(answerHe="שלום.")
        d = r.model_dump()
        assert d["pronunciationScore"] is None


# ---------------------------------------------------------------------------
# HTTP endpoint tests — pronunciation field always present in response
# ---------------------------------------------------------------------------

class TestVoiceEndpointPronunciationField:
    def test_pronunciation_score_present_in_response(self):
        """pronunciationScore field always in response (None without creds)."""
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}

        with unittest.mock.patch(
            "routes.chat.transcribe_audio", return_value="שלום"
        ):
            resp = client.post(VOICE_URL, files=files, data=data)

        assert resp.status_code == 200
        body = resp.json()
        assert "pronunciationScore" in body

    def test_pronunciation_score_is_none_when_assessment_returns_no_success(self):
        """When assess_pronunciation returns success=False, score is None."""
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}

        with (
            unittest.mock.patch(
                "routes.chat.transcribe_audio", return_value="שלום"
            ),
            unittest.mock.patch(
                "routes.chat.assess_pronunciation",
                return_value={
                    "success": False,
                    "error": "Azure credentials not configured",
                },
            ),
        ):
            resp = client.post(VOICE_URL, files=files, data=data)

        assert resp.status_code == 200
        body = resp.json()
        assert body["pronunciationScore"] is None

    def test_pronunciation_score_populated_when_assessment_succeeds(self):
        """When assess_pronunciation returns a valid result, score is 0-100."""
        mock_result = {
            "success": True,
            "recognized_text": "שלום",
            "reference_text": "שלום",
            "scores": {
                "accuracy": 88.0,
                "fluency": 90.0,
                "completeness": 100.0,
                "pronunciation": 89.5,
            },
        }
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}

        with (
            unittest.mock.patch(
                "routes.chat.transcribe_audio", return_value="שלום"
            ),
            unittest.mock.patch(
                "routes.chat.assess_pronunciation",
                return_value=mock_result,
            ),
        ):
            resp = client.post(VOICE_URL, files=files, data=data)

        assert resp.status_code == 200
        body = resp.json()
        assert body["pronunciationScore"] == 90  # round(89.5) = 90

    def test_pronunciation_score_none_on_assessment_failure(self):
        """When assess_pronunciation raises, score is None (no crash)."""
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}

        with (
            unittest.mock.patch(
                "routes.chat.transcribe_audio", return_value="שלום"
            ),
            unittest.mock.patch(
                "routes.chat.assess_pronunciation",
                side_effect=RuntimeError("Azure connection failed"),
            ),
        ):
            resp = client.post(VOICE_URL, files=files, data=data)

        assert resp.status_code == 200
        body = resp.json()
        assert body["pronunciationScore"] is None

    def test_fallback_response_has_none_pronunciation_score(self):
        """STT fallback responses have pronunciationScore=None."""
        files = {"audio": ("test.wav", _make_wav(silent=True), "audio/wav")}
        data = {"level": "A1"}

        with unittest.mock.patch(
            "routes.chat.transcribe_audio", return_value=""
        ):
            resp = client.post(VOICE_URL, files=files, data=data)

        assert resp.status_code == 200
        body = resp.json()
        assert body["fallbackUsed"] is True
        assert body["pronunciationScore"] is None
