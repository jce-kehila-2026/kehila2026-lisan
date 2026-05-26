from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from services.chat_guardrails import hebrew_words, normalize_hebrew_token, normalize_level

BASE_DIR = Path(__file__).resolve().parents[1]
TRANSCRIPTS_DIR = BASE_DIR / "data" / "transcripts"
DEFAULT_LEVEL = "A1"


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


def resolve_level_path(level: str) -> Path:
    normalized_level = normalize_level(level)
    level_path = TRANSCRIPTS_DIR / normalized_level
    if level_path.exists():
        return level_path
    return TRANSCRIPTS_DIR / DEFAULT_LEVEL


def load_transcripts(level: str) -> tuple[list[Transcript], str]:
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
    return transcripts, normalize_level(level) if (TRANSCRIPTS_DIR / normalize_level(level)).exists() else DEFAULT_LEVEL


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
    message_tokens = _extract_chunk_tokens(message)
    normalized_message = _normalize_text(message)
    message_bigrams = _token_bigrams(message_tokens)
    scored_chunks: list[tuple[float, int, int, Chunk]] = []

    for chunk in chunks:
        overlap_count = len(message_tokens & chunk.tokens)
        coverage_score = (overlap_count / max(1, len(message_tokens))) * 10
        exact_phrase_bonus = 100.0 if normalized_message and normalized_message in chunk.normalized_content else 0.0
        all_tokens_bonus = 20.0 if message_tokens and message_tokens.issubset(chunk.tokens) else 0.0
        bigram_score = len(message_bigrams & _token_bigrams(chunk.tokens)) * 6.0
        source_overlap_score = len(message_tokens & chunk.source_tokens) * 3.0
        short_chunk_bonus = max(0, 5 - chunk.line_count)
        total_score = (
            exact_phrase_bonus
            + all_tokens_bonus
            + (overlap_count * 12.0)
            + coverage_score
            + bigram_score
            + source_overlap_score
            + short_chunk_bonus
        )
        scored_chunks.append((total_score, overlap_count, -chunk.line_count, chunk))

    scored_chunks.sort(key=lambda item: (item[0], item[1], item[2], item[3].chunk_id), reverse=True)
    top_chunks = _pick_diverse_chunks(scored_chunks, limit)
    if top_chunks:
        return top_chunks
    return chunks[:limit]


def render_context(chunks: list[Chunk]) -> str:
    return "\n\n".join(f"[{chunk.chunk_id}] {chunk.source}\n{chunk.content}" for chunk in chunks)


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


def _token_bigrams(tokens: set[str]) -> set[tuple[str, str]]:
    ordered_tokens = sorted(token for token in tokens if token)
    return {
        (ordered_tokens[index], ordered_tokens[index + 1])
        for index in range(len(ordered_tokens) - 1)
    }


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
