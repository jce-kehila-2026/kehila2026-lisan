"""
test_voice_response_shape.py

Verifies that POST /api/ai/chat/voice always returns a well-formed
VoiceChatResponse regardless of the input scenario.

Required fields contract (Task 10):
  - answerHe       : str  (never null, never missing)
  - transcribedText: str  (never null, never missing)
  - fallbackUsed   : bool (always present)
  - fallbackReason : str | None — must be set when fallbackUsed=True
  - latencyMs      : int >= 0

Run:
  cd ai-service
  python -m pytest tests/test_voice_response_shape.py -v
"""
from __future__ import annotations

import io
import os
import re
import struct
import unittest.mock
import wave

# Disable auth guard before the app is imported
os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from services.chat_schemas import VoiceChatResponse  # noqa: E402

client = TestClient(app)
VOICE_URL = "/api/ai/chat/voice"

REQUIRED_FIELDS = {
    "answerHe",
    "transcribedText",
    "fallbackUsed",
    "fallbackReason",
    "latencyMs",
}

_ARABIC_RE = re.compile(r"[؀-ۿ]")
_HEBREW_WORD_RE = re.compile(r"[֐-׿]+")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _make_wav(duration_s: float = 0.5, silent: bool = False) -> bytes:
    """Return a valid 16 kHz mono 16-bit WAV as bytes."""
    import math
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


def _post_voice(
    wav_bytes: bytes,
    level: str = "A1",
    mock_transcript: str | None = None,
) -> tuple[int, dict]:
    files = {"audio": ("test.wav", wav_bytes, "audio/wav")}
    data = {"level": level, "includeArabic": "false"}

    if mock_transcript is not None:
        with unittest.mock.patch(
            "routes.chat.transcribe_audio",
            return_value=mock_transcript,
        ):
            resp = client.post(VOICE_URL, files=files, data=data)
    else:
        resp = client.post(VOICE_URL, files=files, data=data)

    return resp.status_code, resp.json() if resp.status_code == 200 else {}


def _assert_shape(body: dict) -> None:
    for f in REQUIRED_FIELDS:
        assert f in body, f"Missing required field: '{f}'"

    assert isinstance(body["answerHe"], str), (
        f"answerHe must be str, got {type(body['answerHe'])}"
    )
    assert isinstance(body["transcribedText"], str), (
        f"transcribedText must be str, got {type(body['transcribedText'])}"
    )
    assert isinstance(body["fallbackUsed"], bool), (
        f"fallbackUsed must be bool, got {type(body['fallbackUsed'])}"
    )
    assert isinstance(body["latencyMs"], int), (
        f"latencyMs must be int, got {type(body['latencyMs'])}"
    )
    assert body["latencyMs"] >= 0, (
        f"latencyMs must be >= 0, got {body['latencyMs']}"
    )
    if body["fallbackUsed"]:
        assert body["fallbackReason"] is not None, (
            "fallbackReason must not be None when fallbackUsed=True"
        )
        assert isinstance(body["fallbackReason"], str), (
            "fallbackReason must be str when fallbackUsed=True"
        )


# ---------------------------------------------------------------------------
# Schema / model_validator unit tests  (no HTTP)
# ---------------------------------------------------------------------------

class TestVoiceChatResponseSchema:
    def test_valid_success_response(self):
        r = VoiceChatResponse(answerHe="שלום.", latencyMs=100)
        assert r.answerHe == "שלום."
        assert r.transcribedText == ""
        assert r.fallbackUsed is False
        assert r.fallbackReason is None
        assert r.latencyMs == 100

    def test_fallback_without_reason_gets_unknown(self):
        r = VoiceChatResponse(
            answerHe="נסה שוב.", fallbackUsed=True, fallbackReason=None
        )
        assert r.fallbackReason == "UNKNOWN"

    def test_fallback_with_reason_preserved(self):
        r = VoiceChatResponse(
            answerHe="", fallbackUsed=True, fallbackReason="STT_FAILED"
        )
        assert r.fallbackReason == "STT_FAILED"

    def test_negative_latency_clamped_to_zero(self):
        r = VoiceChatResponse(answerHe="שלום.", latencyMs=-5)
        assert r.latencyMs == 0

    def test_none_answer_he_coerced_to_empty_string(self):
        r = VoiceChatResponse.model_validate(
            {"answerHe": None, "latencyMs": 0}
        )
        assert r.answerHe == ""

    def test_none_transcribed_text_coerced_to_empty_string(self):
        r = VoiceChatResponse.model_validate(
            {"answerHe": "שלום.", "transcribedText": None, "latencyMs": 0}
        )
        assert r.transcribedText == ""

    def test_all_required_fields_serialise(self):
        r = VoiceChatResponse(answerHe="שלום.")
        d = r.model_dump()
        for f in REQUIRED_FIELDS:
            assert f in d, f"Field '{f}' missing from serialised output"


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------

class TestVoiceEndpointShape:
    def test_empty_audio_returns_400(self):
        files = {"audio": ("empty.wav", b"", "audio/wav")}
        resp = client.post(VOICE_URL, files=files, data={"level": "A1"})
        assert resp.status_code == 400

    def test_stt_empty_transcript_returns_fallback_shape(self):
        status, body = _post_voice(_make_wav(silent=True), mock_transcript="")
        assert status == 200
        _assert_shape(body)
        assert body["fallbackUsed"] is True
        assert body["fallbackReason"] in {
            "STT_EMPTY", "EMPTY_MESSAGE", "STT_FAILED",
            "STT_CIRCUIT_OPEN", "STT_TIMEOUT", "UNKNOWN",
        }

    def test_valid_hebrew_greeting_shape(self):
        status, body = _post_voice(_make_wav(), mock_transcript="שלום")
        assert status == 200
        _assert_shape(body)
        assert body["transcribedText"] == "שלום"
        assert isinstance(body["answerHe"], str)

    def test_arabic_input_returns_fallback_shape(self):
        status, body = _post_voice(_make_wav(), mock_transcript="مرحبا")
        assert status == 200
        _assert_shape(body)
        assert body["fallbackUsed"] is True

    def test_answer_he_max_10_words_in_voice_mode(self):
        status, body = _post_voice(_make_wav(), mock_transcript="שלום")
        assert status == 200
        he_words = _HEBREW_WORD_RE.findall(body["answerHe"])
        assert len(he_words) <= 10, (
            f"answerHe has {len(he_words)} Hebrew words, "
            f"expected <=10: '{body['answerHe']}'"
        )

    def test_no_arabic_script_in_answer_he(self):
        status, body = _post_voice(_make_wav(), mock_transcript="שלום")
        assert status == 200
        assert not _ARABIC_RE.search(body["answerHe"]), (
            f"answerHe contains Arabic: '{body['answerHe']}'"
        )

    def test_latency_ms_is_non_negative_int(self):
        status, body = _post_voice(_make_wav(), mock_transcript="שלום")
        assert status == 200
        assert isinstance(body["latencyMs"], int)
        assert body["latencyMs"] >= 0

    def test_fallback_reason_always_set_when_fallback_used(self):
        transcripts = ("", "مرحبا", "הממשלה מאשרת תקציב")
        for transcript in transcripts:
            status, body = _post_voice(
                _make_wav(), mock_transcript=transcript
            )
            assert status == 200
            if body["fallbackUsed"]:
                assert body["fallbackReason"] is not None, (
                    f"fallbackReason=None with fallbackUsed=True"
                    f" for transcript='{transcript}'"
                )
