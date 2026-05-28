"""
locustfile.py — Lisan AI Service load test

Usage (headless, 50 concurrent voice users, 60s run):
    locust -f load_tests/locustfile.py LisanVoiceUser \
           --headless -u 50 -r 5 -t 60s \
           --host http://localhost:8000

Usage (web UI):
    locust -f load_tests/locustfile.py --host http://localhost:8000

Environment variables:
    LISAN_INTERNAL_SECRET   X-Internal-Service-Secret header value (optional)
    LISAN_LOAD_LEVEL        Hebrew level to send (default: A1)

Scenarios
─────────
LisanTextUser   — text-only chat, 10 concurrent users baseline
LisanVoiceUser  — voice pipeline (STT → chat → pron), 50 concurrent
LisanMixedUser  — 70% text / 30% voice, realistic production mix
LisanAnalyticsUser — polls /analytics, simulates admin dashboard

Circuit-breaker validation
──────────────────────────
After each failed voice request the test logs the fallback reason.
A custom environment check fires if the STT_CIRCUIT_OPEN rate exceeds
20% of responses — that signals the circuit breaker is working correctly
under load.
"""
from __future__ import annotations

import io
import math
import os
import struct
import wave
from typing import Any

from locust import HttpUser, TaskSet, between, events, task

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_SECRET = os.getenv("LISAN_INTERNAL_SECRET", "")
_LEVEL = os.getenv("LISAN_LOAD_LEVEL", "A1")

_HEADERS: dict[str, str] = {}
if _SECRET:
    _HEADERS["X-Internal-Service-Secret"] = _SECRET

# A1 messages that should always succeed
_TEXT_MESSAGES = [
    "שלום",
    "מה שמך?",
    "איפה אתה גר?",
    "כן",
    "מה אתה עושה?",
    "אני לומד עברית.",
    "תודה",
    "בבקשה",
]

# ---------------------------------------------------------------------------
# Audio fixture — 0.5s 16kHz sine wave WAV (valid Hebrew STT input)
# ---------------------------------------------------------------------------

def _build_wav_bytes(duration_seconds: float = 0.5, sample_rate: int = 16_000) -> bytes:
    """Generate a minimal valid WAV file (sine tone at 440 Hz)."""
    n_frames = int(sample_rate * duration_seconds)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = b"".join(
            struct.pack(
                "<h",
                int(0.3 * math.sin(2 * math.pi * 440 * i / sample_rate) * 32767),
            )
            for i in range(n_frames)
        )
        wf.writeframes(frames)
    return buf.getvalue()


_WAV_BYTES = _build_wav_bytes()

# ---------------------------------------------------------------------------
# Shared response tracker (thread-safe via Locust's event system)
# ---------------------------------------------------------------------------

_stats: dict[str, int] = {
    "voice_total": 0,
    "voice_fallback": 0,
    "stt_circuit_open": 0,
}


def _record_voice_response(data: dict[str, Any]) -> None:
    _stats["voice_total"] += 1
    if data.get("fallbackUsed"):
        _stats["voice_fallback"] += 1
        if data.get("fallbackReason") == "STT_CIRCUIT_OPEN":
            _stats["stt_circuit_open"] += 1


# ---------------------------------------------------------------------------
# Task sets
# ---------------------------------------------------------------------------

class TextChatTasks(TaskSet):
    """Pure text-chat tasks — exercises the main /chat pipeline."""

    @task(3)
    def send_greeting(self):
        self.client.post(
            "/api/ai/chat",
            json={"message": "שלום", "level": _LEVEL},
            headers=_HEADERS,
            name="/api/ai/chat [greeting]",
        )

    @task(2)
    def send_known_question(self):
        import random
        msg = random.choice(_TEXT_MESSAGES)
        self.client.post(
            "/api/ai/chat",
            json={"message": msg, "level": _LEVEL},
            headers=_HEADERS,
            name="/api/ai/chat [question]",
        )

    @task(1)
    def send_out_of_scope(self):
        self.client.post(
            "/api/ai/chat",
            json={"message": "ספר לי על ההיסטוריה של ישראל", "level": _LEVEL},
            headers=_HEADERS,
            name="/api/ai/chat [out-of-scope]",
        )

    @task(1)
    def check_analytics(self):
        self.client.get(
            "/api/ai/analytics",
            headers=_HEADERS,
            name="/api/ai/analytics",
        )


class VoiceChatTasks(TaskSet):
    """Voice pipeline tasks — STT → chat → pronunciation (50 concurrent)."""

    @task(4)
    def send_voice_message(self):
        files = {"audio": ("test.wav", _WAV_BYTES, "audio/wav")}
        data = {"level": _LEVEL, "includeArabic": "false"}
        with self.client.post(
            "/api/ai/chat/voice",
            files=files,
            data=data,
            headers=_HEADERS,
            name="/api/ai/chat/voice",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                body = resp.json()
                _record_voice_response(body)
                # Fallback is expected when STT is disabled — not a test failure
                resp.success()
            elif resp.status_code == 429:
                resp.failure(f"Rate limited: {resp.text[:100]}")
            else:
                resp.failure(f"Unexpected status {resp.status_code}: {resp.text[:200]}")

    @task(1)
    def check_voice_health(self):
        self.client.get(
            "/api/ai/chat/voice/health",
            headers=_HEADERS,
            name="/api/ai/chat/voice/health",
        )

    @task(1)
    def send_text_chat(self):
        self.client.post(
            "/api/ai/chat",
            json={"message": "שלום", "level": _LEVEL},
            headers=_HEADERS,
            name="/api/ai/chat [from voice user]",
        )


class StreamingChatTasks(TaskSet):
    """SSE streaming endpoint — verifies tokens arrive and [DONE] is sent."""

    @task
    def stream_response(self):
        with self.client.post(
            "/api/ai/chat/stream",
            json={"message": "מה שמך?", "level": _LEVEL},
            headers={**_HEADERS, "Accept": "text/event-stream"},
            name="/api/ai/chat/stream",
            catch_response=True,
            stream=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"Stream returned {resp.status_code}")
                return
            body = resp.text
            if "[DONE]" not in body:
                resp.failure("Stream did not contain [DONE] sentinel")
            else:
                resp.success()


# ---------------------------------------------------------------------------
# User classes
# ---------------------------------------------------------------------------

class LisanTextUser(HttpUser):
    """10-user baseline — pure text chat, tight wait time."""
    tasks = [TextChatTasks]
    wait_time = between(1, 3)


class LisanVoiceUser(HttpUser):
    """50-user voice stress test — the primary T10 scenario."""
    tasks = [VoiceChatTasks]
    wait_time = between(2, 5)


class LisanMixedUser(HttpUser):
    """Realistic production mix: 70% text, 30% voice."""
    tasks = {TextChatTasks: 7, VoiceChatTasks: 3}
    wait_time = between(1, 4)


class LisanStreamingUser(HttpUser):
    """Streaming-endpoint stress test."""
    tasks = [StreamingChatTasks]
    wait_time = between(1, 3)


# ---------------------------------------------------------------------------
# Custom test-run hooks
# ---------------------------------------------------------------------------

@events.quitting.add_listener
def _on_quit(environment, **kwargs):
    """
    Print a circuit-breaker health summary when the test run ends.
    Fails the run if the STT circuit-open rate exceeds 20% (circuit never
    closed = infra problem; some circuit-opens are expected and healthy).
    """
    total = _stats["voice_total"]
    if total == 0:
        return

    circuit_rate = _stats["stt_circuit_open"] / total
    fallback_rate = _stats["voice_fallback"] / total

    print("\n" + "=" * 60)
    print("Circuit Breaker Summary")
    print("=" * 60)
    print(f"  Voice requests:      {total}")
    print(f"  Fallback rate:       {fallback_rate:.1%}")
    print(f"  STT circuit-open:    {_stats['stt_circuit_open']} ({circuit_rate:.1%})")
    print("=" * 60)

    if circuit_rate > 0.20:
        print("WARN: STT circuit-open rate > 20% — STT service may be down")
        environment.process_exit_code = 1
