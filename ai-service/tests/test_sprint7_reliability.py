"""
Sprint 7 — AI Reliability Hardening tests.

Covers:
  - Provider failure classification (timeout, quota, auth, network)
  - Circuit breaker (opens after N failures, recovers, half-open probe)
  - Structured logging output
  - includeArabic eval scenarios
  - No regression on fallback text mapping

Run:
    cd ai-service
    python -m pytest tests/test_sprint7_reliability.py -v
"""

from __future__ import annotations

import json
import logging
import time
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest

from services.chat_circuit_breaker import CircuitBreaker, CircuitState
from services.chat_guardrails import FALLBACK_RESPONSES, get_fallback_text
from services.chat_provider import (
    ChatProviderAuthError,
    ChatProviderError,
    ChatProviderNetworkError,
    ChatProviderQuotaError,
    ChatProviderTimeoutError,
    _classify_and_raise,
)
from services.chat_schemas import ChatRequest, ChatResponse


# ---------------------------------------------------------------------------
# Provider failure classification
# ---------------------------------------------------------------------------

class TestFailureClassification:
    def test_timeout_detection(self):
        with pytest.raises(ChatProviderTimeoutError):
            _classify_and_raise(RuntimeError("request timed out"))

    def test_timeout_keyword_timeout(self):
        with pytest.raises(ChatProviderTimeoutError):
            _classify_and_raise(RuntimeError("timeout exceeded"))

    def test_quota_429(self):
        with pytest.raises(ChatProviderQuotaError):
            _classify_and_raise(RuntimeError("429 Resource exhausted"))

    def test_quota_rate_limit(self):
        with pytest.raises(ChatProviderQuotaError):
            _classify_and_raise(RuntimeError("rate limit exceeded"))

    def test_quota_resource_exhausted(self):
        with pytest.raises(ChatProviderQuotaError):
            _classify_and_raise(RuntimeError("resource_exhausted"))

    def test_auth_invalid_key(self):
        with pytest.raises(ChatProviderAuthError):
            _classify_and_raise(RuntimeError("invalid API key provided"))

    def test_auth_unauthorized(self):
        with pytest.raises(ChatProviderAuthError):
            _classify_and_raise(RuntimeError("401 Unauthorized"))

    def test_auth_api_key_missing(self):
        with pytest.raises(ChatProviderAuthError):
            _classify_and_raise(RuntimeError("api_key not valid"))

    def test_network_connection_error(self):
        with pytest.raises(ChatProviderNetworkError):
            _classify_and_raise(RuntimeError("Connection refused"))

    def test_network_dns(self):
        with pytest.raises(ChatProviderNetworkError):
            _classify_and_raise(RuntimeError("DNS resolution failed"))

    def test_network_unreachable(self):
        with pytest.raises(ChatProviderNetworkError):
            _classify_and_raise(RuntimeError("host unreachable"))

    def test_generic_error_stays_generic(self):
        with pytest.raises(ChatProviderError):
            _classify_and_raise(RuntimeError("something unexpected happened"))


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

class TestCircuitBreaker:
    def test_starts_closed(self):
        cb = CircuitBreaker(failure_threshold=3, window_seconds=60, recovery_seconds=5)
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True

    def test_opens_after_threshold(self):
        cb = CircuitBreaker(failure_threshold=3, window_seconds=60, recovery_seconds=5)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.allow_request() is False

    def test_recovers_to_half_open(self):
        cb = CircuitBreaker(failure_threshold=2, window_seconds=60, recovery_seconds=0.1)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        time.sleep(0.15)
        assert cb.state == CircuitState.HALF_OPEN
        assert cb.allow_request() is True

    def test_half_open_success_closes(self):
        cb = CircuitBreaker(failure_threshold=2, window_seconds=60, recovery_seconds=0.1)
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.15)
        assert cb.state == CircuitState.HALF_OPEN
        cb.record_success()
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True

    def test_half_open_failure_reopens(self):
        cb = CircuitBreaker(failure_threshold=2, window_seconds=60, recovery_seconds=0.1)
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.15)
        assert cb.state == CircuitState.HALF_OPEN
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_old_failures_expire(self):
        cb = CircuitBreaker(failure_threshold=3, window_seconds=0.1, recovery_seconds=5)
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.15)
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED

    def test_reset(self):
        cb = CircuitBreaker(failure_threshold=2, window_seconds=60, recovery_seconds=5)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        cb.reset()
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True


# ---------------------------------------------------------------------------
# Fallback text coverage
# ---------------------------------------------------------------------------

class TestFallbackTexts:
    EXPECTED_REASONS = [
        "EMPTY_MESSAGE",
        "MIXED_LANGUAGE",
        "OUT_OF_SCOPE",
        "VOCAB_LEAKAGE",
        "MESSAGE_TOO_LONG",
        "MODEL_TIMEOUT",
        "MODEL_ERROR",
        "EMPTY_RESPONSE",
        "PROVIDER_QUOTA",
        "PROVIDER_AUTH",
        "PROVIDER_NETWORK",
        "CIRCUIT_OPEN",
    ]

    @pytest.mark.parametrize("reason", EXPECTED_REASONS)
    def test_every_reason_has_text(self, reason):
        text = get_fallback_text(reason)
        assert text, f"No fallback text for reason={reason}"
        assert len(text) > 0

    def test_unknown_reason_returns_default(self):
        text = get_fallback_text("SOME_UNKNOWN_REASON")
        assert text == FALLBACK_RESPONSES["OUT_OF_SCOPE"]

    def test_circuit_open_text_is_distinct(self):
        assert FALLBACK_RESPONSES["CIRCUIT_OPEN"] != FALLBACK_RESPONSES["MODEL_ERROR"]


# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------

class TestStructuredLogging:
    @patch("services.chat_engine.call_provider")
    @patch("services.chat_engine.provider_circuit")
    def test_log_fields_on_provider_call(self, mock_circuit, mock_call, caplog):
        from services.chat_provider import ProviderResult

        mock_circuit.allow_request.return_value = True
        mock_circuit.record_success = MagicMock()
        mock_call.return_value = ProviderResult(
            answer="שלום.",
            latency_seconds=0.05,
            input_tokens=10,
            output_tokens=5,
        )

        from services.chat_engine import generate_chat_response

        with caplog.at_level(logging.INFO, logger="lisan.chat"):
            response = generate_chat_response(
                ChatRequest(message="שלום", level="A1", includeArabic=False)
            )

        log_lines = [r.message for r in caplog.records if "chat_response" in r.message]
        assert len(log_lines) >= 1
        log_data = json.loads(log_lines[-1])
        assert "provider" in log_data
        assert "model" in log_data
        assert "latencyMs" in log_data
        assert "fallbackUsed" in log_data
        assert "cacheHit" in log_data
        assert "routerHit" in log_data
        assert "chunksCount" in log_data


# ---------------------------------------------------------------------------
# ChatResponse schema — provider field
# ---------------------------------------------------------------------------

class TestProviderField:
    def test_provider_field_optional(self):
        resp = ChatResponse(
            answerHe="שלום",
            answerAr=None,
            fallbackUsed=False,
            fallbackReason=None,
            level="A1",
            model="gemini-2.5-flash-lite",
            latencyMs=0,
        )
        assert resp.provider is None

    def test_provider_field_populated(self):
        resp = ChatResponse(
            answerHe="שלום",
            answerAr=None,
            fallbackUsed=False,
            fallbackReason=None,
            level="A1",
            model="gemini-2.5-flash-lite",
            provider="gemini",
            latencyMs=0,
        )
        assert resp.provider == "gemini"


# ---------------------------------------------------------------------------
# Engine integration — circuit breaker fallback
# ---------------------------------------------------------------------------

def _engine_patches():
    """Patches that force a message through to the provider call path."""
    return [
        patch("services.chat_engine.route_message", return_value=None),
        patch("services.chat_engine.is_clearly_out_of_scope", return_value=False),
    ]


class TestEngineCircuitBreaker:
    def test_circuit_open_returns_fallback(self):
        with ExitStack() as stack:
            for patcher in _engine_patches():
                stack.enter_context(patcher)
            mock_circuit = stack.enter_context(patch("services.chat_engine.provider_circuit"))
            mock_circuit.allow_request.return_value = False

            from services.chat_engine import generate_chat_response

            response = generate_chat_response(
                ChatRequest(message="מה השעה?", level="A1", includeArabic=False)
            )
            assert response.fallbackUsed is True
            assert response.fallbackReason == "CIRCUIT_OPEN"
            assert response.answerHe == FALLBACK_RESPONSES["CIRCUIT_OPEN"]

    def test_quota_error_records_failure(self):
        with ExitStack() as stack:
            for patcher in _engine_patches():
                stack.enter_context(patcher)
            mock_circuit = stack.enter_context(patch("services.chat_engine.provider_circuit"))
            mock_call = stack.enter_context(patch("services.chat_engine.call_provider"))
            mock_circuit.allow_request.return_value = True
            mock_call.side_effect = ChatProviderQuotaError("429 quota")

            from services.chat_engine import generate_chat_response

            response = generate_chat_response(
                ChatRequest(message="מה השעה?", level="A1", includeArabic=False)
            )
            assert response.fallbackUsed is True
            assert response.fallbackReason == "PROVIDER_QUOTA"
            mock_circuit.record_failure.assert_not_called()

    def test_auth_error_records_failure(self):
        with ExitStack() as stack:
            for patcher in _engine_patches():
                stack.enter_context(patcher)
            mock_circuit = stack.enter_context(patch("services.chat_engine.provider_circuit"))
            mock_call = stack.enter_context(patch("services.chat_engine.call_provider"))
            mock_circuit.allow_request.return_value = True
            mock_call.side_effect = ChatProviderAuthError("invalid key")

            from services.chat_engine import generate_chat_response

            response = generate_chat_response(
                ChatRequest(message="מה השעה?", level="A1", includeArabic=False)
            )
            assert response.fallbackUsed is True
            assert response.fallbackReason == "PROVIDER_AUTH"
            mock_circuit.record_failure.assert_called_once()

    def test_network_error_records_failure(self):
        with ExitStack() as stack:
            for patcher in _engine_patches():
                stack.enter_context(patcher)
            mock_circuit = stack.enter_context(patch("services.chat_engine.provider_circuit"))
            mock_call = stack.enter_context(patch("services.chat_engine.call_provider"))
            mock_circuit.allow_request.return_value = True
            mock_call.side_effect = ChatProviderNetworkError("connection refused")

            from services.chat_engine import generate_chat_response

            response = generate_chat_response(
                ChatRequest(message="מה השעה?", level="A1", includeArabic=False)
            )
            assert response.fallbackUsed is True
            assert response.fallbackReason == "PROVIDER_NETWORK"
            mock_circuit.record_failure.assert_called_once()

    def test_success_records_success(self):
        from services.chat_provider import ProviderResult

        with ExitStack() as stack:
            for patcher in _engine_patches():
                stack.enter_context(patcher)
            mock_circuit = stack.enter_context(patch("services.chat_engine.provider_circuit"))
            mock_call = stack.enter_context(patch("services.chat_engine.call_provider"))
            mock_circuit.allow_request.return_value = True
            mock_call.return_value = ProviderResult(
                answer="שלום.",
                latency_seconds=0.05,
                input_tokens=10,
                output_tokens=5,
            )

            from services.chat_engine import generate_chat_response

            generate_chat_response(
                ChatRequest(message="מה השעה?", level="A1", includeArabic=False)
            )
            mock_circuit.record_success.assert_called_once()


# ---------------------------------------------------------------------------
# Hebrew-only includeArabic eval scenarios
# ---------------------------------------------------------------------------

ARABIC_EVAL_CASES = [
    ("שלום", True, "A1"),
    ("תודה", True, "A1"),
    ("מה שלומך", True, "A1"),
    ("בוקר טוב", True, "A1"),
    ("שלום", False, "A1"),
]


class TestHebrewOnlyIncludeArabicEval:
    @pytest.mark.parametrize("message,include_arabic,level", ARABIC_EVAL_CASES)
    @patch("services.chat_engine.call_provider")
    @patch("services.chat_engine.provider_circuit")
    def test_include_arabic_flag_is_ignored(
        self, mock_circuit, mock_call, message, include_arabic, level
    ):
        from services.chat_provider import ProviderResult

        mock_circuit.allow_request.return_value = True
        mock_circuit.record_success = MagicMock()
        mock_call.return_value = ProviderResult(
            answer="שלום.\n(مرحبا)",
            latency_seconds=0.05,
            input_tokens=10,
            output_tokens=5,
        )

        from services.chat_engine import generate_chat_response

        response = generate_chat_response(
            ChatRequest(message=message, level=level, includeArabic=include_arabic)
        )
        assert response.answerHe is not None and len(response.answerHe) > 0
        assert response.answerAr is None
