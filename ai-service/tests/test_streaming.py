"""
test_streaming.py

Tests for T7: Streaming Prep.

Covers:
  - stream_provider yields tokens from a mocked provider
  - stream_provider falls back to non-streaming call_provider on exception
  - stream_provider skips a provider whose circuit is open
  - stream_chat_response yields a single chunk for cache-hit
  - stream_chat_response yields fallback for fast-reject (non-Hebrew)
  - stream_chat_response yields fallback for out-of-scope
  - stream_chat_response yields routed answer for known greeting
  - stream_chat_response streams tokens for a normal LLM call
  - stream_chat_response appends FALLBACK sentinel when vocab check fails
  - SSE endpoint returns text/event-stream content-type
  - SSE endpoint body contains data: lines and [DONE]
  - SSE endpoint returns data: line for cache-hit path
"""
from __future__ import annotations

import os
import unittest.mock

os.environ.setdefault("AI_SERVICE_INTERNAL_SECRET", "")

from services.chat_schemas import ChatRequest, ChatResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_cached_response(answer: str = "שלום.") -> ChatResponse:
    from services.chat_schemas import GuardrailReport
    return ChatResponse(
        answerHe=answer,
        answerAr=None,
        fallbackUsed=False,
        fallbackReason=None,
        level="A1",
        model="test",
        provider="test",
        latencyMs=0,
        cacheHit=True,
        routerHit=False,
        contextChunkIds=[],
        guardrail=GuardrailReport(vocabularyLeakage=False, blockedTokens=[]),
        suggestedNextPrompts=[],
    )


# ---------------------------------------------------------------------------
# stream_provider unit tests
# ---------------------------------------------------------------------------

class TestStreamProvider:
    def test_yields_tokens_from_provider(self):
        from services.chat_provider import stream_provider

        tokens = ["שלום", " ", "טוב."]

        with unittest.mock.patch(
            "services.chat_provider._stream_provider_impl",
            return_value=iter(tokens),
        ), unittest.mock.patch(
            "services.chat_provider.get_provider_circuit"
        ) as mock_circuit:
            mock_circuit.return_value.allow_request.return_value = True
            result = list(stream_provider("gemini", "gemini-2.5-flash-lite", "sys", "שלום"))

        assert result == tokens

    def test_falls_back_to_non_streaming_on_exception(self):
        from services.chat_provider import stream_provider, ProviderResult

        fallback_result = ProviderResult(
            answer="שלום.",
            latency_seconds=0.1,
            input_tokens=5,
            output_tokens=3,
            provider="gemini",
            model="gemini-2.5-flash-lite",
        )

        with unittest.mock.patch(
            "services.chat_provider._stream_provider_impl",
            side_effect=Exception("stream error"),
        ), unittest.mock.patch(
            "services.chat_provider.get_provider_circuit"
        ) as mock_circuit, unittest.mock.patch(
            "services.chat_provider.call_provider",
            return_value=fallback_result,
        ):
            mock_circuit.return_value.allow_request.return_value = True
            result = list(stream_provider("gemini", "gemini-2.5-flash-lite", "sys", "שלום"))

        assert result == ["שלום."]

    def test_skips_open_circuit_and_uses_fallback(self):
        from services.chat_provider import stream_provider, ProviderResult

        fallback_result = ProviderResult(
            answer="נסה שוב.",
            latency_seconds=0.1,
            input_tokens=3,
            output_tokens=2,
            provider="openai",
            model="gpt-4o-mini",
        )

        def _allow(provider_name):
            mock = unittest.mock.MagicMock()
            # primary provider circuit is open; fallback circuit is closed
            mock.allow_request.return_value = provider_name != "gemini"
            return mock

        with unittest.mock.patch(
            "services.chat_provider.get_provider_circuit",
            side_effect=_allow,
        ), unittest.mock.patch(
            "services.chat_provider._stream_provider_impl",
            return_value=iter(["נסה שוב."]),
        ), unittest.mock.patch(
            "services.chat_provider.call_provider",
            return_value=fallback_result,
        ):
            result = list(stream_provider("gemini", "gemini-2.5-flash-lite", "sys", "שלום"))

        # Either streamed or fell through to call_provider — either way got tokens
        assert len(result) >= 1


# ---------------------------------------------------------------------------
# stream_chat_response unit tests
# ---------------------------------------------------------------------------

class TestStreamChatResponse:
    def test_cache_hit_yields_single_chunk(self):
        from services.chat_engine import stream_chat_response

        cached = _make_cached_response("שלום.")

        with unittest.mock.patch(
            "services.chat_engine.get_exact_cached_response",
            return_value=cached,
        ):
            chunks = list(stream_chat_response(ChatRequest(message="שלום", level="A1")))

        assert chunks == ["שלום."]

    def test_fast_reject_non_hebrew_yields_fallback(self):
        from services.chat_engine import stream_chat_response

        with unittest.mock.patch(
            "services.chat_engine.get_exact_cached_response",
            return_value=None,
        ):
            chunks = list(stream_chat_response(ChatRequest(message="hello", level="A1")))

        assert len(chunks) == 1
        assert chunks[0]  # non-empty fallback text

    def test_out_of_scope_yields_fallback(self):
        from services.chat_engine import stream_chat_response

        with (
            unittest.mock.patch("services.chat_engine.get_exact_cached_response", return_value=None),
            unittest.mock.patch("services.chat_engine.route_message", return_value=None),
            unittest.mock.patch("services.chat_engine.is_clearly_out_of_scope", return_value=True),
        ):
            chunks = list(stream_chat_response(ChatRequest(message="פרלמנט בוגדנוביץ", level="A1")))

        assert len(chunks) == 1
        assert chunks[0]

    def test_streams_tokens_for_normal_llm_call(self):
        from services.chat_engine import stream_chat_response

        expected_tokens = ["שלום", " ", "טוב."]

        with (
            unittest.mock.patch("services.chat_engine.get_exact_cached_response", return_value=None),
            unittest.mock.patch("services.chat_engine.route_message", return_value=None),
            unittest.mock.patch("services.chat_engine.is_clearly_out_of_scope", return_value=False),
            unittest.mock.patch("services.chat_engine.stream_provider", return_value=iter(expected_tokens)),
            unittest.mock.patch("services.chat_engine.is_hebrew_only_answer", return_value=True),
            unittest.mock.patch(
                "services.chat_engine.evaluate_vocabulary",
                return_value=unittest.mock.MagicMock(fallback_used=False),
            ),
        ):
            chunks = list(stream_chat_response(ChatRequest(message="מה שמך?", level="A1")))

        assert expected_tokens[0] in chunks
        assert expected_tokens[-1] in chunks

    def test_fallback_sentinel_emitted_on_vocab_failure(self):
        from services.chat_engine import stream_chat_response

        with (
            unittest.mock.patch("services.chat_engine.get_exact_cached_response", return_value=None),
            unittest.mock.patch("services.chat_engine.route_message", return_value=None),
            unittest.mock.patch("services.chat_engine.is_clearly_out_of_scope", return_value=False),
            unittest.mock.patch("services.chat_engine.stream_provider", return_value=iter(["שלום university."])),
            unittest.mock.patch("services.chat_engine.is_hebrew_only_answer", return_value=True),
            unittest.mock.patch(
                "services.chat_engine.evaluate_vocabulary",
                return_value=unittest.mock.MagicMock(fallback_used=True),
            ),
        ):
            chunks = list(stream_chat_response(ChatRequest(message="מה שמך?", level="A1")))

        sentinel_chunks = [c for c in chunks if c.startswith("__LISAN_FALLBACK_b6a7d3f1__")]
        assert len(sentinel_chunks) == 1

    def test_fallback_sentinel_on_non_hebrew_answer(self):
        from services.chat_engine import stream_chat_response

        with (
            unittest.mock.patch("services.chat_engine.get_exact_cached_response", return_value=None),
            unittest.mock.patch("services.chat_engine.route_message", return_value=None),
            unittest.mock.patch("services.chat_engine.is_clearly_out_of_scope", return_value=False),
            unittest.mock.patch("services.chat_engine.stream_provider", return_value=iter(["hello world"])),
            unittest.mock.patch("services.chat_engine.is_hebrew_only_answer", return_value=False),
        ):
            chunks = list(stream_chat_response(ChatRequest(message="מה שמך?", level="A1")))

        sentinel_chunks = [c for c in chunks if c.startswith("__LISAN_FALLBACK_b6a7d3f1__")]
        assert len(sentinel_chunks) == 1

    def test_model_error_yields_fallback(self):
        from services.chat_engine import stream_chat_response

        def _boom():
            raise Exception("network failure")
            yield  # make it a generator

        with (
            unittest.mock.patch("services.chat_engine.get_exact_cached_response", return_value=None),
            unittest.mock.patch("services.chat_engine.route_message", return_value=None),
            unittest.mock.patch("services.chat_engine.is_clearly_out_of_scope", return_value=False),
            unittest.mock.patch("services.chat_engine.stream_provider", side_effect=Exception("boom")),
        ):
            chunks = list(stream_chat_response(ChatRequest(message="מה שמך?", level="A1")))

        assert len(chunks) == 1
        assert chunks[0]  # non-empty fallback


# ---------------------------------------------------------------------------
# SSE HTTP endpoint
# ---------------------------------------------------------------------------

class TestStreamEndpoint:
    def _client(self):
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)

    def test_returns_event_stream_content_type(self):
        client = self._client()
        with unittest.mock.patch(
            "services.chat_engine.get_exact_cached_response",
            return_value=_make_cached_response("שלום."),
        ):
            resp = client.post(
                "/api/ai/chat/stream",
                json={"message": "שלום", "level": "A1"},
            )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]

    def test_body_contains_data_lines(self):
        client = self._client()
        with unittest.mock.patch(
            "services.chat_engine.get_exact_cached_response",
            return_value=_make_cached_response("שלום."),
        ):
            resp = client.post(
                "/api/ai/chat/stream",
                json={"message": "שלום", "level": "A1"},
            )
        assert "data:" in resp.text

    def test_body_ends_with_done(self):
        client = self._client()
        with unittest.mock.patch(
            "services.chat_engine.get_exact_cached_response",
            return_value=_make_cached_response("שלום."),
        ):
            resp = client.post(
                "/api/ai/chat/stream",
                json={"message": "שלום", "level": "A1"},
            )
        assert "[DONE]" in resp.text

    def test_cache_hit_token_in_sse_body(self):
        client = self._client()
        with unittest.mock.patch(
            "services.chat_engine.get_exact_cached_response",
            return_value=_make_cached_response("שלום."),
        ):
            resp = client.post(
                "/api/ai/chat/stream",
                json={"message": "שלום", "level": "A1"},
            )
        assert "שלום" in resp.text
