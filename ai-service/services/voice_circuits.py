"""
voice_circuits.py  —  Task 4 of CLAUDE_BACKEND_AI_PLAN.md

Dedicated Circuit Breakers for STT and TTS services.
These are separate from the LLM provider circuit (chat_circuit_breaker.py)
so that a Whisper outage doesn't trip the chat circuit and vice-versa.

Configuration via env vars:
  STT_CIRCUIT_FAILURE_THRESHOLD  (default 3)
  STT_CIRCUIT_WINDOW_SECONDS     (default 60)
  STT_CIRCUIT_RECOVERY_SECONDS   (default 30)
  TTS_CIRCUIT_FAILURE_THRESHOLD  (default 3)
  TTS_CIRCUIT_WINDOW_SECONDS     (default 60)
  TTS_CIRCUIT_RECOVERY_SECONDS   (default 30)
"""
from __future__ import annotations

import os
from services.chat_circuit_breaker import CircuitBreaker


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


# ── STT circuit (primary engine, e.g. Azure) ──────────────────────────────────
stt_circuit = CircuitBreaker(
    failure_threshold=_int_env("STT_CIRCUIT_FAILURE_THRESHOLD", 3),
    window_seconds=_float_env("STT_CIRCUIT_WINDOW_SECONDS", 60.0),
    recovery_seconds=_float_env("STT_CIRCUIT_RECOVERY_SECONDS", 30.0),
)

# ── Whisper STT circuit (fallback engine) ─────────────────────────────────────
# Separate from stt_circuit so a primary (Azure) outage that trips its breaker
# does NOT also block the Whisper fallback, and vice-versa.
whisper_circuit = CircuitBreaker(
    failure_threshold=_int_env("WHISPER_CIRCUIT_FAILURE_THRESHOLD", 3),
    window_seconds=_float_env("WHISPER_CIRCUIT_WINDOW_SECONDS", 60.0),
    recovery_seconds=_float_env("WHISPER_CIRCUIT_RECOVERY_SECONDS", 30.0),
)

# ── TTS circuit ───────────────────────────────────────────────────────────────
tts_circuit = CircuitBreaker(
    failure_threshold=_int_env("TTS_CIRCUIT_FAILURE_THRESHOLD", 3),
    window_seconds=_float_env("TTS_CIRCUIT_WINDOW_SECONDS", 60.0),
    recovery_seconds=_float_env("TTS_CIRCUIT_RECOVERY_SECONDS", 30.0),
)
