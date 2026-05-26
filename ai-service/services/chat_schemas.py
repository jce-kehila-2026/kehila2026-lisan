from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str
    level: str = Field(default="A1")
    includeArabic: bool = Field(default=False)


class GuardrailReport(BaseModel):
    vocabularyLeakage: bool = False
    blockedTokens: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answerHe: str
    answerAr: str | None
    fallbackUsed: bool
    fallbackReason: str | None
    level: str
    model: str
    provider: str | None = None
    latencyMs: int
    cacheHit: bool = False
    routerHit: bool = False
    contextChunkIds: list[str] = Field(default_factory=list)
    retrievalScores: list[float] = Field(default_factory=list)
    guardrail: GuardrailReport = Field(default_factory=GuardrailReport)
    suggestedNextPrompts: list[str] = Field(default_factory=list)


class VoiceChatResponse(BaseModel):
    """Response schema for POST /api/ai/chat/voice"""
    answerHe: str
    answerAr: str | None = None
    audioBase64: str | None = None          # MP3 bytes encoded as base64, null if TTS failed
    fallbackUsed: bool = False
    fallbackReason: str | None = None
    level: str = "A1"
    model: str = ""
    provider: str | None = None
    latencyMs: int = 0
    transcribedText: str = ""               # what Whisper heard (useful for debugging)
    suggestedNextPrompts: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class ChatRequestContext:
    message: str
    normalized_message: str
    requested_level: str
    include_arabic: bool
    cache_key: str
    provider: str
    model: str


@dataclass(frozen=True)
class RetrievalContext:
    chunk_ids: list[str]
    context_text: str
    chunks_count: int
    relevance_scores: list[float]
