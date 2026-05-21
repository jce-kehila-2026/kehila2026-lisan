from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

from services.chat_guardrails import is_short_hebrew_answer, normalize_hebrew_token, normalize_level
from services.chat_retrieval import Chunk, chunk_transcripts, extract_vocabulary, load_transcripts
from services.chat_schemas import ChatResponse

BASE_DIR = Path(__file__).resolve().parents[1]
TRANSCRIPTS_DIR = BASE_DIR / "data" / "transcripts"
CORE_TUTOR_VOCAB = [
    "שלום",
    "היי",
    "תודה",
    "כן",
    "לא",
    "אני",
    "אתה",
    "את",
    "הוא",
    "היא",
    "מה",
    "מי",
    "איפה",
    "זה",
    "זאת",
]
DIRECT_ARABIC_GLOSSARY = {
    "שלום": "مرحبا",
    "היי": "مرحبا",
    "תודה": "شكرا",
    "כן": "نعم",
    "לא": "لا",
    "מים": "ماء",
    "קפה": "قهوة",
    "בית": "بيت",
    "אמא": "أم",
    "אבא": "أب",
    "ילד": "ولد",
    "ילדה": "بنت",
    "אישה": "امرأة",
    "איש": "رجل",
}
_CACHE_LOCK = threading.Lock()


@dataclass(frozen=True)
class CachedLevelBundle:
    level: str
    vocab: list[str]
    vocab_set: frozenset[str]
    chunks: list[Chunk]
    advanced_only_tokens: frozenset[str]
    glossary: dict[str, str]
    question_answer_map: dict[str, str]


CHAT_CACHE: dict[str, CachedLevelBundle] = {}
EXACT_RESPONSE_CACHE: dict[str, ChatResponse] = {}


def warm_startup_chat_cache() -> None:
    with _CACHE_LOCK:
        if CHAT_CACHE:
            return

        discovered_levels = sorted(
            path.name.upper()
            for path in TRANSCRIPTS_DIR.iterdir()
            if path.is_dir()
        )

        raw_level_data: dict[str, tuple[list[str], list[Chunk]]] = {}
        for level in discovered_levels:
            transcripts, _ = load_transcripts(level)
            vocabulary = extract_vocabulary(transcripts)
            chunks = chunk_transcripts(transcripts)
            raw_level_data[level] = (vocabulary, chunks)

        cumulative_levels = sorted(raw_level_data.keys())
        for level in cumulative_levels:
            vocabulary, chunks = raw_level_data[level]
            higher_level_tokens = _collect_higher_level_tokens(level, raw_level_data)
            transcripts, _ = load_transcripts(level)
            glossary = dict(DIRECT_ARABIC_GLOSSARY)
            CHAT_CACHE[level] = CachedLevelBundle(
                level=level,
                vocab=vocabulary,
                vocab_set=frozenset(vocabulary),
                chunks=chunks,
                advanced_only_tokens=frozenset(higher_level_tokens - set(vocabulary)),
                glossary=glossary,
                question_answer_map=_build_question_answer_map(transcripts, set(vocabulary)),
            )


def get_level_bundle(level: str) -> CachedLevelBundle:
    warm_startup_chat_cache()
    normalized_level = normalize_level(level)
    return CHAT_CACHE.get(normalized_level) or CHAT_CACHE["A1"]


def build_cache_key(message: str, level: str, include_arabic: bool) -> str:
    normalized_message = normalize_message_for_cache(message)
    return f"{normalized_message}:{normalize_level(level)}:{str(include_arabic).lower()}"


def normalize_message_for_cache(message: str) -> str:
    parts = [normalize_hebrew_token(part) or part.strip().lower() for part in (message or "").split()]
    return " ".join(part for part in parts if part)


def get_exact_cached_response(cache_key: str) -> ChatResponse | None:
    cached = EXACT_RESPONSE_CACHE.get(cache_key)
    if cached is None:
        return None
    return cached.model_copy(deep=True)


def store_exact_cached_response(cache_key: str, response: ChatResponse) -> None:
    EXACT_RESPONSE_CACHE[cache_key] = response.model_copy(deep=True)


def build_allowed_vocabulary(bundle: CachedLevelBundle, selected_chunks: list[Chunk]) -> list[str]:
    allowed_tokens = set(CORE_TUTOR_VOCAB)
    allowed_tokens.update(bundle.glossary.keys())
    for chunk in selected_chunks:
        allowed_tokens.update(chunk.tokens)
    return sorted(token for token in allowed_tokens if token)


def _collect_higher_level_tokens(
    level: str,
    raw_level_data: dict[str, tuple[list[str], list[Chunk]]],
) -> set[str]:
    higher_tokens: set[str] = set()
    for other_level, (vocabulary, _) in raw_level_data.items():
        if other_level > level:
            higher_tokens.update(vocabulary)
    return higher_tokens


def _build_question_answer_map(transcripts, vocabulary: set[str]) -> dict[str, str]:
    question_answer_map: dict[str, str] = {}
    for transcript in transcripts:
        lines = [line.strip() for line in transcript.content.splitlines() if line.strip()]
        for index in range(len(lines) - 1):
            question = lines[index]
            answer = lines[index + 1]
            normalized_question = _normalize_question_key(question)
            if not normalized_question:
                continue
            answer_tokens = {normalize_hebrew_token(token) for token in answer.split() if normalize_hebrew_token(token)}
            if answer_tokens and answer_tokens.issubset(vocabulary) and is_short_hebrew_answer(answer):
                question_answer_map.setdefault(normalized_question, answer)
    return question_answer_map


def _normalize_question_key(text: str) -> str:
    normalized = " ".join(normalize_hebrew_token(part) for part in text.split() if normalize_hebrew_token(part))
    return normalized.strip()
