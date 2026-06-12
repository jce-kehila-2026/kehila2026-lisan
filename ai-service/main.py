"""
Lisan AI Service — Standalone FastAPI server
Provides AI endpoints for the Lisan language learning platform.
Backend team calls these endpoints via HTTP.
"""

import logging
import os
import sys
import time

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()


def _env_enabled(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}

# Sentry initialization
sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
if sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        traces_sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[FastApiIntegration()],
            traces_sample_rate=traces_sample_rate,
        )
        logging.getLogger("lisan.main").info("Sentry initialized successfully")
    except Exception as exc:
        logging.getLogger("lisan.main").warning(f"Sentry initialization failed: {exc}")

# OpenTelemetry initialization
if _env_enabled("ENABLE_OTEL"):
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
        logging.getLogger("lisan.main").info("OpenTelemetry initialized successfully")
    except Exception as exc:
        logging.getLogger("lisan.main").warning(f"OpenTelemetry initialization failed: {exc}")

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


def _validate_model_configuration() -> None:
    """
    Optionally test that the configured LLM provider/model answers a real
    call at boot. OFF by default: every live probe consumes free-tier quota
    on each restart (and a 429 would mask a perfectly valid config). Enable
    with VALIDATE_LLM_ON_STARTUP=true where quota is not a constraint.
    """
    opt_in = os.getenv("VALIDATE_LLM_ON_STARTUP", "").strip().lower()
    if opt_in not in {"1", "true", "yes", "on"}:
        return
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower() or "gemini"
    model = (
        os.getenv("LLM_MODEL", "gemini-2.5-flash-lite").strip()
        or "gemini-2.5-flash-lite"
    )
    env_mode = os.getenv("ENV_MODE", "development").strip().lower()
    is_production = env_mode == "production"
    try:
        from services.chat_provider import call_provider

        logger.info(f"Validating LLM: {provider}/{model}")
        result = call_provider(
            provider,
            model,
            "You are helpful.",
            "Say 'ok'.",
        )
        if not result or not result.answer:
            raise RuntimeError("Model returned empty response")
        logger.info(f"LLM validation passed: {provider}/{model}")
    except Exception as exc:
        msg = (
            f"FATAL: LLM validation failed. Check {provider}/{model} "
            f"and API keys. Error: {exc}"
        )
        logger.error(msg)
        if is_production:
            print(msg, file=sys.stderr, flush=True)
            sys.exit(1)
        else:
            logger.warning(msg + " (dev mode: continuing)")


_validate_model_configuration()


def _validate_prompt_files() -> None:
    """
    Fail fast if the system prompt files are missing.

    _load_prompt() reads these lazily on the first chat request; without this
    check a bad image/deploy (prompt file not copied) would boot "healthy" and
    only crash when the first student sends a message. The voice prompt is
    optional — it falls back to the text prompt — so only the base prompt
    (v2 OR v1) is mandatory.
    """
    from services.chat_engine import (
        PROMPT_V1_PATH,
        PROMPT_V2_PATH,
        PROMPT_VOICE_PATH,
    )

    env_mode = os.getenv("ENV_MODE", "development").strip().lower()
    is_production = env_mode == "production"

    if not PROMPT_V2_PATH.exists() and not PROMPT_V1_PATH.exists():
        msg = (
            "FATAL: ai-service cannot start. No base system prompt found "
            f"(looked for {PROMPT_V2_PATH.name} and {PROMPT_V1_PATH.name} in "
            f"{PROMPT_V2_PATH.parent}). The deploy is missing the prompts/ dir."
        )
        logger.error(msg)
        if is_production:
            print(msg, file=sys.stderr, flush=True)
            sys.exit(1)
        else:
            logger.warning(msg + " (continuing in development mode)")
    elif not PROMPT_VOICE_PATH.exists():
        logger.warning(
            f"Voice system prompt missing ({PROMPT_VOICE_PATH.name}); "
            "voice mode will fall back to the text prompt."
        )


_validate_prompt_files()


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

# Register optional IP-based SlowAPI limits. Keep this opt-in: school NATs can
# put many students behind one IP, so user-id limits are the safer default.
if _env_enabled("ENABLE_SLOWAPI_RATE_LIMIT"):
    try:
        from services.chat_cache import SLO_LIMITER
        from slowapi.errors import RateLimitExceeded
        from slowapi import _rate_limit_exceeded_handler
        app.state.limiter = SLO_LIMITER
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    except Exception as exc:
        logger.warning(f"SlowAPI registration skipped: {exc}")

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


def _resolve_rate_identity(request: Request) -> str:
    """Resolve a stable rate-limit identity: X-User-ID → X-Session-ID → IP.

    Falling back to the real client IP (rather than one shared "anonymous"
    bucket) prevents a single un-authenticated caller from throttling every
    other anonymous student. The raw value is returned (no type prefix) so the
    /rate-limit/status endpoint, which is queried by raw user_id, stays
    consistent with the bucket the middleware fills.
    """
    user_id = (request.headers.get("X-User-ID") or "").strip()
    if user_id:
        return user_id
    session_id = (request.headers.get("X-Session-ID") or "").strip()
    if session_id:
        return session_id
    client_ip = request.client.host if request.client else None
    return (client_ip or "anonymous").strip() or "anonymous"


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if _is_rate_limit_exempt_path(request.url.path):
        return await call_next(request)

    # Programmatic IP-based rate limiting via SlowAPI for chat endpoints
    is_test = "pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST") is not None
    if (
        _env_enabled("ENABLE_SLOWAPI_RATE_LIMIT")
        and not is_test
        and request.url.path in {"/api/ai/chat", "/api/ai/chat/stream"}
    ):
        try:
            from services.chat_cache import SLO_LIMITER
            if SLO_LIMITER is not None:
                from slowapi.util import get_remote_address
                from limits import parse
                
                ip_address = get_remote_address(request) or "127.0.0.1"
                limit = parse(os.getenv("SLOWAPI_CHAT_LIMIT", "10/minute"))
                
                if not SLO_LIMITER.limiter.hit(limit, "chat_ip_limit", ip_address):
                    window_stats = SLO_LIMITER.limiter.get_window_stats(limit, "chat_ip_limit", ip_address)
                    retry_after_seconds = max(1, int(window_stats.reset_time - time.time())) if window_stats else 60
                    
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": "Rate limit exceeded",
                            "userId": ip_address,
                            "retryAfterSeconds": retry_after_seconds,
                        },
                        headers={"Retry-After": str(retry_after_seconds)},
                    )
        except Exception as exc:
            logger.warning(f"Programmatic SlowAPI rate limit check failed: {exc}")

    # Identity-based rate limiting with a fallback hierarchy:
    #   X-User-ID  → X-Session-ID  → client IP
    # Falling back to the real client IP (instead of a single shared
    # "anonymous" bucket) means one un-authenticated caller can't exhaust the
    # limit for every other anonymous student behind the service.
    rate_identity = _resolve_rate_identity(request)
    allowed, retry_after_seconds = check_rate_limit(rate_identity)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit exceeded",
                "userId": rate_identity,
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

    # 2b. Active failover chain (visibility): which free providers are wired,
    # in order. Lets ops confirm the no-interruption tiers at a glance.
    try:
        from services.chat_provider import _build_fallback_chain, _get_gemini_keys
        checks["provider_chain"] = " -> ".join(
            c.name for c in _build_fallback_chain()
        )
        checks["gemini_keys"] = str(len(_get_gemini_keys()))
    except Exception as exc:
        checks["provider_chain"] = f"error: {exc}"

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
