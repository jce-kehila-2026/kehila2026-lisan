"""
test_load_test_script.py

Tests for T10: Load Testing script validation.

Tests the pure-Python helpers in load_tests/locustfile.py without
importing Locust itself (Locust is installed on a different Python
interpreter). All Locust-specific symbols are mocked at import time.

Covers:
  - _build_wav_bytes returns valid WAV with correct sample rate
  - _build_wav_bytes output is parseable by wave.open
  - _build_wav_bytes duration matches requested length
  - _WAV_BYTES module-level fixture is non-empty bytes
  - _record_voice_response increments voice_total for every call
  - _record_voice_response increments voice_fallback on fallbackUsed=True
  - _record_voice_response increments stt_circuit_open on STT_CIRCUIT_OPEN reason
  - _record_voice_response does not increment fallback when fallbackUsed=False
  - _stats resets correctly between test isolation
  - TEXT_MESSAGES contains at least 5 entries
  - All TEXT_MESSAGES contain only Hebrew characters or punctuation
  - _build_wav_bytes custom duration produces proportionally more frames
"""
from __future__ import annotations

import io
import sys
import types
import unittest.mock
import wave
from pathlib import Path

# ---------------------------------------------------------------------------
# Mock the locust package before importing the locustfile
# ---------------------------------------------------------------------------

def _make_locust_mock() -> None:
    """
    Stub out the entire locust package so the locustfile can be imported
    under Python 3.14 even though locust is installed on Python 3.12.
    """
    locust_mod = types.ModuleType("locust")

    # Create a no-op decorator factory for @task, @events
    def _noop_decorator(*args, **kwargs):
        if len(args) == 1 and callable(args[0]):
            return args[0]
        def _inner(fn):
            return fn
        return _inner

    class _FakeUser:
        tasks = []
        wait_time = None

    class _FakeTaskSet:
        pass

    class _FakeEvents:
        quitting = unittest.mock.MagicMock()
        quitting.add_listener = _noop_decorator

    locust_mod.HttpUser = _FakeUser
    locust_mod.TaskSet = _FakeTaskSet
    locust_mod.task = _noop_decorator
    locust_mod.between = lambda a, b: None
    locust_mod.events = _FakeEvents()

    sys.modules["locust"] = locust_mod


_make_locust_mock()

# Now import the locustfile helpers
_LOAD_TEST_DIR = Path(__file__).resolve().parents[1] / "load_tests"
sys.path.insert(0, str(_LOAD_TEST_DIR))

import importlib.util
_spec = importlib.util.spec_from_file_location(
    "locustfile",
    str(_LOAD_TEST_DIR / "locustfile.py"),
)
_lf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lf)

_build_wav_bytes = _lf._build_wav_bytes
_WAV_BYTES = _lf._WAV_BYTES
_record_voice_response = _lf._record_voice_response
_stats = _lf._stats
_TEXT_MESSAGES = _lf._TEXT_MESSAGES


# ---------------------------------------------------------------------------
# WAV fixture tests
# ---------------------------------------------------------------------------

class TestBuildWavBytes:
    def test_returns_bytes(self):
        result = _build_wav_bytes()
        assert isinstance(result, bytes)

    def test_non_empty(self):
        assert len(_build_wav_bytes()) > 0

    def test_parseable_by_wave_open(self):
        wav_bytes = _build_wav_bytes()
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2

    def test_correct_sample_rate(self):
        wav_bytes = _build_wav_bytes(sample_rate=16_000)
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            assert wf.getframerate() == 16_000

    def test_duration_half_second(self):
        wav_bytes = _build_wav_bytes(duration_seconds=0.5, sample_rate=16_000)
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            assert wf.getnframes() == 8_000

    def test_longer_duration_more_frames(self):
        short = _build_wav_bytes(duration_seconds=0.5)
        long_ = _build_wav_bytes(duration_seconds=1.0)
        with wave.open(io.BytesIO(short)) as ws, wave.open(io.BytesIO(long_)) as wl:
            assert wl.getnframes() > ws.getnframes()

    def test_module_level_fixture_is_bytes(self):
        assert isinstance(_WAV_BYTES, bytes)
        assert len(_WAV_BYTES) > 0


# ---------------------------------------------------------------------------
# _record_voice_response
# ---------------------------------------------------------------------------

class TestRecordVoiceResponse:
    def setup_method(self):
        """Reset shared stats before each test."""
        _stats["voice_total"] = 0
        _stats["voice_fallback"] = 0
        _stats["stt_circuit_open"] = 0

    def test_increments_voice_total(self):
        _record_voice_response({"fallbackUsed": False})
        assert _stats["voice_total"] == 1

    def test_increments_for_every_call(self):
        _record_voice_response({"fallbackUsed": False})
        _record_voice_response({"fallbackUsed": False})
        _record_voice_response({"fallbackUsed": False})
        assert _stats["voice_total"] == 3

    def test_increments_fallback_when_true(self):
        _record_voice_response({"fallbackUsed": True, "fallbackReason": "STT_EMPTY"})
        assert _stats["voice_fallback"] == 1

    def test_does_not_increment_fallback_when_false(self):
        _record_voice_response({"fallbackUsed": False})
        assert _stats["voice_fallback"] == 0

    def test_increments_circuit_open_on_stt_circuit_open(self):
        _record_voice_response(
            {"fallbackUsed": True, "fallbackReason": "STT_CIRCUIT_OPEN"}
        )
        assert _stats["stt_circuit_open"] == 1

    def test_does_not_increment_circuit_open_for_other_reasons(self):
        _record_voice_response(
            {"fallbackUsed": True, "fallbackReason": "STT_TIMEOUT"}
        )
        assert _stats["stt_circuit_open"] == 0

    def test_multiple_circuit_opens_accumulate(self):
        for _ in range(5):
            _record_voice_response(
                {"fallbackUsed": True, "fallbackReason": "STT_CIRCUIT_OPEN"}
            )
        assert _stats["stt_circuit_open"] == 5

    def test_mixed_responses(self):
        _record_voice_response({"fallbackUsed": False})
        _record_voice_response({"fallbackUsed": True, "fallbackReason": "STT_EMPTY"})
        _record_voice_response(
            {"fallbackUsed": True, "fallbackReason": "STT_CIRCUIT_OPEN"}
        )
        assert _stats["voice_total"] == 3
        assert _stats["voice_fallback"] == 2
        assert _stats["stt_circuit_open"] == 1


# ---------------------------------------------------------------------------
# TEXT_MESSAGES content validation
# ---------------------------------------------------------------------------

import re

_HEBREW_OR_PUNCTUATION = re.compile(r"^[֐-׿\s.,?!\"']+$")


class TestTextMessages:
    def test_has_at_least_five_messages(self):
        assert len(_TEXT_MESSAGES) >= 5

    def test_all_messages_non_empty(self):
        for msg in _TEXT_MESSAGES:
            assert msg.strip(), f"Empty message found: {repr(msg)}"

    def test_all_messages_contain_hebrew(self):
        for msg in _TEXT_MESSAGES:
            assert re.search(r"[֐-׿]", msg), (
                f"No Hebrew in message: {repr(msg)}"
            )

    def test_no_english_in_messages(self):
        for msg in _TEXT_MESSAGES:
            assert not re.search(r"[A-Za-z]", msg), (
                f"English found in message: {repr(msg)}"
            )


# ---------------------------------------------------------------------------
# User class structure
# ---------------------------------------------------------------------------

class TestUserClasses:
    def test_lisan_text_user_has_tasks(self):
        assert _lf.LisanTextUser.tasks

    def test_lisan_voice_user_has_tasks(self):
        assert _lf.LisanVoiceUser.tasks

    def test_lisan_mixed_user_has_tasks(self):
        assert _lf.LisanMixedUser.tasks

    def test_lisan_streaming_user_has_tasks(self):
        assert _lf.LisanStreamingUser.tasks

    def test_voice_user_different_from_text_user(self):
        assert _lf.LisanVoiceUser.tasks is not _lf.LisanTextUser.tasks
