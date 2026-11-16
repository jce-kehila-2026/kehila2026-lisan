"""
Tests for the ElevenLabs TTS provider, the provider selector with Azure
fallback, per-provider circuit breakers and the in-memory audio cache.

No real network calls: ElevenLabs HTTP goes through httpx.MockTransport and
the Azure provider is replaced with a stub.
"""
from __future__ import annotations

import json
import logging
import os

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

import httpx
import pytest

from services import text_to_speech as tts
from services.text_to_speech import TTSAuthError, TTSError

FAKE_MP3 = b"ID3\x04\x00fake-elevenlabs-mp3"
AZURE_MP3 = b"ID3\x04\x00fake-azure-mp3"


@pytest.fixture
def eleven_env(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
    monkeypatch.delenv("TTS_FALLBACK_PROVIDER", raising=False)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voice123")
    monkeypatch.delenv("ELEVENLABS_MODEL_ID", raising=False)
    monkeypatch.setenv("TTS_NIQQUD_ENGINE", "lexicon")
    tts.clear_tts_audio_cache()
    yield
    tts.clear_tts_audio_cache()


@pytest.fixture
def azure_stub(monkeypatch):
    calls: list[dict] = []

    def fake_azure(clean, *, is_fallback, pronunciation_score, voice):
        calls.append({"text": clean, "is_fallback": is_fallback})
        return AZURE_MP3

    monkeypatch.setattr(tts, "_synthesize_azure", fake_azure)
    return calls


def _install_transport(monkeypatch, handler):
    requests: list[httpx.Request] = []

    def recording(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    monkeypatch.setattr(
        tts, "_ELEVENLABS_TRANSPORT", httpx.MockTransport(recording)
    )
    return requests


def _ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200, content=FAKE_MP3, headers={"content-type": "audio/mpeg"}
    )


# ── Provider selection ───────────────────────────────────────────────────────

class TestProviderSelection:
    def test_default_provider_is_azure(self, monkeypatch):
        monkeypatch.delenv("TTS_PROVIDER", raising=False)
        assert tts.get_tts_provider() == "azure"

    def test_unknown_provider_falls_back_to_azure(self, monkeypatch):
        monkeypatch.setenv("TTS_PROVIDER", "polly")
        assert tts.get_tts_provider() == "azure"

    def test_fallback_defaults_to_azure_when_elevenlabs_primary(self, monkeypatch):
        monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
        monkeypatch.delenv("TTS_FALLBACK_PROVIDER", raising=False)
        assert tts.get_tts_fallback_provider() == "azure"

    def test_no_fallback_by_default_when_azure_primary(self, monkeypatch):
        monkeypatch.setenv("TTS_PROVIDER", "azure")
        monkeypatch.delenv("TTS_FALLBACK_PROVIDER", raising=False)
        assert tts.get_tts_fallback_provider() == ""

    def test_empty_fallback_disables_it(self, monkeypatch):
        monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
        monkeypatch.setenv("TTS_FALLBACK_PROVIDER", "")
        assert tts.get_tts_fallback_provider() == ""


# ── ElevenLabs success path ──────────────────────────────────────────────────

class TestElevenLabsSuccess:
    def test_returns_mp3_bytes(self, monkeypatch, eleven_env, azure_stub):
        reqs = _install_transport(monkeypatch, _ok)

        audio = tts.synthesize_speech("שלום, מה שלומך?")

        assert audio == FAKE_MP3
        assert azure_stub == []
        assert len(reqs) == 1

    def test_request_shape(self, monkeypatch, eleven_env, azure_stub):
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("את רוצה קפה?")

        req = reqs[0]
        assert req.method == "POST"
        assert req.url.path == "/v1/text-to-speech/voice123"
        assert req.url.params["output_format"] == tts.ELEVENLABS_OUTPUT_FORMAT
        assert req.headers["xi-api-key"] == "test-key"
        body = json.loads(req.content)
        assert body["model_id"] == tts.DEFAULT_ELEVENLABS_MODEL_ID
        assert body["language_code"] == "he"
        # Feminine niqqud preprocessing is applied before sending.
        assert tts._FEMININE_DIRECT_FORMS["את"] in body["text"]
        assert tts._FEMININE_CONTEXTUAL_FORMS["רוצה"] in body["text"]
        # No Azure-only SSML constructs leak into the ElevenLabs request.
        assert "<" not in body["text"]
        assert "mstts" not in body["text"]
        settings = body["voice_settings"]
        assert {"stability", "similarity_boost", "speed"} <= set(settings)
        assert settings["speed"] < 1.0

    def test_default_voice_is_owner_choice(self, monkeypatch, eleven_env, azure_stub):
        monkeypatch.delenv("ELEVENLABS_VOICE_ID")
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("שלום")

        assert tts.DEFAULT_ELEVENLABS_VOICE_ID == "s0T0DT6EAPeX57MQpn3I"
        assert reqs[0].url.path == "/v1/text-to-speech/s0T0DT6EAPeX57MQpn3I"

    def test_niqqud_off_sends_plain_text(self, monkeypatch, eleven_env, azure_stub):
        monkeypatch.setenv("TTS_NIQQUD_ENGINE", "off")
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("את רוצה קפה?")

        assert json.loads(reqs[0].content)["text"] == "את רוצה קפה?"

    def test_model_override(self, monkeypatch, eleven_env, azure_stub):
        monkeypatch.setenv("ELEVENLABS_MODEL_ID", "eleven_custom")
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("שלום")

        assert json.loads(reqs[0].content)["model_id"] == "eleven_custom"

    def test_fallback_answer_is_slower(self, monkeypatch, eleven_env, azure_stub):
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("שלום")
        tts.synthesize_speech("שלום", is_fallback=True)

        normal = json.loads(reqs[0].content)["voice_settings"]["speed"]
        slow = json.loads(reqs[1].content)["voice_settings"]["speed"]
        assert slow < normal
        # ElevenLabs documents a 0.7 floor for speed.
        assert slow >= 0.7

    def test_logs_tts_ok_with_chars(self, monkeypatch, eleven_env, azure_stub, caplog):
        _install_transport(monkeypatch, _ok)

        with caplog.at_level(logging.INFO, logger="lisan.tts"):
            tts.synthesize_speech("שלום")

        events = [r.msg for r in caplog.records if isinstance(r.msg, dict)]
        ok = [e for e in events if e.get("event") == "tts_ok"]
        assert ok, events
        assert ok[0]["provider"] == "elevenlabs"
        assert ok[0]["chars"] == len("שלום")
        assert "latency_ms" in ok[0]


# ── Fallback to Azure ────────────────────────────────────────────────────────

class TestFallbackToAzure:
    @pytest.mark.parametrize("status,reason", [
        (401, "auth"),
        (429, "rate_limited"),
        (500, "server_error"),
        (503, "server_error"),
    ])
    def test_http_errors_fall_back(
        self, monkeypatch, eleven_env, azure_stub, caplog, status, reason
    ):
        _install_transport(
            monkeypatch,
            lambda r: httpx.Response(status, json={"detail": {"status": "x"}}),
        )

        with caplog.at_level(logging.INFO, logger="lisan.tts"):
            audio = tts.synthesize_speech("שלום")

        assert audio == AZURE_MP3
        assert len(azure_stub) == 1
        events = [r.msg for r in caplog.records if isinstance(r.msg, dict)]
        failed = [e for e in events if e.get("event") == "tts_provider_failed"]
        assert failed and failed[0]["provider"] == "elevenlabs"
        assert failed[0]["reason"] == reason
        assert "latency_ms" in failed[0]
        ok = [e for e in events if e.get("event") == "tts_ok"]
        assert ok and ok[0]["provider"] == "azure"

    def test_timeout_falls_back(self, monkeypatch, eleven_env, azure_stub, caplog):
        def boom(request):
            raise httpx.ReadTimeout("slow", request=request)

        _install_transport(monkeypatch, boom)

        with caplog.at_level(logging.INFO, logger="lisan.tts"):
            audio = tts.synthesize_speech("שלום")

        assert audio == AZURE_MP3
        events = [r.msg for r in caplog.records if isinstance(r.msg, dict)]
        failed = [e for e in events if e.get("event") == "tts_provider_failed"]
        assert failed[0]["reason"] == "timeout"

    def test_missing_key_falls_back(self, monkeypatch, eleven_env, azure_stub):
        monkeypatch.delenv("ELEVENLABS_API_KEY")
        reqs = _install_transport(monkeypatch, _ok)

        assert tts.synthesize_speech("שלום") == AZURE_MP3
        assert reqs == []

    def test_fallback_keeps_is_fallback_flag(self, monkeypatch, eleven_env, azure_stub):
        _install_transport(monkeypatch, lambda r: httpx.Response(429))

        tts.synthesize_speech("שלום", is_fallback=True)

        assert azure_stub[0]["is_fallback"] is True

    def test_no_fallback_configured_raises(self, monkeypatch, eleven_env, azure_stub):
        monkeypatch.setenv("TTS_FALLBACK_PROVIDER", "")
        _install_transport(monkeypatch, lambda r: httpx.Response(401))

        with pytest.raises(TTSAuthError):
            tts.synthesize_speech("שלום")
        assert azure_stub == []

    def test_both_fail_raises_tts_error(self, monkeypatch, eleven_env):
        def azure_down(clean, **kwargs):
            raise TTSError("azure down")

        monkeypatch.setattr(tts, "_synthesize_azure", azure_down)
        _install_transport(monkeypatch, lambda r: httpx.Response(500))

        with pytest.raises(TTSError):
            tts.synthesize_speech("שלום")


# ── Circuit breakers ─────────────────────────────────────────────────────────

class TestPerProviderCircuit:
    def test_elevenlabs_circuit_opens_and_skips_http(
        self, monkeypatch, eleven_env, azure_stub
    ):
        from services.voice_circuits import elevenlabs_tts_circuit, tts_circuit

        reqs = _install_transport(monkeypatch, lambda r: httpx.Response(500))

        for i in range(5):
            assert tts.synthesize_speech(f"שלום {i}") == AZURE_MP3

        # Breaker threshold is 3 → later calls never hit ElevenLabs.
        assert len(reqs) == 3
        assert elevenlabs_tts_circuit.state.value == "open"
        # Azure's breaker is independent and untouched by ElevenLabs failures.
        assert tts_circuit.state.value == "closed"

    def test_health_reports_per_provider_circuits(self, monkeypatch):
        from fastapi.testclient import TestClient
        from main import app

        monkeypatch.setenv("AI_SERVICE_INTERNAL_SECRET", "")
        client = TestClient(app)
        resp = client.get("/api/ai/chat/voice/health")

        assert resp.status_code == 200
        body = resp.json()
        assert body["tts_circuit"] == "closed"
        assert body["tts_circuits"] == {"azure": "closed", "elevenlabs": "closed"}
        assert body["tts_provider"] in {"azure", "elevenlabs"}


# ── Audio cache ──────────────────────────────────────────────────────────────

class TestAudioCache:
    def test_cache_hit_avoids_second_call(self, monkeypatch, eleven_env, azure_stub):
        reqs = _install_transport(monkeypatch, _ok)

        first = tts.synthesize_speech("שלום")
        second = tts.synthesize_speech("שלום")

        assert first == second == FAKE_MP3
        assert len(reqs) == 1

    def test_speed_is_part_of_key(self, monkeypatch, eleven_env, azure_stub):
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("שלום")
        tts.synthesize_speech("שלום", is_fallback=True)

        assert len(reqs) == 2

    def test_voice_is_part_of_key(self, monkeypatch, eleven_env, azure_stub):
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("שלום")
        monkeypatch.setenv("ELEVENLABS_VOICE_ID", "other-voice")
        tts.synthesize_speech("שלום")

        assert len(reqs) == 2

    def test_failures_are_not_cached(self, monkeypatch, eleven_env, azure_stub):
        responses = [httpx.Response(429), _ok(None)]  # type: ignore[arg-type]
        reqs = _install_transport(monkeypatch, lambda r: responses.pop(0))

        assert tts.synthesize_speech("שלום") == AZURE_MP3
        assert tts.synthesize_speech("שלום") == FAKE_MP3
        assert len(reqs) == 2

    def test_lru_size_cap(self, monkeypatch, eleven_env, azure_stub):
        monkeypatch.setenv("TTS_CACHE_MAX_ENTRIES", "2")
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("אחת")
        tts.synthesize_speech("שתיים")
        tts.synthesize_speech("שלוש")   # evicts "אחת"
        tts.synthesize_speech("אחת")    # miss → new call

        assert len(reqs) == 4
        assert tts.tts_audio_cache_size() <= 2

    def test_cache_disabled_with_zero(self, monkeypatch, eleven_env, azure_stub):
        monkeypatch.setenv("TTS_CACHE_MAX_ENTRIES", "0")
        reqs = _install_transport(monkeypatch, _ok)

        tts.synthesize_speech("שלום")
        tts.synthesize_speech("שלום")

        assert len(reqs) == 2


# ── Display text (ssmlText) ──────────────────────────────────────────────────

class TestDisplayMarkup:
    def test_azure_returns_ssml(self, monkeypatch):
        monkeypatch.setenv("TTS_PROVIDER", "azure")
        assert tts.build_tts_markup("שלום.").startswith("<speak ")

    def test_elevenlabs_returns_prepared_text(self, monkeypatch):
        monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
        monkeypatch.setenv("TTS_NIQQUD_ENGINE", "lexicon")
        out = tts.build_tts_markup("את רוצה?")
        assert "<speak" not in out
        assert tts._FEMININE_DIRECT_FORMS["את"] in out

    def test_empty_text(self, monkeypatch):
        monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
        assert tts.build_tts_markup("  ") == ""


# ── Azure-only path unchanged ────────────────────────────────────────────────

class TestAzureDefaultPath:
    def test_azure_without_credentials_still_raises_auth(self, monkeypatch):
        monkeypatch.delenv("TTS_PROVIDER", raising=False)
        monkeypatch.delenv("TTS_FALLBACK_PROVIDER", raising=False)
        monkeypatch.delenv("AZURE_SPEECH_KEY", raising=False)
        monkeypatch.delenv("AZURE_SPEECH_REGION", raising=False)
        tts.clear_tts_audio_cache()

        with pytest.raises(TTSAuthError):
            tts.synthesize_speech("שלום")

    def test_azure_primary_never_calls_elevenlabs(self, monkeypatch, azure_stub):
        monkeypatch.setenv("TTS_PROVIDER", "azure")
        monkeypatch.delenv("TTS_FALLBACK_PROVIDER", raising=False)
        tts.clear_tts_audio_cache()
        reqs = _install_transport(monkeypatch, _ok)

        assert tts.synthesize_speech("שלום") == AZURE_MP3
        assert reqs == []


# ── Route contract unchanged ─────────────────────────────────────────────────

class TestTtsRouteWithElevenLabs:
    def test_chat_tts_returns_mp3_and_prepared_text(
        self, monkeypatch, eleven_env, azure_stub
    ):
        import base64

        from fastapi.testclient import TestClient
        from main import app

        monkeypatch.setenv("AI_SERVICE_INTERNAL_SECRET", "")
        _install_transport(monkeypatch, _ok)
        client = TestClient(app)

        resp = client.post("/api/ai/chat/tts", json={"text": "את רוצה קפה?"})

        assert resp.status_code == 200
        body = resp.json()
        assert base64.b64decode(body["audioBase64"]) == FAKE_MP3
        assert body["fallbackUsed"] is False
        assert "<speak" not in body["ssmlText"]
        assert tts._FEMININE_DIRECT_FORMS["את"] in body["ssmlText"]
