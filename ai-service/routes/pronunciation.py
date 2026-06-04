"""
Pronunciation Assessment Route
POST /api/ai/pronunciation/assess - score Hebrew pronunciation from audio file
POST /api/ai/pronunciation/validate - validate a target word before Azure scoring
"""

from __future__ import annotations

import os

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.pronunciation import assess_pronunciation
from services.pronunciation import validate_pronunciation_reference

router = APIRouter()

# Reject audio larger than this BEFORE reading into memory.
# Default 25 MB matches the backend voice upload cap.
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(25 * 1024 * 1024)))


@router.post("/pronunciation/assess")
async def assess(
    audio: UploadFile = File(..., description="WAV file (16kHz, 16-bit, mono)"),
    reference_text: str = Form(..., description="Expected Hebrew text"),
    language_level: str = Form(
        default="A1", description="Curriculum level, e.g. A1/A2/B1/B2"
    ),
):
    """
    Score pronunciation of a Hebrew phrase.

    - Upload a WAV audio file (max 25 MB)
    - Provide the expected Hebrew text
    - Get back accuracy, fluency, completeness, and pronunciation scores
    """
    if not (audio.filename or "").lower().endswith(".wav"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Only WAV files are supported. Convert with: "
                "ffmpeg -i input.m4a -ar 16000 -ac 1 -sample_fmt s16 output.wav"
            ),
        )

    # Use Content-Length header if available — avoids reading huge file into RAM
    content_length = getattr(audio, "size", None)
    if content_length and content_length > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Audio file too large ({content_length} bytes). "
                f"Max allowed: {MAX_AUDIO_BYTES} bytes."
            ),
        )

    # Read in chunks to enforce the cap even when Content-Length is missing
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await audio.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Audio file exceeds {MAX_AUDIO_BYTES} bytes "
                    "(streaming check)."
                ),
            )
        chunks.append(chunk)
    audio_bytes = b"".join(chunks)

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    try:
        return assess_pronunciation(audio_bytes, reference_text, language_level)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Pronunciation assessment failed: {str(exc)}",
        )


@router.post("/pronunciation/validate")
async def validate_pronunciation(
    word: str = Form(..., description="Hebrew word to validate"),
    language_level: str = Form(default="A1", description="Curriculum level, e.g. A1/A2/B1/B2"),
):
    return validate_pronunciation_reference(word, language_level)
