from __future__ import annotations

import json
import math
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from services.chat_guardrails import hebrew_words, normalize_hebrew_token, normalize_level
from services.chat_schemas import RetrievalContext

BASE_DIR = Path(__file__).resolve().parents[1]
TRANSCRIPTS_DIR = BASE_DIR / "data" / "transcripts"
RAG_CHUNKS_PATH = BASE_DIR / "poc" / "rag-chunks.json"
DEFAULT_LEVEL = "A1"
DEFAULT_SIMILARITY_THRESHOLD = 0.7
DEFAULT_BACKEND_TIMEOUT_SECONDS = 2.5
TRANSCRIPT_SOURCE_STATUS: dict[str, dict[str, object]] = {}


@dataclass
class Transcript:
    source: str
    content: str


@dataclass
class Chunk:
    chunk_id: str
    source: str
    content: str
    tokens: set[str]
    normalized_content: str
    source_tokens: frozenset[str]
    line_count: int


@dataclass(frozen=True)
class SemanticMatch:
    chunk: Chunk
    score: float


class SemanticRetriever:
    def __init__(
        self,
        embedding_model: str = "local-hash-ngrams",
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    ) -> None:
        self.model = embedding_model
        self.similarity_threshold = similarity_threshold
        self._lock = threading.Lock()
        self._embeddings: dict[str, dict[str, float]] = {}
        self._preload_reference_embeddings()

    def retrieve(self, query: str, chunks: list[Chunk], top_k: int = 3) -> list[SemanticMatch]:
        query_embedding = self.get_embedding(query)
        query_tokens = _extract_chunk_tokens(query)
        ranked_matches: list[SemanticMatch] = []

        for chunk in chunks:
            chunk_embedding = self.get_embedding(chunk.content)
            similarity = self._score_similarity(
                query=query,
                query_embedding=query_embedding,
                query_tokens=query_tokens,
                chunk=chunk,
                chunk_embedding=chunk_embedding,
            )
            if similarity >= self.similarity_threshold:
                ranked_matches.append(SemanticMatch(chunk=chunk, score=similarity))

        ranked_matches.sort(
            key=lambda match: (match.score, -match.chunk.line_count, match.chunk.chunk_id),
            reverse=True,
        )
        return ranked_matches[:top_k]

    def get_embedding(self, text: str) -> dict[str, float]:
        normalized_text = _normalize_text(text)
        if not normalized_text:
            return {}

        with self._lock:
            cached = self._embeddings.get(normalized_text)
            if cached is not None:
                return cached

        embedding = _build_sparse_embedding(normalized_text)
        with self._lock:
            self._embeddings[normalized_text] = embedding
        return embedding

    def _preload_reference_embeddings(self) -> None:
        if not RAG_CHUNKS_PATH.exists():
            return

        try:
            raw_chunks = json.loads(RAG_CHUNKS_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return

        for item in raw_chunks:
            content = str(item.get("content") or "").strip()
            if not content:
                continue
            normalized_content = _normalize_text(content)
            if not normalized_content:
                continue
            with self._lock:
                if normalized_content not in self._embeddings:
                    self._embeddings[normalized_content] = _build_sparse_embedding(normalized_content)

    def _score_similarity(
        self,
        query: str,
        query_embedding: dict[str, float],
        query_tokens: set[str],
        chunk: Chunk,
        chunk_embedding: dict[str, float],
    ) -> float:
        cosine = cosine_similarity(query_embedding, chunk_embedding)
        overlap_count = len(query_tokens & chunk.tokens)
        coverage_ratio = overlap_count / max(1, len(query_tokens))
        source_overlap_ratio = len(query_tokens & chunk.source_tokens) / max(1, len(query_tokens))
        phrase_bonus = 1.0 if _normalize_text(query) and _normalize_text(query) in chunk.normalized_content else 0.0

        similarity = (cosine * 0.72) + (coverage_ratio * 0.18) + (source_overlap_ratio * 0.05) + (phrase_bonus * 0.05)
        if query_tokens and query_tokens.issubset(chunk.tokens):
            similarity = max(similarity, 0.9)
        elif overlap_count >= max(1, len(query_tokens) - 1):
            similarity = max(similarity, 0.76)
        return min(similarity, 1.0)


def resolve_level_path(level: str) -> Path:
    normalized_level = normalize_level(level)
    level_path = TRANSCRIPTS_DIR / normalized_level
    if level_path.exists():
        return level_path
    return TRANSCRIPTS_DIR / DEFAULT_LEVEL


def load_transcripts(level: str) -> tuple[list[Transcript], str]:
    normalized_level = normalize_level(level)
    backend_error: str | None = None

    if _should_try_backend_transcripts():
        try:
            backend_transcripts = _load_transcripts_from_backend(normalized_level)
            if backend_transcripts:
                _record_transcript_source_status(
                    normalized_level,
                    source="backend",
                    count=len(backend_transcripts),
                    error=None,
                )
                return backend_transcripts, normalized_level
            backend_error = "backend returned no transcripts"
        except TranscriptBackendError as exc:
            backend_error = str(exc)

        if _require_backend_transcripts():
            _record_transcript_source_status(
                normalized_level,
                source="backend_error",
                count=0,
                error=backend_error,
            )
            raise FileNotFoundError(
                f"Backend transcripts unavailable for {normalized_level}: {backend_error}"
            )

    level_path = resolve_level_path(level)
    transcripts: list[Transcript] = []
    for file_path in sorted(level_path.rglob("*.txt")):
        transcripts.append(
            Transcript(
                source=str(file_path.relative_to(level_path)),
                content=file_path.read_text(encoding="utf-8").strip(),
            )
        )
    if not transcripts:
        raise FileNotFoundError(f"No transcript files found for level path: {level_path}")
    resolved_level = normalized_level if (TRANSCRIPTS_DIR / normalized_level).exists() else DEFAULT_LEVEL
    _record_transcript_source_status(
        normalized_level,
        source="local_fallback" if backend_error else "local",
        count=len(transcripts),
        error=backend_error,
    )
    return transcripts, resolved_level


class TranscriptBackendError(RuntimeError):
    pass


def is_backend_transcript_source_configured() -> bool:
    return bool(_backend_base_url()) and _transcript_source_mode() != "local"


def get_transcript_source_status() -> dict[str, dict[str, object]]:
    return {level: dict(status) for level, status in TRANSCRIPT_SOURCE_STATUS.items()}


def _transcript_source_mode() -> str:
    mode = os.getenv("RAG_TRANSCRIPTS_SOURCE", "auto").strip().lower()
    if mode in {"backend", "database", "db", "firestore"}:
        return "backend"
    if mode in {"local", "files", "file"}:
        return "local"
    return "auto"


def _should_try_backend_transcripts() -> bool:
    mode = _transcript_source_mode()
    return mode != "local" and bool(_backend_base_url())


def _require_backend_transcripts() -> bool:
    raw = os.getenv("RAG_REQUIRE_BACKEND", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _backend_base_url() -> str:
    return (
        os.getenv("RAG_BACKEND_URL", "")
        or os.getenv("BACKEND_URL", "")
    ).strip().rstrip("/")


def _backend_timeout_seconds() -> float:
    raw = os.getenv("RAG_BACKEND_TIMEOUT_SECONDS", "").strip()
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_BACKEND_TIMEOUT_SECONDS
    return value if value > 0 else DEFAULT_BACKEND_TIMEOUT_SECONDS


def _load_transcripts_from_backend(level: str) -> list[Transcript]:
    base_url = _backend_base_url()
    if not base_url:
        return []

    encoded_level = urllib.parse.quote(normalize_level(level), safe="")
    url = f"{base_url}/api/transcripts/level/{encoded_level}"
    request = urllib.request.Request(
        url,
        headers=_backend_request_headers(),
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=_backend_timeout_seconds()) as response:
            status = getattr(response, "status", 200)
            if status < 200 or status >= 300:
                raise TranscriptBackendError(f"backend status {status}")
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, TimeoutError) as exc:
        raise TranscriptBackendError(str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise TranscriptBackendError(f"invalid backend JSON: {exc}") from exc

    records = payload.get("results") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise TranscriptBackendError("backend payload is not a transcript list")

    transcripts = [
        transcript
        for record in records
        if isinstance(record, dict)
        for transcript in [_transcript_from_backend_record(record)]
        if transcript is not None
    ]
    transcripts.sort(key=lambda item: item.source)
    return transcripts


def _backend_request_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "lisan-ai-rag/1.0",
    }
    internal_secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()
    if internal_secret:
        headers["X-Internal-Service-Secret"] = internal_secret
    return headers


def _transcript_from_backend_record(record: dict) -> Transcript | None:
    content = (
        record.get("text")
        or record.get("content")
        or record.get("transcript")
        or ""
    )
    content = str(content).strip()
    if not content:
        return None

    source = (
        record.get("fileName")
        or record.get("source")
        or record.get("title")
        or record.get("id")
        or "database-transcript"
    )
    return Transcript(source=str(source), content=content)


def _record_transcript_source_status(
    level: str,
    *,
    source: str,
    count: int,
    error: str | None,
) -> None:
    TRANSCRIPT_SOURCE_STATUS[normalize_level(level)] = {
        "source": source,
        "count": count,
        "error": error,
    }


def extract_vocabulary(transcripts: list[Transcript]) -> list[str]:
    vocabulary = {
        normalize_hebrew_token(token)
        for transcript in transcripts
        for token in hebrew_words(transcript.content)
        if normalize_hebrew_token(token)
    }
    return sorted(vocabulary)


def chunk_transcripts(transcripts: list[Transcript], chunk_size: int = 4, overlap: int = 1) -> list[Chunk]:
    chunks: list[Chunk] = []
    for transcript_index, transcript in enumerate(transcripts, start=1):
        lines = [line.strip() for line in transcript.content.splitlines() if line.strip()]
        if not lines:
            continue
        if len(lines) <= chunk_size:
            chunk_content = "\n".join(lines)
            chunks.append(
                _build_chunk(
                    chunk_id=f"t{transcript_index}-c1",
                    source=transcript.source,
                    content=chunk_content,
                    line_count=len(lines),
                )
            )
            continue

        step = max(1, chunk_size - overlap)
        chunk_counter = 1
        for start_index in range(0, len(lines), step):
            selected_lines = lines[start_index : start_index + chunk_size]
            if len(selected_lines) < 2:
                continue
            chunk_content = "\n".join(selected_lines)
            chunks.append(
                _build_chunk(
                    chunk_id=f"t{transcript_index}-c{chunk_counter}",
                    source=transcript.source,
                    content=chunk_content,
                    line_count=len(selected_lines),
                )
            )
            chunk_counter += 1
    return chunks


def retrieve_relevant_chunks(message: str, chunks: list[Chunk], limit: int = 5) -> list[Chunk]:
    semantic_matches = SEMANTIC_RETRIEVER.retrieve(message, chunks, top_k=limit)
    if semantic_matches:
        return [match.chunk for match in semantic_matches]
    return [chunk for chunk, _ in _retrieve_keyword_chunks_scored(message, chunks, limit=limit)]


def render_context(chunks: list[Chunk]) -> str:
    return "\n\n".join(f"[{chunk.chunk_id}] {chunk.source}\n{chunk.content}" for chunk in chunks)


def build_retrieval_context(message: str, chunks: list[Chunk], limit: int = 5) -> RetrievalContext:
    semantic_matches = SEMANTIC_RETRIEVER.retrieve(message, chunks, top_k=limit)
    if semantic_matches:
        selected_chunks = [match.chunk for match in semantic_matches]
        scores = [round(match.score, 4) for match in semantic_matches]
    else:
        # Keyword fallback now reports its REAL coverage score (overlap
        # fraction of the query) instead of a flat 0.0, so consumers and
        # eval reports can tell useful context from noise.
        scored = _retrieve_keyword_chunks_scored(message, chunks, limit=limit)
        selected_chunks = [chunk for chunk, _ in scored]
        scores = [round(score, 4) for _, score in scored]

    return RetrievalContext(
        chunk_ids=[chunk.chunk_id for chunk in selected_chunks],
        context_text=render_context(selected_chunks),
        chunks_count=len(selected_chunks),
        relevance_scores=scores,
    )


def cosine_similarity(left: dict[str, float], right: dict[str, float]) -> float:
    if not left or not right:
        return 0.0

    smaller, larger = (left, right) if len(left) <= len(right) else (right, left)
    dot_product = sum(value * larger.get(key, 0.0) for key, value in smaller.items())
    if dot_product <= 0:
        return 0.0

    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot_product / (left_norm * right_norm)


def _retrieve_keyword_chunks(message: str, chunks: list[Chunk], limit: int = 5) -> list[Chunk]:
    return [chunk for chunk, _ in _retrieve_keyword_chunks_scored(message, chunks, limit=limit)]


def _retrieve_keyword_chunks_scored(
    message: str,
    chunks: list[Chunk],
    limit: int = 5,
) -> list[tuple[Chunk, float]]:
    """
    Lexical-overlap retrieval returning (chunk, coverage) pairs, where
    coverage is the fraction of query tokens found in the chunk (0..1).
    """
    message_tokens = _extract_chunk_tokens(message)
    normalized_message = _normalize_text(message)
    message_bigrams = _ordered_token_bigrams(message)
    scored_chunks: list[tuple[float, int, int, Chunk]] = []
    coverage_by_chunk_id: dict[str, float] = {}

    for chunk in chunks:
        overlap_count = len(message_tokens & chunk.tokens)
        coverage = overlap_count / max(1, len(message_tokens))
        coverage_by_chunk_id[chunk.chunk_id] = coverage
        exact_phrase_bonus = 100.0 if normalized_message and normalized_message in chunk.normalized_content else 0.0
        all_tokens_bonus = 20.0 if message_tokens and message_tokens.issubset(chunk.tokens) else 0.0
        bigram_score = len(message_bigrams & _ordered_token_bigrams(chunk.content)) * 6.0
        source_overlap_score = len(message_tokens & chunk.source_tokens) * 3.0
        short_chunk_bonus = max(0, 5 - chunk.line_count)
        total_score = (
            exact_phrase_bonus
            + all_tokens_bonus
            + (overlap_count * 12.0)
            + (coverage * 10)
            + bigram_score
            + source_overlap_score
            + short_chunk_bonus
        )
        scored_chunks.append((total_score, overlap_count, -chunk.line_count, chunk))

    scored_chunks.sort(key=lambda item: (item[0], item[1], item[2], item[3].chunk_id), reverse=True)
    # No arbitrary padding: if nothing overlaps the query, an empty context
    # is the honest answer. Padding with unrelated chunks polluted the LLM
    # prompt and reported meaningless contextChunkIds (the live eval showed
    # 108/133 responses carrying all-zero relevance scores).
    selected = _pick_diverse_chunks(scored_chunks, limit)
    return [(chunk, coverage_by_chunk_id.get(chunk.chunk_id, 0.0)) for chunk in selected]


def _extract_chunk_tokens(content: str) -> set[str]:
    return {
        normalize_hebrew_token(token)
        for token in hebrew_words(content)
        if normalize_hebrew_token(token)
    }


def _build_chunk(chunk_id: str, source: str, content: str, line_count: int) -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        source=source,
        content=content,
        tokens=_extract_chunk_tokens(content),
        normalized_content=_normalize_text(content),
        source_tokens=frozenset(_extract_chunk_tokens(source)),
        line_count=line_count,
    )


def _normalize_text(text: str) -> str:
    return " ".join(
        normalize_hebrew_token(token)
        for token in hebrew_words(text)
        if normalize_hebrew_token(token)
    ).strip()


def _ordered_token_bigrams(text: str) -> set[tuple[str, str]]:
    ordered_tokens = [token for token in _normalize_text(text).split() if token]
    return {
        (ordered_tokens[index], ordered_tokens[index + 1])
        for index in range(len(ordered_tokens) - 1)
    }


def _character_trigrams(text: str) -> list[str]:
    collapsed = _normalize_text(text).replace(" ", "")
    if len(collapsed) < 3:
        return [collapsed] if collapsed else []
    return [collapsed[index : index + 3] for index in range(len(collapsed) - 2)]


def _build_sparse_embedding(text: str) -> dict[str, float]:
    token_counter = Counter(f"tok:{token}" for token in _normalize_text(text).split() if token)
    trigram_counter = Counter(f"tri:{gram}" for gram in _character_trigrams(text))
    weighted_counter = Counter()
    for key, value in token_counter.items():
        weighted_counter[key] = float(value) * 2.4
    for key, value in trigram_counter.items():
        weighted_counter[key] += float(value) * 0.6
    return dict(weighted_counter)


def _pick_diverse_chunks(
    scored_chunks: list[tuple[float, int, int, Chunk]],
    limit: int,
) -> list[Chunk]:
    chosen: list[Chunk] = []
    seen_sources: set[str] = set()

    for score, overlap_count, _, chunk in scored_chunks:
        if len(chosen) >= limit:
            break
        if score <= 0 or overlap_count <= 0:
            continue
        if chunk.source in seen_sources:
            continue
        chosen.append(chunk)
        seen_sources.add(chunk.source)

    if len(chosen) >= limit:
        return chosen

    for score, overlap_count, _, chunk in scored_chunks:
        if len(chosen) >= limit:
            break
        if score <= 0 or overlap_count <= 0 or chunk in chosen:
            continue
        chosen.append(chunk)

    return chosen


SEMANTIC_RETRIEVER = SemanticRetriever()
