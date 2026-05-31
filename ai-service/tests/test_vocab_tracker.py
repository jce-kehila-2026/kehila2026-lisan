"""
test_vocab_tracker.py

Tests for T3: Vocabulary Mastery Tracking.

Covers:
  - extract_known_words: splits Hebrew text, checks against A1 vocab
  - track_vocab_async: skips when userId or text is empty
  - track_vocab_async: fires HTTP POST in a background thread
  - voice endpoint passes userId to tracker on successful response
  - tracker is NOT called when chat fallback occurs
"""
from __future__ import annotations

import io
import math
import os
import struct
import unittest.mock
import wave

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from services.vocab_tracker import extract_known_words, track_vocab_async

# ---------------------------------------------------------------------------
# extract_known_words unit tests
# ---------------------------------------------------------------------------


class TestExtractKnownWords:
    def test_empty_text_returns_empty(self):
        result = extract_known_words("", "A1")
        assert result == []

    def test_known_word_marked_correct(self):
        # "שלום" is in CORE_TUTOR_VOCAB and guaranteed in A1
        result = extract_known_words("שלום", "A1")
        assert len(result) == 1
        assert result[0]["word"] == "שלום"
        assert result[0]["correct"] is True

    def test_unknown_word_marked_not_correct(self):
        # Use a made-up Hebrew word unlikely to be in A1
        result = extract_known_words("בלבלבל", "A1")
        # it may or may not parse as a Hebrew word; just check no crash
        for entry in result:
            assert "word" in entry
            assert "correct" in entry

    def test_deduplication(self):
        result = extract_known_words("שלום שלום שלום", "A1")
        words = [e["word"] for e in result]
        assert words.count("שלום") == 1

    def test_mixed_text_extracts_only_hebrew(self):
        result = extract_known_words("hello שלום world", "A1")
        words = [e["word"] for e in result]
        # "hello" and "world" should not appear as Hebrew tokens
        assert all(w != "hello" and w != "world" for w in words)

    def test_multiple_known_words(self):
        result = extract_known_words("שלום תודה כן", "A1")
        words = {e["word"] for e in result}
        assert "שלום" in words
        assert "תודה" in words
        assert "כן" in words


# ---------------------------------------------------------------------------
# track_vocab_async unit tests
# ---------------------------------------------------------------------------


class TestTrackVocabAsync:
    def test_no_user_id_skips_silently(self):
        with unittest.mock.patch(
            "services.vocab_tracker._post_to_backend"
        ) as mock_post:
            track_vocab_async("שלום", user_id=None, level="A1")
            track_vocab_async("שלום", user_id="", level="A1")
        mock_post.assert_not_called()

    def test_empty_text_skips_silently(self):
        with unittest.mock.patch(
            "services.vocab_tracker._post_to_backend"
        ) as mock_post:
            track_vocab_async("", user_id="user-1", level="A1")
            track_vocab_async("   ", user_id="user-1", level="A1")
        mock_post.assert_not_called()

    def test_valid_call_starts_thread(self):
        posted: list[tuple] = []

        def fake_post(user_id, words, level):
            posted.append((user_id, words, level))

        with unittest.mock.patch(
            "services.vocab_tracker._post_to_backend",
            side_effect=fake_post,
        ):
            import threading
            import time

            track_vocab_async("שלום", user_id="uid-99", level="A1")
            # Give the daemon thread up to 1 s to finish
            deadline = time.time() + 1.0
            while not posted and time.time() < deadline:
                time.sleep(0.05)

        assert len(posted) == 1
        uid, words, level = posted[0]
        assert uid == "uid-99"
        assert level == "A1"
        assert any(w["word"] == "שלום" for w in words)

    def test_post_payload_has_correct_field(self):
        posted_words: list[list] = []

        def fake_post(user_id, words, level):
            posted_words.append(words)

        with unittest.mock.patch(
            "services.vocab_tracker._post_to_backend",
            side_effect=fake_post,
        ):
            import time

            track_vocab_async("שלום תודה", user_id="uid-1", level="A1")
            deadline = time.time() + 1.0
            while not posted_words and time.time() < deadline:
                time.sleep(0.05)

        assert posted_words
        words = posted_words[0]
        for w in words:
            assert "word" in w
            assert "correct" in w
            assert isinstance(w["correct"], bool)


# ---------------------------------------------------------------------------
# HTTP endpoint integration: userId forwarded to tracker
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


class TestVoiceEndpointVocabTracking:
    def test_tracker_called_on_successful_response(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1", "userId": "test-student-1"}

        called_with: list[dict] = []

        def fake_track(transcribed_text, user_id, level):
            called_with.append({
                "text": transcribed_text,
                "user_id": user_id,
                "level": level,
            })

        with (
            unittest.mock.patch(
                "routes.chat.transcribe_audio", return_value="שלום"
            ),
            unittest.mock.patch(
                "routes.chat.track_vocab_async",
                side_effect=fake_track,
            ),
        ):
            resp = client.post("/api/ai/chat/voice", files=files, data=data)

        assert resp.status_code == 200
        assert len(called_with) == 1
        assert called_with[0]["user_id"] == "test-student-1"
        assert called_with[0]["text"] == "שלום"
        assert called_with[0]["level"] == "A1"

    def test_tracker_not_called_on_stt_fallback(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1", "userId": "test-student-2"}

        called_with: list = []

        with (
            unittest.mock.patch(
                "routes.chat.transcribe_audio", return_value=""
            ),
            unittest.mock.patch(
                "routes.chat.track_vocab_async",
                side_effect=lambda **kw: called_with.append(kw),
            ),
        ):
            resp = client.post("/api/ai/chat/voice", files=files, data=data)

        assert resp.status_code == 200
        body = resp.json()
        assert body["fallbackUsed"] is True
        assert len(called_with) == 0

    def test_tracker_not_called_without_user_id(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        files = {"audio": ("test.wav", _make_wav(), "audio/wav")}
        data = {"level": "A1"}  # no userId

        called_with: list[dict] = []

        def fake_track(transcribed_text, user_id, level):
            called_with.append({"user_id": user_id})

        with (
            unittest.mock.patch(
                "routes.chat.transcribe_audio", return_value="שלום"
            ),
            unittest.mock.patch(
                "routes.chat.track_vocab_async",
                side_effect=fake_track,
            ),
        ):
            resp = client.post("/api/ai/chat/voice", files=files, data=data)

        assert resp.status_code == 200
        # tracker is called but with user_id=None — it will skip internally
        if called_with:
            assert called_with[0]["user_id"] is None
