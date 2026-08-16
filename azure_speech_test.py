import os
import sys
import time

try:
    import azure.cognitiveservices.speech as speechsdk
except ImportError as e:
    print("FAILED: azure-cognitiveservices-speech not installed:", e)
    sys.exit(1)

SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "").strip()
SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "").strip()
TEXT = "שלום, מה שלומך היום?"

print(f"AZURE_SPEECH_REGION = {SPEECH_REGION!r}")
print(f"AZURE_SPEECH_KEY set = {bool(SPEECH_KEY)} (length={len(SPEECH_KEY)})")

if not SPEECH_KEY or not SPEECH_REGION:
    print("FAILED: AZURE_SPEECH_KEY or AZURE_SPEECH_REGION missing from environment")
    sys.exit(1)

# ── Step 1: Text-to-Speech — synthesize Hebrew text to a WAV file ─────────
print("\n--- Step 1: TTS (text -> speech) ---")
tts_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
tts_config.speech_synthesis_voice_name = "he-IL-HilaNeural"
tts_config.set_speech_synthesis_output_format(
    speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm
)
synthesizer = speechsdk.SpeechSynthesizer(speech_config=tts_config, audio_config=None)

t0 = time.perf_counter()
tts_result = synthesizer.speak_text_async(TEXT).get()
tts_elapsed = time.perf_counter() - t0

print(f"reason = {tts_result.reason}")

if tts_result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
    # NOTE: for SpeechSynthesisResult, cancellation info is a PROPERTY
    # (result.cancellation_details), NOT speechsdk.CancellationDetails(result)
    # (that constructor form is only valid for recognition results).
    cd = tts_result.cancellation_details
    print("FAILED: TTS did not complete.")
    if cd is not None:
        print(f"  cancel_reason={cd.reason}")
        print(f"  error_code={cd.error_code}")
        print(f"  error_details={cd.error_details}")
    else:
        print("  (no cancellation_details available)")
    sys.exit(1)

audio_bytes = bytes(tts_result.audio_data or b"")
print(f"OK: synthesized {len(audio_bytes)} bytes of audio in {tts_elapsed:.2f}s")

wav_path = "/tmp/azure_test.wav"
with open(wav_path, "wb") as f:
    f.write(audio_bytes)

# ── Step 2: Speech-to-Text — transcribe the WAV back to text ──────────────
print("\n--- Step 2: STT (speech -> text) ---")
stt_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
stt_config.speech_recognition_language = "he-IL"
audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
recognizer = speechsdk.SpeechRecognizer(speech_config=stt_config, audio_config=audio_config)

t0 = time.perf_counter()
stt_result = recognizer.recognize_once()
stt_elapsed = time.perf_counter() - t0

print(f"reason = {stt_result.reason}")
if stt_result.reason == speechsdk.ResultReason.RecognizedSpeech:
    print(f"OK: recognized in {stt_elapsed:.2f}s")
    print(f"ORIGINAL:   {TEXT}")
    print(f"RECOGNIZED: {stt_result.text}")
elif stt_result.reason == speechsdk.ResultReason.NoMatch:
    print("FAILED: no speech could be recognized (audio may be malformed)")
    sys.exit(1)
elif stt_result.reason == speechsdk.ResultReason.Canceled:
    # For recognition results, this constructor form IS correct.
    cd = speechsdk.CancellationDetails(stt_result)
    print(f"FAILED: STT canceled. cancel_reason={cd.reason}")
    print(f"  error_details={cd.error_details}")
    sys.exit(1)

print("\n=== SUCCESS: Azure Speech key + region are valid and working ===")