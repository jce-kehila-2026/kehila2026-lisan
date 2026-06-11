from __future__ import annotations

import os
from dataclasses import dataclass
from services.chat_retrieval import Chunk, SemanticMatch

_BGE_M3_MODEL = None
_BGE_RERANKER_MODEL = None


def get_bge_m3_model():
    global _BGE_M3_MODEL
    if _BGE_M3_MODEL is None:
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")
        _BGE_M3_MODEL = SentenceTransformer(model_name)
    return _BGE_M3_MODEL


def get_bge_reranker_model():
    global _BGE_RERANKER_MODEL
    if _BGE_RERANKER_MODEL is None:
        from sentence_transformers import CrossEncoder
        model_name = os.getenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-v2-m3")
        _BGE_RERANKER_MODEL = CrossEncoder(model_name)
    return _BGE_RERANKER_MODEL


def get_dense_embedding(text: str) -> list[float]:
    """Computes normalized dense embedding using BGE-M3 with mock fallback for testing."""
    import sys
    if (
        "pytest" in sys.modules
        or os.getenv("PYTEST_CURRENT_TEST") is not None
        or not _local_embeddings_enabled()
    ):
        return _mock_embedding(text)

    try:
        model = get_bge_m3_model()
        embedding = model.encode(text, normalize_embeddings=True)
        return embedding.tolist()
    except Exception:
        return _mock_embedding(text)


def _mock_embedding(text: str) -> list[float]:
    import hashlib
    h = hashlib.sha256(text.encode("utf-8")).digest()
    floats = []
    for i in range(1024):
        val = h[i % 32] / 255.0
        if i % 2 == 0:
            val = -val
        floats.append(val)
    return floats


def rerank_candidates(query: str, candidates: list[Chunk], top_k: int = 5) -> list[Chunk]:
    """Reranks candidate chunks using BGE-Reranker-v2-m3 with fallback."""
    if not candidates:
        return []
    import sys
    if (
        "pytest" in sys.modules
        or os.getenv("PYTEST_CURRENT_TEST") is not None
        or not _reranker_enabled()
    ):
        return candidates[:top_k]
    try:
        model = get_bge_reranker_model()
        pairs = [[query, c.content] for c in candidates]
        scores = model.predict(pairs)
        ranked = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
        return [c for score, c in ranked[:top_k]]
    except Exception:
        return candidates[:top_k]


@dataclass(frozen=True)
class OfflineEmbeddingsStatus:
    available: bool
    backend: str


def get_offline_embeddings_status() -> OfflineEmbeddingsStatus:
    if _local_embeddings_enabled():
        return OfflineEmbeddingsStatus(available=True, backend="bge-m3")
    return OfflineEmbeddingsStatus(available=True, backend="local-hash-fallback")


class OfflineEmbeddingsIndex:
    """Free local semantic index wrapper using BGE-M3 and BGE-Reranker."""

    def __init__(self, chunks: list[Chunk], similarity_threshold: float = 0.7) -> None:
        self.chunks = chunks
        self.similarity_threshold = similarity_threshold

    def search(self, query: str, top_k: int = 3) -> list[SemanticMatch]:
        query_emb = get_dense_embedding(query)
        matches: list[SemanticMatch] = []
        
        for chunk in self.chunks:
            chunk_emb = get_dense_embedding(chunk.content)
            # Cosine similarity for normalized embeddings is dot product
            similarity = sum(q * c for q, c in zip(query_emb, chunk_emb))
            if similarity >= self.similarity_threshold:
                matches.append(SemanticMatch(chunk=chunk, score=similarity))
                
        matches.sort(key=lambda m: m.score, reverse=True)
        
        candidates = [m.chunk for m in matches[:20]]
        if not candidates:
            return []
            
        import sys
        if (
            "pytest" in sys.modules
            or os.getenv("PYTEST_CURRENT_TEST") is not None
            or not _reranker_enabled()
        ):
            return matches[:top_k]

        try:
            model = get_bge_reranker_model()
            pairs = [[query, c.content] for c in candidates]
            scores = model.predict(pairs)
            reranked = [
                SemanticMatch(chunk=c, score=float(score))
                for score, c in sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
            ]
            return reranked[:top_k]
        except Exception:
            return matches[:top_k]


def _local_embeddings_enabled() -> bool:
    return os.getenv("ENABLE_DENSE_RETRIEVAL", "").strip().lower() in {"1", "true", "yes", "on"}


def _reranker_enabled() -> bool:
    return os.getenv("ENABLE_RERANKER", "").strip().lower() in {"1", "true", "yes", "on"}
