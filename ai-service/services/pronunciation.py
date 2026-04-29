"""
Pronunciation Assessment Service
Wraps Azure Speech SDK for Hebrew pronunciation scoring.
"""

import azure.cognitiveservices.speech as speechsdk
import json
import os
import wave
import tempfile
import io


def _ensure_wav_format(audio_bytes: bytes) -> bytes:
    """Validate and re-encode audio as 16kHz, 16-bit, mono PCM WAV."""
    try:
        with io.BytesIO(audio_bytes) as buf:
            with wave.open(buf, "rb") as w:
                frames = w.readframes(w.getnframes())
                n_channels = w.getnchannels()
                sampwidth = w.getsampwidth()
                framerate = w.getframerate()

        # If already correct format, return as-is
        if n_channels == 1 and sampwidth == 2 and framerate == 16000:
            return audio_bytes

        # Re-encode with correct params
        output = io.BytesIO()
        with wave.open(output, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(frames)
        return output.getvalue()

    except wave.Error:
        # Not a valid WAV — return as-is and let Azure report the error
        return audio_bytes


def assess_pronunciation(audio_bytes: bytes, reference_text: str) -> dict:
    """
    Score pronunciation of a Hebrew phrase from audio bytes.

    Args:
        audio_bytes: WAV file content (16kHz, 16-bit, mono PCM)
        reference_text: The expected Hebrew text (e.g. "בוקר טוב")

    Returns:
        dict with scores and word-level details, or error info
    """
    speech_key = os.getenv("AZURE_SPEECH_KEY")
    speech_region = os.getenv("AZURE_SPEECH_REGION")

    if not speech_key or not speech_region:
        return {"success": False, "error": "Azure Speech credentials not configured"}

    # Validate WAV format
    audio_bytes = _ensure_wav_format(audio_bytes)

    # Write audio bytes to a temp WAV file (SDK needs a file path)
    tmp_path = os.path.join(tempfile.gettempdir(), "lisan_tmp_audio.wav")
    with open(tmp_path, "wb") as f:
        f.write(audio_bytes)

    try:
        # Speech config
        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key, region=speech_region
        )
        speech_config.speech_recognition_language = "he-IL"

        # Audio config from file
        audio_config = speechsdk.audio.AudioConfig(filename=tmp_path)

        # Pronunciation assessment config
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )

        # Recognize
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, audio_config=audio_config
        )
        pronunciation_config.apply_to(recognizer)
        result = recognizer.recognize_once()

        # Release resources before cleanup
        del recognizer
        del audio_config

        # Handle result
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            pron_result = speechsdk.PronunciationAssessmentResult(result)

            raw_json = json.loads(
                result.properties.get(
                    speechsdk.PropertyId.SpeechServiceResponse_JsonResult, "{}"
                )
            )

            return {
                "success": True,
                "recognized_text": result.text,
                "reference_text": reference_text,
                "scores": {
                    "accuracy": round(pron_result.accuracy_score, 1),
                    "fluency": round(pron_result.fluency_score, 1),
                    "completeness": round(pron_result.completeness_score, 1),
                    "pronunciation": round(pron_result.pronunciation_score, 1),
                },
                "details": raw_json,
            }

        elif result.reason == speechsdk.ResultReason.NoMatch:
            return {
                "success": False,
                "error": "No speech recognized. Check audio quality and format (16kHz, 16-bit, mono WAV).",
            }

        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            return {
                "success": False,
                "error": f"Recognition canceled: {cancellation.reason}",
                "error_details": str(cancellation.error_details),
            }

    finally:
        try:
            os.unlink(tmp_path)
        except PermissionError:
            pass  # Windows may still lock the file briefly
