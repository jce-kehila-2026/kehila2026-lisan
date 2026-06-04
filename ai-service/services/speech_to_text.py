"""
Speech-to-Text service for Lisan AI.
Uses Azure Cognitive Services Speech SDK to transcribe Hebrew audio.

Reliability:
  - stt_circuit CircuitBreaker: trips after 3 failures in 60 s, recovers after 30 s.
  - Hard timeout: STT_TIMEOUT_SECONDS (default 15 s).
  - Fallback codes: STT_FAILED, STT_TIMEOUT, STT_CIRCUIT_OPEN, STT_EMPTY.

Why Azure instead of Whisper:
  - Azure Speech has a free tier (5 hours/month) — zero cost for dev/small usage.
  - AZURE_SPEECH_KEY + AZURE_SPEECH_REGION already configured in .env.
"""
from __future__ import annotations

import logging
import os
import tempfile
import time

logger = logging.getLogger("lisan.stt")


# ── Exception hierarchy ───────────────────────────────────────────────────────

class STTError(Exception):
    """Base STT failure — caller should return STT_FAILED fallback."""
    fallback_code: str = "STT_FAILED"


class STTTimeoutError(STTError):
    fallback_code = "STT_TIMEOUT"


class STTAuthError(STTError):
    fallback_code = "STT_FAILED"


class STTCircuitOpenError(STTError):
    """Circuit is open — too many recent failures, skip the call entirely."""
    fallback_code = "STT_CIRCUIT_OPEN"


# ── Public API ────────────────────────────────────────────────────────────────

def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe Hebrew audio bytes using Azure Speech SDK.

    Returns the transcribed Hebrew text.
    Raises an STTError subclass on failure — never raises naked exceptions.

    Reliability guarantees:
      1. Circuit breaker: if the STT service has failed ≥3 times in the last
         60 s, raises STTCircuitOpenError immediately without calling Azure.
      2. Timeout: hard cap at STT_TIMEOUT_SECONDS (default 15 s).
      3. On any failure, records it in the circuit breaker so future calls
         can skip the broken service quickly.
    """
    from services.voice_circuits import stt_circuit

    # ── Circuit open? Skip the network call entirely ──────────────────────
    if not stt_circuit.allow_request():
        logger.warning({"event": "stt_circuit_open", "state": str(stt_circuit.state)})
        raise STTCircuitOpenError("STT circuit is open — too many recent failures")

    speech_key    = os.getenv("AZURE_SPEECH_KEY", "").strip()
    speech_region = os.getenv("AZURE_SPEECH_REGION", "").strip()

    if not speech_key or not speech_region:
        stt_circuit.record_failure()
        raise STTAuthError("AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is not set")

    stt_timeout = float(os.getenv("STT_TIMEOUT_SECONDS", "15"))

    t0 = time.perf_counter()
    try:
        import azure.cognitiveservices.speech as speechsdk

        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key,
            region=speech_region,
        )
        speech_config.speech_recognition_language = "he-IL"

        # Azure SDK needs a file — write bytes to a temp file
        suffix = _get_suffix(filename)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            audio_config  = speechsdk.audio.AudioConfig(filename=tmp_path)
            recognizer    = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
            )

            # recognize_once() is synchronous and respects the timeout via done event
            import threading
            result_holder: list = []
            done_event = threading.Event()

            def handle_result(evt):
                result_holder.append(evt.result)
                done_event.set()

            recognizer.recognized.connect(handle_result)
            recognizer.canceled.connect(lambda evt: done_event.set())
            recognizer.session_stopped.connect(lambda evt: done_event.set())

            recognizer.start_continuous_recognition()
            done_event.wait(timeout=stt_timeout)
            # Force-stop with bounded wait; avoids dangling Azure thread
            # if the SDK is slow to drain on timeout.
            try:
                stop_future = recognizer.stop_continuous_recognition_async()
                # SDK Future supports .get(timeout) on most versions; fall back
                # to no-arg if unsupported.
                try:
                    stop_future.get(timeout=2.0)
                except TypeError:
                    stop_future.get()
            except Exception as stop_exc:
                logger.warning({
                    "event": "stt_stop_failed",
                    "detail": str(stop_exc),
                })
            # Disconnect handlers so the background thread can't write
            # into result_holder after this function returns.
            try:
                recognizer.recognized.disconnect_all()
                recognizer.canceled.disconnect_all()
                recognizer.session_stopped.disconnect_all()
            except Exception:
                pass

        finally:
            import os as _os
            try:
                _os.unlink(tmp_path)
            except OSError:
                pass

    except STTError:
        raise
    except Exception as exc:
        stt_circuit.record_failure()
        raise STTError(f"Azure STT error: {exc}") from exc

    latency_ms = int((time.perf_counter() - t0) * 1000)

    if not result_holder:
        # Timeout or canceled with no result
        stt_circuit.record_failure()
        raise STTTimeoutError("Azure STT did not return a result within timeout")

    result = result_holder[0]

    import azure.cognitiveservices.speech as speechsdk
    if result.reason == speechsdk.ResultReason.Canceled:
        cancellation = speechsdk.CancellationDetails.from_result(result)
        if cancellation.error_code == speechsdk.CancellationErrorCode.AuthenticationFailure:
            stt_circuit.record_failure()
            raise STTAuthError(f"Azure STT auth failed: {cancellation.error_details}")
        stt_circuit.record_failure()
        raise STTError(f"Azure STT canceled: {cancellation.error_details}")

    transcript = result.text.strip() if result.text else ""
    stt_circuit.record_success()
    logger.info({"event": "stt_success", "latency_ms": latency_ms, "chars": len(transcript)})
    return transcript


def _get_suffix(filename: str) -> str:
    """Return file extension with dot for tempfile."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
    return f".{ext}"
