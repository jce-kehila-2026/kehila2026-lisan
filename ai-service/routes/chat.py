from __future__ import annotations

import os

from fastapi import APIRouter
from fastapi import Header
from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest, ChatResponse

router = APIRouter()


def require_internal_service_secret(
    x_internal_service_secret: str | None = Header(default=None),
) -> None:
    expected_secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()

    if not expected_secret:
        return

    if not x_internal_service_secret:
        raise HTTPException(status_code=401, detail="Missing internal service secret")

    if x_internal_service_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid internal service secret")


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    x_internal_service_secret: str | None = Header(default=None),
) -> ChatResponse:
    require_internal_service_secret(x_internal_service_secret)
    return await run_in_threadpool(generate_chat_response, payload)
