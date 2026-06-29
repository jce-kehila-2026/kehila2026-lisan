from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, Field, model_validator


class ChatRequest(BaseModel):
    message: str
    level: str = Field(default="A1")
    includeArabic: bool = Field(default=False)
    voiceMode: bool = Field(default=False)
    sessionId: str | None = Field(default=None)
    userId: str | None = Field(default=None)
    learnerName: str | None = Field(default=None)
    # Active "quick activity" mode (speaking/daily-word/letters/listening/quiz/
    # culture). When set, the engine runs an interactive role-play/activity that
    # leads the learner, instead of the generic tutor reply. None = normal chat.
    scenario: str | None = Field(default=None)


class GuardrailReport(BaseModel):
    vocabularyLeakage: bool = False
    blockedTokens: list[str] = Field(default_factory=list)
    grammarErrors: list[str] = Field(default_factory=list)


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
    inputTokens: int | None = Field(default=None)
    outputTokens: int | None = Field(default=None)


class VoiceChatResponse(BaseModel):
    """Response schema for POST /api/ai/chat/voice

    Contract guarantees (enforced by model_validator):
      - answerHe is always a str (never None)
      - transcribedText is always a str (never None)
      - fallbackReason is always set when fallbackUsed=True
      - latencyMs is always a non-negative int
      - pronunciationScore is 0-100 or None when assessment was not run
    """
    # str | None accepted at parse time; validator coerces None → ""
    answerHe: str | None = ""
    answerAr: str | None = None
    audioBase64: str | None = None
    fallbackUsed: bool = False
    fallbackReason: str | None = None
    level: str = "A1"
    model: str = ""
    provider: str | None = None
    latencyMs: int = 0
    transcribedText: str | None = ""
    pronunciationScore: int | None = None
    ssmlText: str | None = None
    suggestedNextPrompts: list[str] = Field(default_factory=list)
    inputTokens: int | None = Field(default=None)
    outputTokens: int | None = Field(default=None)


    @model_validator(mode="after")
    def _enforce_contract(self) -> "VoiceChatResponse":
        # coerce None → "" for string fields that must never be null
        if self.answerHe is None:
            self.answerHe = ""
        if self.transcribedText is None:
            self.transcribedText = ""
        # fallbackReason must be set when fallbackUsed=True
        if self.fallbackUsed and not self.fallbackReason:
            self.fallbackReason = "UNKNOWN"
        # latencyMs must be non-negative
        if self.latencyMs < 0:
            self.latencyMs = 0
        # pronunciationScore must be in 0-100 range when set
        if self.pronunciationScore is not None:
            self.pronunciationScore = max(0, min(100, self.pronunciationScore))
        return self


@dataclass(frozen=True)
class ChatRequestContext:
    message: str
    normalized_message: str
    requested_level: str
    include_arabic: bool
    cache_key: str
    provider: str
    model: str
    voice_mode: bool = False
    session_id: str | None = None
    user_id: str | None = None
    learner_name: str | None = None
    scenario: str | None = None
    # The learner's raw includeArabic preference (before the Hebrew-only scope
    # override). Used to attach a short Arabic gloss (answerAr) to LLM replies.
    raw_include_arabic: bool = False


@dataclass(frozen=True)
class RetrievalContext:
    chunk_ids: list[str]
    context_text: str
    chunks_count: int
    relevance_scores: list[float]
