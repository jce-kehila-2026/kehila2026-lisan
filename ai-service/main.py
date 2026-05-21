"""
Lisan AI Service — Standalone FastAPI server
Provides AI endpoints for the Lisan language learning platform.
Backend team calls these endpoints via HTTP.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes.chat import router as chat_router
from routes.evaluation import router as evaluation_router
from routes.pronunciation import router as pronunciation_router
from services.chat_cache import warm_startup_chat_cache

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


@app.on_event("startup")
def warm_chat_cache() -> None:
    warm_startup_chat_cache()


@app.get("/")
def root():
    return {"service": "Lisan AI", "status": "running"}


@app.get("/api/ai/health")
def health():
    return {"status": "ok", "service": "ai"}
