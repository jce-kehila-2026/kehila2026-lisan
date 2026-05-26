from __future__ import annotations

import threading
from collections import Counter
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
    "בסדר",
    "בבקשה",
    "יש",
    "אין",
    "גר",
    "גרה",
    "עובד",
    "עובדת",
    "רוצה",
]
DIRECT_HEBREW_WORD_RESPONSES = {
    "שלום": "שלום.",
    "היי": "שלום.",
    "תודה": "בבקשה.",
    "כן": "כן.",
    "לא": "לא.",
    "מים": "זה מים.",
    "קפה": "זה קפה.",
    "בית": "זה בית.",
    "אמא": "זאת אמא.",
    "אבא": "זה אבא.",
    "ילד": "זה ילד.",
    "ילדה": "זאת ילדה.",
    "אישה": "זאת אישה.",
    "איש": "זה איש.",
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
    token_frequency: dict[str, int]


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

        raw_level_data: dict[str, tuple[list[str], list[Chunk], list]] = {}
        for level in discovered_levels:
            transcripts, _ = load_transcripts(level)
            vocabulary = extract_vocabulary(transcripts)
            chunks = chunk_transcripts(transcripts)
            raw_level_data[level] = (vocabulary, chunks, transcripts)

        cumulative_levels = sorted(raw_level_data.keys())
        for level in cumulative_levels:
            vocabulary, chunks, transcripts = raw_level_data[level]
            higher_level_tokens = _collect_higher_level_tokens(level, raw_level_data)
            CHAT_CACHE[level] = CachedLevelBundle(
                level=level,
                vocab=vocabulary,
                vocab_set=frozenset(vocabulary),
                chunks=chunks,
                advanced_only_tokens=frozenset(higher_level_tokens - set(vocabulary)),
                glossary=dict(DIRECT_HEBREW_WORD_RESPONSES),
                question_answer_map=_build_question_answer_map(transcripts, set(vocabulary)),
                token_frequency=_build_token_frequency_map(transcripts),
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
    priority_tokens = list(CORE_TUTOR_VOCAB)
    allowed_tokens = set(priority_tokens)
    allowed_tokens.update(bundle.glossary.keys())

    ranked_chunk_tokens = _rank_chunk_tokens(bundle, selected_chunks)
    allowed_tokens.update(ranked_chunk_tokens)

    ordered_tokens = priority_tokens + sorted(bundle.glossary.keys()) + ranked_chunk_tokens
    return _dedupe_preserving_order(token for token in ordered_tokens if token in allowed_tokens)


def _collect_higher_level_tokens(
    level: str,
    raw_level_data: dict[str, tuple[list[str], list[Chunk], list]],
) -> set[str]:
    higher_tokens: set[str] = set()
    for other_level, (vocabulary, _, _) in raw_level_data.items():
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
            answer_tokens = {
                normalize_hebrew_token(token)
                for token in answer.split()
                if normalize_hebrew_token(token)
            }
            if answer_tokens and answer_tokens.issubset(vocabulary) and is_short_hebrew_answer(answer):
                question_answer_map.setdefault(normalized_question, answer)
    return question_answer_map


def _normalize_question_key(text: str) -> str:
    normalized = " ".join(normalize_hebrew_token(part) for part in text.split() if normalize_hebrew_token(part))
    return normalized.strip()


def _build_token_frequency_map(transcripts) -> dict[str, int]:
    frequencies: Counter[str] = Counter()
    for transcript in transcripts:
        for token in transcript.content.split():
            normalized = normalize_hebrew_token(token)
            if normalized:
                frequencies[normalized] += 1
    return dict(frequencies)


def _rank_chunk_tokens(bundle: CachedLevelBundle, selected_chunks: list[Chunk]) -> list[str]:
    ranked: list[tuple[int, int, str]] = []
    seen_tokens: set[str] = set()
    for chunk in selected_chunks:
        for token in chunk.tokens:
            if not token or token in seen_tokens:
                continue
            seen_tokens.add(token)
            ranked.append((bundle.token_frequency.get(token, 0), -len(token), token))
    ranked.sort(reverse=True)
    return [token for _, _, token in ranked]


def _dedupe_preserving_order(tokens) -> list[str]:
    ordered_tokens: list[str] = []
    seen_tokens: set[str] = set()
    for token in tokens:
        if token in seen_tokens:
            continue
        seen_tokens.add(token)
        ordered_tokens.append(token)
    return ordered_tokens
