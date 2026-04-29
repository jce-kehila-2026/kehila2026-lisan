"""
Lisan AI Service — Standalone FastAPI server
Provides AI endpoints for the Lisan language learning platform.
Backend team calls these endpoints via HTTP.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes.pronunciation import router as pronunciation_router

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
app.include_router(pronunciation_router, prefix="/api/ai")


@app.get("/")
def root():
    return {"service": "Lisan AI", "status": "running"}


@app.get("/api/ai/health")
def health():
    return {"status": "ok", "service": "ai"}
