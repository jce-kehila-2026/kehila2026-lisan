from __future__ import annotations

import os
import threading
import time
from enum import Enum


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


DEFAULT_FAILURE_THRESHOLD = 5
DEFAULT_WINDOW_SECONDS = 60.0
DEFAULT_RECOVERY_SECONDS = 20.0


class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int | None = None,
        window_seconds: float | None = None,
        recovery_seconds: float | None = None,
    ) -> None:
        self._failure_threshold = failure_threshold or int(
            os.getenv("CIRCUIT_FAILURE_THRESHOLD", str(DEFAULT_FAILURE_THRESHOLD))
        )
        self._window_seconds = window_seconds or float(
            os.getenv("CIRCUIT_WINDOW_SECONDS", str(DEFAULT_WINDOW_SECONDS))
        )
        self._recovery_seconds = recovery_seconds or float(
            os.getenv("CIRCUIT_RECOVERY_SECONDS", str(DEFAULT_RECOVERY_SECONDS))
        )
        self._lock = threading.Lock()
        self._failures: list[float] = []
        self._consecutive_failures = 0
        self._state = CircuitState.CLOSED
        self._opened_at: float | None = None

    @property
    def state(self) -> CircuitState:
        with self._lock:
            return self._resolve_state()

    def _resolve_state(self) -> CircuitState:
        if self._state == CircuitState.OPEN and self._opened_at is not None:
            if time.monotonic() - self._opened_at >= self._recovery_seconds:
                self._state = CircuitState.HALF_OPEN
        return self._state

    def allow_request(self) -> bool:
        with self._lock:
            state = self._resolve_state()
            return state != CircuitState.OPEN

    def record_success(self) -> None:
        with self._lock:
            self._consecutive_failures = 0
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.CLOSED
                self._failures.clear()
                self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            now = time.monotonic()
            cutoff = now - self._window_seconds
            self._failures = [t for t in self._failures if t > cutoff]
            self._consecutive_failures = len(self._failures)
            self._failures.append(now)
            self._consecutive_failures += 1

            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                self._opened_at = now
            elif self._consecutive_failures >= self._failure_threshold:
                self._state = CircuitState.OPEN
                self._opened_at = now

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()
            self._consecutive_failures = 0
            self._state = CircuitState.CLOSED
            self._opened_at = None


provider_circuit = CircuitBreaker()
