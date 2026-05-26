"""
Pronunciation Assessment Route
POST /api/ai/pronunciation/assess - score Hebrew pronunciation from audio file
POST /api/ai/pronunciation/validate - validate a target word before Azure scoring
"""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.pronunciation import assess_pronunciation
from services.pronunciation import validate_pronunciation_reference

router = APIRouter()


@router.post("/pronunciation/assess")
async def assess(
    audio: UploadFile = File(..., description="WAV file (16kHz, 16-bit, mono)"),
    reference_text: str = Form(..., description="Expected Hebrew text"),
    language_level: str = Form(default="A1", description="Curriculum level, e.g. A1/A2/B1/B2"),
):
    """
    Score pronunciation of a Hebrew phrase.

    - Upload a WAV audio file
    - Provide the expected Hebrew text
    - Get back accuracy, fluency, completeness, and pronunciation scores
    """
    if not (audio.filename or "").lower().endswith(".wav"):
        raise HTTPException(
            status_code=400,
            detail="Only WAV files are supported. Convert with: ffmpeg -i input.m4a -ar 16000 -ac 1 -sample_fmt s16 output.wav",
        )

    audio_bytes = await audio.read()

    try:
        return assess_pronunciation(audio_bytes, reference_text, language_level)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pronunciation assessment failed: {str(exc)}")


@router.post("/pronunciation/validate")
async def validate_pronunciation(
    word: str = Form(..., description="Hebrew word to validate"),
    language_level: str = Form(default="A1", description="Curriculum level, e.g. A1/A2/B1/B2"),
):
    return validate_pronunciation_reference(word, language_level)
