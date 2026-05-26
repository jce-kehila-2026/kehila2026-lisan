"""
Lisan AI Service — Standalone FastAPI server
Provides AI endpoints for the Lisan language learning platform.
Backend team calls these endpoints via HTTP.
"""

import logging

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

from routes.chat import router as chat_router
from routes.evaluation import router as evaluation_router
from routes.pronunciation import router as pronunciation_router
from services.chat_cache import check_rate_limit
from services.chat_cache import initialize_chat_cache

logging.basicConfig(level=logging.INFO, format="%(message)s")
logging.getLogger("lisan.chat").setLevel(logging.INFO)

app = FastAPI(
    title="Lisan AI Service",
    version="1.0.0",
    description="AI endpoints for Hebrew/Arabic language learning",
)

# CORS — allow backend to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(chat_router, prefix="/api/ai")
app.include_router(evaluation_router, prefix="/api/ai")
app.include_router(pronunciation_router, prefix="/api/ai")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if _is_rate_limit_exempt_path(request.url.path):
        return await call_next(request)

    user_id = request.headers.get("X-User-ID", "anonymous")
    allowed, retry_after_seconds = check_rate_limit(user_id)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit exceeded",
                "userId": (user_id or "anonymous").strip() or "anonymous",
                "retryAfterSeconds": retry_after_seconds,
            },
            headers={"Retry-After": str(retry_after_seconds)},
        )

    return await call_next(request)


@app.on_event("startup")
def warm_chat_cache() -> None:
    initialize_chat_cache()


@app.get("/")
def root():
    return {"service": "Lisan AI", "status": "running"}


@app.get("/api/ai/health")
def health():
    return {"status": "ok", "service": "ai"}


def _is_rate_limit_exempt_path(path: str) -> bool:
    return path in {
        "/",
        "/api/ai/health",
        "/api/ai/rate-limit/status",
    }
