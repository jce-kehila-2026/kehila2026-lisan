"""
Internal endpoints that only the Lisan backend may call.

POST /api/ai/internal/summarize-corrections
    {"level": "A1", "rules": [{"id": "...", "ruleText": "..."}]}
 -> {"success": true, "summary": "...", "sentences": [{"text", "ruleIds"}], "model": "..."}

Requires X-Internal-Service-Secret; fails closed in production when the
secret is not configured (services/internal_auth.py).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from services.correction_summarizer import (
    MAX_RULES,
    SummaryParseError,
    summarize_corrections,
)
from services.internal_auth import require_internal_service_secret

router = APIRouter()
logger = logging.getLogger("lisan.internal")


class CorrectionRule(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    ruleText: str = Field(min_length=1, max_length=1000)


class SummarizeCorrectionsRequest(BaseModel):
    level: str = Field(min_length=1, max_length=8)
    rules: list[CorrectionRule] = Field(min_length=1, max_length=MAX_RULES)


@router.post(
    "/internal/summarize-corrections",
    dependencies=[Depends(require_internal_service_secret)],
)
async def summarize_corrections_route(payload: SummarizeCorrectionsRequest):
    rules = [rule.model_dump() for rule in payload.rules]
    try:
        result = await run_in_threadpool(
            summarize_corrections, payload.level.strip().upper(), rules
        )
    except SummaryParseError as exc:
        logger.warning({"event": "summarize_corrections_bad_json", "error": str(exc)})
        raise HTTPException(status_code=502, detail=f"Model returned invalid JSON: {exc}") from exc
    except Exception as exc:  # provider chain exhausted, timeouts, ...
        logger.warning({"event": "summarize_corrections_failed", "error": str(exc)})
        raise HTTPException(status_code=502, detail="Summary provider failed") from exc
    return {
        "success": True,
        "summary": result.summary,
        "sentences": result.sentences,
        "provider": result.provider,
        "model": result.model,
    }
