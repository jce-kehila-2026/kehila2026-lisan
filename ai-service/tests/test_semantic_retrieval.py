from __future__ import annotations

from services.chat_retrieval import Chunk
from services.chat_retrieval import build_retrieval_context
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
