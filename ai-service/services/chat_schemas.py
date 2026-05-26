from __future__ import annotations

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
    guardrail: GuardrailReport = Field(default_factory=GuardrailReport)
    suggestedNextPrompts: list[str] = Field(default_factory=list)
