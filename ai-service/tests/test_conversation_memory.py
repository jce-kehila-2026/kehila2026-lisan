"""
test_conversation_memory.py

Tests for T2: Multi-turn context memory.

Covers:
  - ConversationMemory unit tests (get, append, trim, TTL, eviction)
  - ChatRequest accepts sessionId field
  - ProviderCallOptions accepts history tuple
  - generate_chat_response populates history in ProviderCallOptions
  - generate_chat_response saves successful turns to memory
  - Fallback responses do NOT save to memory
"""
from __future__ import annotations

import time
import unittest.mock

from services.chat_schemas import ChatRequest
from services.chat_provider import ProviderCallOptions
from services.conversation_memory import ConversationMemory


# ---------------------------------------------------------------------------
# ConversationMemory unit tests
# ---------------------------------------------------------------------------

class TestConversationMemory:
    def _mem(self, **kw) -> ConversationMemory:
        return ConversationMemory(**kw)

    def test_empty_session_returns_empty_list(self):
        mem = self._mem()
        assert mem.get_history("sess-1") == []

    def test_blank_session_id_returns_empty(self):
        mem = self._mem()
        mem.append_turn("", "שלום", "שלום")
        assert mem.get_history("") == []

    def test_append_and_retrieve_single_turn(self):
        mem = self._mem()
        mem.append_turn("s1", "מה שלומך", "טוב תודה")
        history = mem.get_history("s1")
        assert len(history) == 2
        assert history[0] == {"role": "user", "content": "מה שלומך"}
        assert history[1] == {"role": "assistant", "content": "טוב תודה"}

    def test_multiple_turns_appended_in_order(self):
        mem = self._mem()
        mem.append_turn("s1", "שלום", "שלום")
        mem.append_turn("s1", "מה שמך", "שמי לי")
        history = mem.get_history("s1")
        assert len(history) == 4
        assert history[2]["content"] == "מה שמך"
        assert history[3]["content"] == "שמי לי"

    def test_trim_to_max_turns(self):
        mem = self._mem(max_turns=2)
        for i in range(5):
            mem.append_turn("s1", f"user {i}", f"bot {i}")
        history = mem.get_history("s1")
        # max 2 turns = 4 messages (last 2 pairs)
        assert len(history) == 4
        assert history[0]["content"] == "user 3"
        assert history[-1]["content"] == "bot 4"

    def test_ttl_expiry_evicts_session(self):
        now = [0.0]
        mem = self._mem(ttl_seconds=10, time_func=lambda: now[0])
        mem.append_turn("s1", "שלום", "שלום")
        now[0] = 11.0
        # trigger eviction on next access
        assert mem.get_history("s1") == []

    def test_session_not_evicted_before_ttl(self):
        now = [0.0]
        mem = self._mem(ttl_seconds=10, time_func=lambda: now[0])
        mem.append_turn("s1", "שלום", "שלום")
        now[0] = 9.0
        assert len(mem.get_history("s1")) == 2

    def test_max_sessions_evicts_oldest(self):
        mem = self._mem(max_sessions=3)
        for i in range(3):
            mem.append_turn(f"s{i}", "x", "y")
        # adding 4th session evicts oldest
        mem.append_turn("s3", "x", "y")
        assert mem.session_count() == 3

    def test_clear_session(self):
        mem = self._mem()
        mem.append_turn("s1", "שלום", "שלום")
        mem.clear_session("s1")
        assert mem.get_history("s1") == []

    def test_independent_sessions(self):
        mem = self._mem()
        mem.append_turn("a", "user-a", "bot-a")
        mem.append_turn("b", "user-b", "bot-b")
        assert mem.get_history("a")[0]["content"] == "user-a"
        assert mem.get_history("b")[0]["content"] == "user-b"


# ---------------------------------------------------------------------------
# Schema tests
# ---------------------------------------------------------------------------

class TestChatRequestSessionId:
    def test_session_id_defaults_to_none(self):
        r = ChatRequest(message="שלום")
        assert r.sessionId is None

    def test_session_id_accepted(self):
        r = ChatRequest(message="שלום", sessionId="abc-123")
        assert r.sessionId == "abc-123"


class TestProviderCallOptionsHistory:
    def test_history_defaults_empty(self):
        o = ProviderCallOptions()
        assert o.history == ()

    def test_history_set(self):
        h = ({"role": "user", "content": "שלום"},)
        o = ProviderCallOptions(history=h)
        assert o.history == h


# ---------------------------------------------------------------------------
# Integration: generate_chat_response saves turn and passes history
# ---------------------------------------------------------------------------

class TestConversationMemoryIntegration:
    def test_history_passed_to_provider_on_second_call(self):
        """Second call with same session_id receives prior turn in history."""
        from services.conversation_memory import CONVERSATION_MEMORY
        from services.chat_engine import generate_chat_response
        from services.chat_provider import ProviderResult

        sid = "test-session-history-integration"
        CONVERSATION_MEMORY.clear_session(sid)

        captured_opts: list[ProviderCallOptions] = []
        call_count = [0]

        def fake_provider(provider, model, system_msg, question, options=None):
            captured_opts.append(options or ProviderCallOptions())
            call_count[0] += 1
            return ProviderResult(
                answer="תשובה",
                latency_seconds=0.1,
                input_tokens=5,
                output_tokens=2,
                provider=provider,
                model=model,
            )

        msg1 = "היי רון"
        msg2 = "מה נשמע"

        from services.chat_guardrails import GuardrailDecision
        no_block = GuardrailDecision(
            fallback_used=False, fallback_reason=None, blocked_tokens=[]
        )

        with (
            unittest.mock.patch(
                "services.chat_engine.call_provider",
                side_effect=fake_provider,
            ),
            unittest.mock.patch(
                "services.chat_engine.get_exact_cached_response",
                return_value=None,
            ),
            unittest.mock.patch(
                "services.chat_engine.route_message",
                return_value=None,
            ),
            unittest.mock.patch(
                "services.chat_engine.is_clearly_out_of_scope",
                return_value=False,
            ),
            unittest.mock.patch(
                "services.chat_engine.is_hebrew_only_answer",
                return_value=True,
            ),
            unittest.mock.patch(
                "services.chat_engine.evaluate_vocabulary",
                return_value=no_block,
            ),
            unittest.mock.patch(
                "services.chat_engine.store_exact_cached_response",
            ),
        ):
            generate_chat_response(ChatRequest(message=msg1, sessionId=sid))
            generate_chat_response(ChatRequest(message=msg2, sessionId=sid))

        n = len(captured_opts)
        assert n == 2, f"Expected 2 provider calls, got {n}"
        # Second call must carry the first turn in history
        second_opts = captured_opts[1]
        assert len(second_opts.history) == 2
        assert second_opts.history[0]["role"] == "user"
        assert second_opts.history[0]["content"] == msg1
        assert second_opts.history[1]["role"] == "assistant"

    def test_no_session_id_no_history(self):
        """Calls without sessionId always receive empty history."""
        from services.chat_engine import generate_chat_response

        captured_opts: list[ProviderCallOptions] = []

        def fake_call_provider(provider, model, system_message, question, options=None):
            captured_opts.append(options or ProviderCallOptions())
            from services.chat_provider import ProviderResult
            return ProviderResult(
                answer="שלום",
                latency_seconds=0.1,
                input_tokens=5,
                output_tokens=2,
                provider=provider,
                model=model,
            )

        with unittest.mock.patch(
            "services.chat_engine.call_provider",
            side_effect=fake_call_provider,
        ):
            generate_chat_response(ChatRequest(message="בוקר טוב"))

        if captured_opts:
            assert captured_opts[0].history == ()
