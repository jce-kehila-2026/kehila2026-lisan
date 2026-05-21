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
                Chunk(
                    chunk_id=f"t{transcript_index}-c1",
                    source=transcript.source,
                    content=chunk_content,
                    tokens=_extract_chunk_tokens(chunk_content),
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
                Chunk(
                    chunk_id=f"t{transcript_index}-c{chunk_counter}",
                    source=transcript.source,
                    content=chunk_content,
                    tokens=_extract_chunk_tokens(chunk_content),
                )
            )
            chunk_counter += 1
    return chunks


def retrieve_relevant_chunks(message: str, chunks: list[Chunk], limit: int = 5) -> list[Chunk]:
    message_tokens = {
        normalize_hebrew_token(token)
        for token in hebrew_words(message)
        if normalize_hebrew_token(token)
    }
    scored_chunks: list[tuple[int, int, Chunk]] = []
    for chunk in chunks:
        overlap_score = len(message_tokens & chunk.tokens)
        scored_chunks.append((overlap_score, len(chunk.tokens), chunk))

    scored_chunks.sort(key=lambda item: (item[0], item[1]), reverse=True)
    top_chunks = [chunk for score, _, chunk in scored_chunks if score > 0][:limit]
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
