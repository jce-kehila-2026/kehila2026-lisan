"""
Lisan AI Service — Standalone FastAPI server
Provides AI endpoints for the Lisan language learning platform.
Backend team calls these endpoints via HTTP.
"""

import logging
import os
import sys

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
logger = logging.getLogger("lisan.main")
logging.getLogger("lisan.chat").setLevel(logging.INFO)


# ── Startup environment validation (fail-fast) ──────────────────────────────

def _validate_required_env() -> None:
    """
    Block startup if mandatory env vars are missing.

    In production, mis-configuration must crash loudly at boot rather
    than silently fail on the first user request.
    """
    env_mode = os.getenv("ENV_MODE", "development").strip().lower()
    is_production = env_mode == "production"

    missing: list[str] = []
    # Always required
    for var in ("AI_SERVICE_INTERNAL_SECRET",):
        if not os.getenv(var, "").strip():
            missing.append(var)

    # LLM provider must have at least one key
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    key_name = {
        "gemini": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }.get(provider)
    if key_name and not os.getenv(key_name, "").strip():
        missing.append(key_name)

    if is_production:
        if not os.getenv("BACKEND_URL", "").strip():
            missing.append("BACKEND_URL")
        if not os.getenv("CORS_ALLOWED_ORIGINS", "").strip():
            missing.append("CORS_ALLOWED_ORIGINS")

    if missing:
        msg = (
            "FATAL: ai-service cannot start. Missing required environment "
            f"variables: {', '.join(missing)}. "
            "Set them in .env or your deployment platform."
        )
        logger.error(msg)
        if is_production:
            print(msg, file=sys.stderr, flush=True)
            sys.exit(1)
        else:
            logger.warning(msg + " (continuing in development mode)")


_validate_required_env()


# ── CORS origins from env var ────────────────────────────────────────────────

def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
    if not raw:
        # Dev default
        return [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if "*" in origins:
        logger.warning(
            "CORS_ALLOWED_ORIGINS contains '*' — wide-open CORS is "
            "DANGEROUS in production. Restrict to your real frontend "
            "origin before launch."
        )
    return origins


app = FastAPI(
    title="Lisan AI Service",
    version="1.0.0",
    description="AI endpoints for Hebrew/Arabic language learning",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
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


@app.on_event("shutdown")
def _on_shutdown() -> None:
    """
    Flush in-flight vocab-tracker threads so rolling deploys don't drop
    the student's last few vocab events. Caps at 5 s so K8s SIGTERM grace
    isn't blown.
    """
    try:
        from services.vocab_tracker import wait_for_inflight
        unfinished = wait_for_inflight(timeout=5.0)
        if unfinished:
            logger.warning({
                "event": "vocab_tracker_shutdown_unflushed",
                "count": unfinished,
            })
    except Exception as exc:
        logger.warning({"event": "shutdown_vocab_flush_failed", "detail": str(exc)})


@app.get("/")
def root():
    return {"service": "Lisan AI", "status": "running"}


@app.get("/api/ai/health")
def health():
    """
    Liveness probe — process is up and responsive.
    Does NOT check downstream dependencies. Use /ready for that.
    """
    return {"status": "ok", "service": "ai"}


@app.get("/api/ai/ready")
def readiness():
    """
    Readiness probe — service is ready to take traffic.
    Checks: chat cache warm, LLM key present, Redis reachable if configured.
    Returns 200 if all green, 503 with detail if any check fails.
    """
    checks: dict[str, str] = {}
    overall_ok = True

    # 1. Startup cache warmed?
    try:
        from services.chat_cache import get_rag_cache_status, is_startup_cache_ready
        checks["cache"] = "ok" if is_startup_cache_ready() else "cold"
        if checks["cache"] != "ok":
            overall_ok = False
        rag_status = get_rag_cache_status()
        transcript_sources = rag_status.get("transcripts", {})
        if transcript_sources:
            sources = {
                str(status.get("source"))
                for status in transcript_sources.values()
                if isinstance(status, dict)
            }
            checks["rag"] = ",".join(sorted(sources))
            if os.getenv("RAG_REQUIRE_BACKEND", "").strip().lower() in {"1", "true", "yes", "on"}:
                if sources != {"backend"}:
                    overall_ok = False
        else:
            checks["rag"] = "unknown"
    except Exception as exc:
        checks["cache"] = f"error: {exc}"
        overall_ok = False

    # 2. LLM provider key present?
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    key_name = {
        "gemini": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }.get(provider, "")
    if key_name and os.getenv(key_name, "").strip():
        checks[f"llm:{provider}"] = "ok"
    else:
        checks[f"llm:{provider}"] = "missing_key"
        overall_ok = False

    # 3. Redis (only if configured — otherwise N/A is fine)
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        try:
            from services.redis_client import get_redis_client
            client = get_redis_client()
            if client and client.ping():
                checks["redis"] = "ok"
            else:
                checks["redis"] = "unreachable"
                overall_ok = False
        except Exception as exc:
            checks["redis"] = f"error: {exc}"
            overall_ok = False
    else:
        checks["redis"] = "not_configured"

    status_code = 200 if overall_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if overall_ok else "degraded",
            "service": "ai",
            "checks": checks,
        },
    )


def _is_rate_limit_exempt_path(path: str) -> bool:
    # Health/readiness probes + admin-only routes that go through the backend
    # rate limiter already. cache/stats stays user-facing rate-limited so the
    # public rate limit applies; admin analytics/logs are exempt because the
    # admin dashboard polls them.
    return path in {
        "/",
        "/api/ai/health",
        "/api/ai/ready",
        "/api/ai/rate-limit/status",
        "/api/ai/analytics",
        "/api/ai/logs",
    }
