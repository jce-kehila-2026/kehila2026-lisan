"""
Pronunciation Assessment Route
POST /api/ai/pronunciation/assess — score Hebrew pronunciation from audio file
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from services.pronunciation import assess_pronunciation

router = APIRouter()


@router.post("/pronunciation/assess")
async def assess(
    audio: UploadFile = File(..., description="WAV file (16kHz, 16-bit, mono)"),
    reference_text: str = Form(..., description="Expected Hebrew text, e.g. בוקר טוב"),
):
    """
    Score pronunciation of a Hebrew phrase.

    - Upload a WAV audio file
    - Provide the expected Hebrew text
    - Get back accuracy, fluency, completeness, and pronunciation scores

    Backend team: call this from Express with multipart/form-data.
    """
    # Validate file type
    if not audio.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only WAV files are supported. Convert with: ffmpeg -i input.m4a -ar 16000 -ac 1 -sample_fmt s16 output.wav")

    audio_bytes = await audio.read()

    try:
        result = assess_pronunciation(audio_bytes, reference_text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pronunciation assessment failed: {str(e)}")
