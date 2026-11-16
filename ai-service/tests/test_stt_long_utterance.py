"""Azure STT must keep every recognized segment until the audio ends.

Regression: the handler stopped at the first "recognized" event, so a student
who paused mid-sentence only got the first phrase transcribed.
"""
import io
import sys
import types
import wave

import pytest

import services.speech_to_text as stt


def _wav(seconds=0.5, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"\x01\x00" * int(rate * seconds))
    return buf.getvalue()


def _duration(b):
    with wave.open(io.BytesIO(b)) as w:
        return w.getnframes() / w.getframerate()


def test_pad_trailing_silence_adds_one_second():
    assert _duration(stt._pad_trailing_silence(_wav(0.5), 1.0)) == pytest.approx(1.5)


def test_pad_trailing_silence_disabled_and_non_wav_passthrough():
    raw = _wav(0.5)
    assert stt._pad_trailing_silence(raw, 0) == raw
    assert stt._pad_trailing_silence(b"not a wav", 1.0) == b"not a wav"


class _Signal:
    def __init__(self):
        self.handlers = []
    def connect(self, fn):
        self.handlers.append(fn)
    def disconnect_all(self):
        self.handlers = []
    def fire(self, evt):
        for fn in list(self.handlers):
            fn(evt)


def _fake_sdk(segments, end_reason="EndOfStream"):
    sdk = types.SimpleNamespace()
    sdk.ResultReason = types.SimpleNamespace(RecognizedSpeech="RecognizedSpeech", NoMatch="NoMatch")
    sdk.CancellationReason = types.SimpleNamespace(EndOfStream="EndOfStream", Error="Error")
    sdk.CancellationErrorCode = types.SimpleNamespace(AuthenticationFailure="AuthFail", NoError="NoError")
    sdk.SpeechConfig = lambda **kw: types.SimpleNamespace(speech_recognition_language=None)
    sdk.audio = types.SimpleNamespace(AudioConfig=lambda **kw: None)

    class Recognizer:
        def __init__(self, **kw):
            self.recognized = _Signal(); self.canceled = _Signal(); self.session_stopped = _Signal()
        def start_continuous_recognition(self):
            for text in segments:
                self.recognized.fire(types.SimpleNamespace(
                    result=types.SimpleNamespace(reason="RecognizedSpeech", text=text)))
            details = types.SimpleNamespace(reason=end_reason, code="AuthFail" if end_reason == "Error" else "NoError", error_details="boom")
            self.canceled.fire(types.SimpleNamespace(cancellation_details=details))
            self.session_stopped.fire(types.SimpleNamespace())
        def stop_continuous_recognition_async(self):
            return types.SimpleNamespace(get=lambda timeout=None: None)

    sdk.SpeechRecognizer = Recognizer
    return sdk


@pytest.fixture
def azure_env(monkeypatch):
    monkeypatch.setenv("AZURE_SPEECH_KEY", "k")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "swedencentral")
    from services.voice_circuits import stt_circuit
    stt_circuit.reset() if hasattr(stt_circuit, "reset") else None
    monkeypatch.setattr("services.audio_convert.to_wav_pcm16", lambda b: b)


def _install(monkeypatch, sdk):
    # `import azure.cognitiveservices.speech as x` resolves through the parent
    # package attribute once the real SDK is loaded, so patch both.
    import azure.cognitiveservices as pkg
    monkeypatch.setitem(sys.modules, "azure.cognitiveservices.speech", sdk)
    monkeypatch.setattr(pkg, "speech", sdk, raising=False)


def test_all_segments_are_joined(monkeypatch, azure_env):
    _install(monkeypatch, _fake_sdk(["שלום קוראים לי רנה.", "אני גרה בירושלים.", "בבוקר אני שותה קפה."]))
    assert stt.transcribe_audio(_wav(), "a.wav") == "שלום קוראים לי רנה. אני גרה בירושלים. בבוקר אני שותה קפה."


def test_auth_cancellation_raises(monkeypatch, azure_env):
    _install(monkeypatch, _fake_sdk([], end_reason="Error"))
    with pytest.raises(stt.STTAuthError):
        stt.transcribe_audio(_wav(), "a.wav")
