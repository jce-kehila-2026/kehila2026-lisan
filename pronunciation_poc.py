"""
Lisan - Pronunciation Assessment POC
Sprint 1: Score a single Hebrew phrase ("בוקר טוב") from a WAV file
Uses Azure Speech SDK with Pronunciation Assessment
"""

import azure.cognitiveservices.speech as speechsdk
import json
import os

# === Config ===
# ⚠️ Move these to .env before committing!
SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "YOUR_KEY_HERE")
SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "swedencentral")
AUDIO_FILE = "test_audio.wav"
REFERENCE_TEXT = "בוקר טוב"
LANGUAGE = "he-IL"


def assess_pronunciation(audio_file: str, reference_text: str) -> dict:
    """Score pronunciation of a Hebrew phrase from a WAV file."""

    # Setup speech config
    speech_config = speechsdk.SpeechConfig(
        subscription=SPEECH_KEY,
        region=SPEECH_REGION,
    )
    speech_config.speech_recognition_language = LANGUAGE

    # Setup audio input from file
    audio_config = speechsdk.audio.AudioConfig(filename=audio_file)

    # Setup pronunciation assessment
    pronunciation_config = speechsdk.PronunciationAssessmentConfig(
        reference_text=reference_text,
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=True,
    )

    # Create recognizer and apply pronunciation assessment
    recognizer = speechsdk.SpeechRecognizer(
        speech_config=speech_config,
        audio_config=audio_config,
    )
    pronunciation_config.apply_to(recognizer)

    # Run recognition
    print(f"Assessing: \"{reference_text}\"")
    print(f"Audio file: {audio_file}")
    print("Processing...\n")

    result = recognizer.recognize_once()

    # Handle result
    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        pronunciation_result = speechsdk.PronunciationAssessmentResult(result)

        # Print scores
        print("=" * 40)
        print("PRONUNCIATION SCORES")
        print("=" * 40)
        print(f"Recognized text: {result.text}")
        print(f"Accuracy Score:    {pronunciation_result.accuracy_score:.1f}/100")
        print(f"Fluency Score:     {pronunciation_result.fluency_score:.1f}/100")
        print(f"Completeness:      {pronunciation_result.completeness_score:.1f}/100")
        print(f"Pronunciation:     {pronunciation_result.pronunciation_score:.1f}/100")
        print("=" * 40)

        # Build full response
        response = {
            "recognized_text": result.text,
            "reference_text": reference_text,
            "scores": {
                "accuracy": pronunciation_result.accuracy_score,
                "fluency": pronunciation_result.fluency_score,
                "completeness": pronunciation_result.completeness_score,
                "pronunciation": pronunciation_result.pronunciation_score,
            },
            "raw_json": json.loads(
                result.properties.get(
                    speechsdk.PropertyId.SpeechServiceResponse_JsonResult, "{}"
                )
            ),
        }

        # Save full JSON response
        output_file = "pronunciation_result.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(response, f, ensure_ascii=False, indent=2)
        print(f"\nFull JSON saved to: {output_file}")

        return response

    elif result.reason == speechsdk.ResultReason.NoMatch:
        print("ERROR: No speech recognized. Check:")
        print("  - Is the WAV file 16kHz, 16-bit, mono PCM?")
        print("  - Is the audio clear enough?")
        print("  - Is the language correct (he-IL)?")
        return None

    elif result.reason == speechsdk.ResultReason.Canceled:
        cancellation = result.cancellation_details
        print(f"ERROR: Recognition canceled.")
        print(f"  Reason: {cancellation.reason}")
        if cancellation.reason == speechsdk.CancellationReason.Error:
            print(f"  Error code: {cancellation.error_code}")
            print(f"  Error details: {cancellation.error_details}")
            if "401" in str(cancellation.error_details):
                print("  → Check your AZURE_SPEECH_KEY")
            elif "connection" in str(cancellation.error_details).lower():
                print("  → Check your internet connection and AZURE_SPEECH_REGION")
        return None


if __name__ == "__main__":
    # Check if key is set
    if SPEECH_KEY == "YOUR_KEY_HERE":
        print("ERROR: Set your Azure Speech key first!")
        print("  Option 1: Set env var AZURE_SPEECH_KEY")
        print("  Option 2: Edit SPEECH_KEY in this file (don't commit it!)")
        exit(1)

    # Check if audio file exists
    if not os.path.exists(AUDIO_FILE):
        print(f"ERROR: Audio file '{AUDIO_FILE}' not found.")
        print("  Record yourself saying \"בוקר טוב\" and save as test_audio.wav")
        exit(1)

    assess_pronunciation(AUDIO_FILE, REFERENCE_TEXT)
