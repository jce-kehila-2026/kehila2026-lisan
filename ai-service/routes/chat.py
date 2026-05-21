from __future__ import annotations

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from services.chat_engine import generate_chat_response
from services.chat_schemas import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    return await run_in_threadpool(generate_chat_response, payload)
