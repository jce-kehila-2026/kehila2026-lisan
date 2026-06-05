from __future__ import annotations

import json
import urllib.error

from services import chat_retrieval
from services.chat_retrieval import Chunk
from services.chat_retrieval import build_retrieval_context
from services.chat_retrieval import get_transcript_source_status
from services.chat_retrieval import load_transcripts
from services.chat_retrieval import retrieve_relevant_chunks


def _chunk(chunk_id: str, source: str, content: str, tokens: set[str]) -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        source=source,
        content=content,
        tokens=tokens,
        normalized_content=" ".join(sorted(tokens)),
        source_tokens=frozenset(tokens),
        line_count=max(1, content.count("\n") + 1),
    )


def test_semantic_retrieval_returns_high_similarity_match():
    restaurant = "\u05d0\u05e0\u05d9 \u05e8\u05d5\u05e6\u05d4 \u05e7\u05e4\u05d4 \u05e2\u05dd \u05d7\u05dc\u05d1"
    travel = "\u05d0\u05e0\u05d9 \u05e0\u05d5\u05e1\u05e2 \u05d1\u05d0\u05d5\u05d8\u05d5\u05d1\u05d5\u05e1 \u05dc\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd"
    query = "\u05d0\u05e0\u05d9 \u05e8\u05d5\u05e6\u05d4 \u05e7\u05e4\u05d4"
    chunks = [
        _chunk(
            "restaurant-1",
            "restaurant.txt",
            restaurant,
            {"\u05d0\u05e0\u05d9", "\u05e8\u05d5\u05e6\u05d4", "\u05e7\u05e4\u05d4", "\u05e2\u05dd", "\u05d7\u05dc\u05d1"},
        ),
        _chunk(
            "travel-1",
            "travel.txt",
            travel,
            {"\u05d0\u05e0\u05d9", "\u05e0\u05d5\u05e1\u05e2", "\u05d1\u05d0\u05d5\u05d8\u05d5\u05d1\u05d5\u05e1", "\u05dc\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd"},
        ),
    ]

    context = build_retrieval_context(query, chunks, limit=1)
    assert context.chunk_ids == ["restaurant-1"]
    assert context.relevance_scores[0] >= 0.7


def test_semantic_retrieval_falls_back_when_threshold_not_met():
    query = "\u05de\u05d8\u05d5\u05e1"
    chunks = [
        _chunk(
            "greeting-1",
            "greeting.txt",
            "\u05e9\u05dc\u05d5\u05dd \u05ea\u05d5\u05d3\u05d4 \u05d1\u05d1\u05e7\u05e9\u05d4",
            {"\u05e9\u05dc\u05d5\u05dd", "\u05ea\u05d5\u05d3\u05d4", "\u05d1\u05d1\u05e7\u05e9\u05d4"},
        ),
        _chunk(
            "numbers-1",
            "numbers.txt",
            "\u05d0\u05d7\u05d3 \u05e9\u05ea\u05d9\u05d9\u05dd \u05e9\u05dc\u05d5\u05e9",
            {"\u05d0\u05d7\u05d3", "\u05e9\u05ea\u05d9\u05d9\u05dd", "\u05e9\u05dc\u05d5\u05e9"},
        ),
    ]

    selected = retrieve_relevant_chunks(query, chunks, limit=1)
    assert selected[0].chunk_id == "greeting-1"

    context = build_retrieval_context(query, chunks, limit=1)
    assert context.chunk_ids == ["greeting-1"]
    assert context.relevance_scores == [0.0]


class _MockHttpResponse:
    status = 200

    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self._payload


def test_load_transcripts_prefers_backend_database(monkeypatch):
    payload = [
        {
            "id": "db-1",
            "level": "A1",
            "fileName": "database-source.txt",
            "text": "\u05e9\u05dc\u05d5\u05dd\n\u05de\u05d4 \u05e9\u05dc\u05d5\u05de\u05da?",
        }
    ]
    calls = {}

    def fake_urlopen(request, timeout):
        calls["url"] = request.full_url
        calls["timeout"] = timeout
        return _MockHttpResponse(json.dumps(payload).encode("utf-8"))

    monkeypatch.setenv("RAG_TRANSCRIPTS_SOURCE", "backend")
    monkeypatch.setenv("RAG_BACKEND_URL", "http://backend.test")
    monkeypatch.setenv("RAG_BACKEND_TIMEOUT_SECONDS", "1")
    monkeypatch.setattr(chat_retrieval.urllib.request, "urlopen", fake_urlopen)

    transcripts, resolved_level = load_transcripts("A1")

    assert resolved_level == "A1"
    assert len(transcripts) == 1
    assert transcripts[0].source == "database-source.txt"
    assert "\u05e9\u05dc\u05d5\u05dd" in transcripts[0].content
    assert calls["url"] == "http://backend.test/api/transcripts/level/A1"
    assert calls["timeout"] == 1
    assert get_transcript_source_status()["A1"]["source"] == "backend"


def test_load_transcripts_falls_back_to_local_when_backend_is_unavailable(monkeypatch):
    def fake_urlopen(_request, timeout):
        del timeout
        raise urllib.error.URLError("backend down")

    monkeypatch.setenv("RAG_TRANSCRIPTS_SOURCE", "auto")
    monkeypatch.setenv("RAG_BACKEND_URL", "http://backend.test")
    monkeypatch.delenv("RAG_REQUIRE_BACKEND", raising=False)
    monkeypatch.setattr(chat_retrieval.urllib.request, "urlopen", fake_urlopen)

    transcripts, resolved_level = load_transcripts("A1")

    assert resolved_level == "A1"
    assert transcripts
    status = get_transcript_source_status()["A1"]
    assert status["source"] == "local_fallback"
    assert "backend down" in status["error"]
