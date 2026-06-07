"""
Pronunciation Assessment Service
Wraps Azure Speech SDK for Hebrew pronunciation scoring and validates reference
words against the approved curriculum vocabulary before sending requests.
"""

from __future__ import annotations

import difflib
import json
import os
import tempfile
from pathlib import Path

import azure.cognitiveservices.speech as speechsdk

from services.chat_guardrails import hebrew_words, normalize_hebrew_token, normalize_level

BASE_DIR = Path(__file__).resolve().parents[1]
# Prefer the configurable env path; fall back to POC then data dir.
APPROVED_VOCAB_PATH = Path(
    os.getenv("APPROVED_VOCAB_PATH")
    or (BASE_DIR / "poc" / "approved-vocabulary.json")
)
DEFAULT_LEVEL = "A1"
SIMILARITY_THRESHOLD = 0.8
MAX_SUGGESTIONS = 5


class PronunciationValidator:
    def __init__(self, vocabulary_path: Path = APPROVED_VOCAB_PATH) -> None:
        self.vocabulary_path = vocabulary_path
        self.vocabulary_by_level = self._load_approved_vocabulary(vocabulary_path)

    def validate_word(self, word: str, language_level: str) -> dict:
        normalized_word = normalize_hebrew_token(word)
        level = normalize_level(language_level)
        approved_words = self._get_words_for_level(level)

        if not normalized_word:
            return {
                "valid": False,
                "word": normalized_word,
                "level": level,
                "feedback": "not_found",
                "suggestions": [],
            }

        if normalized_word in approved_words:
            return {
                "valid": True,
                "word": normalized_word,
                "level": level,
                "feedback": "exact_match",
                "suggestions": [],
            }

        suggestions = self._find_similar_words(normalized_word, approved_words)
        if suggestions:
            return {
                "valid": False,
                "word": normalized_word,
                "level": level,
                "feedback": "similar_match",
                "suggestions": suggestions,
            }

        return {
            "valid": False,
            "word": normalized_word,
            "level": level,
            "feedback": "not_found",
            "suggestions": [],
        }

    def validate_reference_text(self, reference_text: str, language_level: str) -> dict:
        level = normalize_level(language_level)
        words = [
            normalize_hebrew_token(token)
            for token in hebrew_words(reference_text)
            if normalize_hebrew_token(token)
        ]

        if not words:
            return {
                "valid": False,
                "level": level,
                "feedback": "not_found",
                "words": [],
                "invalidWords": [],
            }

        validated_words = [self.validate_word(word, level) for word in words]
        invalid_words = [item for item in validated_words if not item["valid"]]
        feedback = "exact_match" if not invalid_words else invalid_words[0]["feedback"]
        return {
            "valid": not invalid_words,
            "level": level,
            "feedback": feedback,
            "words": validated_words,
            "invalidWords": invalid_words,
        }

    def _load_approved_vocabulary(self, vocabulary_path: Path) -> dict[str, set[str]]:
        if not vocabulary_path.exists():
            # File missing → don't reject all words. Fall back to the
            # level bundle vocabulary (built from curriculum transcripts).
            try:
                from services.chat_cache import get_level_bundle
                bundle = get_level_bundle(DEFAULT_LEVEL)
                return {DEFAULT_LEVEL: set(bundle.vocab_set)}
            except Exception:
                return {DEFAULT_LEVEL: set()}

        raw_payload = json.loads(vocabulary_path.read_text(encoding="utf-8"))
        approved_words = raw_payload.get("approved_vocabulary") or []
        normalized_words = {
            normalize_hebrew_token(word)
            for word in approved_words
            if normalize_hebrew_token(str(word))
        }
        return {DEFAULT_LEVEL: normalized_words}

    def _get_words_for_level(self, level: str) -> set[str]:
        return self.vocabulary_by_level.get(level) or self.vocabulary_by_level.get(DEFAULT_LEVEL, set())

    def _find_similar_words(self, word: str, approved_words: set[str]) -> list[str]:
        def _normalize_sofiyot(text: str) -> str:
            mapping = {
                "ך": "כ",
                "ם": "מ",
                "ן": "נ",
                "ף": "פ",
                "ץ": "צ",
            }
            return "".join(mapping.get(char, char) for char in text)

        scored_matches: list[tuple[float, str]] = []
        normalized_word = _normalize_sofiyot(word)
        for candidate in approved_words:
            normalized_candidate = _normalize_sofiyot(candidate)
            similarity = difflib.SequenceMatcher(a=normalized_word, b=normalized_candidate).ratio()
            if similarity >= SIMILARITY_THRESHOLD:
                scored_matches.append((similarity, candidate))

        scored_matches.sort(key=lambda item: (item[0], len(item[1]), item[1]), reverse=True)
        return [candidate for _, candidate in scored_matches[:MAX_SUGGESTIONS]]


VALIDATOR = PronunciationValidator()


def _ensure_wav_format(audio_bytes: bytes) -> bytes:
    """Return 16kHz / 16-bit / mono PCM WAV bytes, transcoding if needed.

    Browsers record webm/opus, which the stdlib ``wave`` module cannot read
    (and which Azure cannot score). Such inputs — and any non-canonical WAV
    (wrong rate/channels/width) — are transcoded via PyAV/ffmpeg. Canonical
    WAV is returned untouched.
    """
    from services.audio_convert import to_wav_pcm16
    return to_wav_pcm16(audio_bytes)


def validate_pronunciation_reference(word: str, language_level: str) -> dict:
    return VALIDATOR.validate_word(word, language_level)


def assess_pronunciation(audio_bytes: bytes, reference_text: str, language_level: str = DEFAULT_LEVEL) -> dict:
    """
    Score pronunciation of a Hebrew phrase from audio bytes.

    Args:
        audio_bytes: WAV file content (16kHz, 16-bit, mono PCM)
        reference_text: The expected Hebrew text
        language_level: Curriculum level to validate against

    Returns:
        dict with scores and word-level details, or error info
    """
    validation = VALIDATOR.validate_reference_text(reference_text, language_level)
    if not validation["valid"]:
        return {
            "success": False,
            "error": "Reference text contains words outside approved vocabulary",
            "validation": validation,
        }

    speech_key = os.getenv("AZURE_SPEECH_KEY")
    speech_region = os.getenv("AZURE_SPEECH_REGION")

    if not speech_key or not speech_region:
        return {"success": False, "error": "Azure Speech credentials not configured", "validation": validation}

    audio_bytes = _ensure_wav_format(audio_bytes)

    tmp_path = os.path.join(tempfile.gettempdir(), "lisan_tmp_audio.wav")
    with open(tmp_path, "wb") as f:
        f.write(audio_bytes)

    try:
        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
        speech_config.speech_recognition_language = "he-IL"

        audio_config = speechsdk.audio.AudioConfig(filename=tmp_path)

        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )

        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, audio_config=audio_config
        )
        pronunciation_config.apply_to(recognizer)
        # recognize_once_async() returns a Future we can bound with a timeout.
        # Without this, a hung Azure SDK call would block the worker forever.
        pronunciation_timeout = float(
            os.getenv("PRONUNCIATION_TIMEOUT_SECONDS", "20")
        )
        future = recognizer.recognize_once_async()
        try:
            result = future.get(timeout=pronunciation_timeout)
        except TypeError:
            # Older SDK versions don't accept timeout on get()
            result = future.get()

        del recognizer
        del audio_config

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
                "validation": validation,
                "scores": {
                    "accuracy": round(pron_result.accuracy_score, 1),
                    "fluency": round(pron_result.fluency_score, 1),
                    "completeness": round(pron_result.completeness_score, 1),
                    "pronunciation": round(pron_result.pronunciation_score, 1),
                },
                "details": raw_json,
            }

        if result.reason == speechsdk.ResultReason.NoMatch:
            return {
                "success": False,
                "error": "No speech recognized. Check audio quality and format (16kHz, 16-bit, mono WAV).",
                "validation": validation,
            }

        if result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            return {
                "success": False,
                "error": f"Recognition canceled: {cancellation.reason}",
                "error_details": str(cancellation.error_details),
                "validation": validation,
            }

        return {
            "success": False,
            "error": "Unknown pronunciation assessment result",
            "validation": validation,
        }
    finally:
        try:
            os.unlink(tmp_path)
        except PermissionError:
            pass
