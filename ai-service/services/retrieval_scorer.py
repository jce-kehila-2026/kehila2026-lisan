from __future__ import annotations

from dataclasses import replace

from services.chat_schemas import RetrievalContext
from services.response_policy import get_float, get_int


def filter_retrieval_context(context: RetrievalContext) -> RetrievalContext:
    min_score = get_float("min_retrieval_score")
    max_chunks = max(0, get_int("max_context_chunks"))
    if not context.chunk_ids or not context.relevance_scores or max_chunks == 0:
        return RetrievalContext([], "", 0, [])

    keep_indices = [
        index
        for index, score in enumerate(context.relevance_scores)
        if score >= min_score
    ][:max_chunks]
    if not keep_indices:
        return RetrievalContext([], "", 0, [])

    kept_ids = [context.chunk_ids[index] for index in keep_indices]
    kept_scores = [context.relevance_scores[index] for index in keep_indices]
    if len(kept_ids) == len(context.chunk_ids):
        return context

    # context_text is rendered from all chunks upstream; when we filter IDs
    # conservatively drop text rather than risk mismatched context/id pairs.
    return replace(
        context,
        chunk_ids=kept_ids,
        relevance_scores=kept_scores,
        chunks_count=len(kept_ids),
        context_text="",
    )
