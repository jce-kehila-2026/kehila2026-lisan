import json
import logging
import os
import wave
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from services.evaluation import (
    GeminiNotConfiguredError,
    evaluate_hebrew_speaking,
    infer_pronunciation_warning,
)
from services.pronunciation import assess_pronunciation

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_ACTIVITY_MODES = {
    "meaning_conversation",
    "guided_conversation",
    "repeat",
    "read_aloud",
    "free_chat",
    "assessment",
}
VALID_ANALYSIS_DEPTHS = {"meaning_only", "standard", "pronunciation_precise"}
DEFAULT_ACTIVITY_MODE = "guided_conversation"
DEFAULT_MAX_AUDIO_SECONDS = 12.0


@dataclass
class AzureDecision:
    should_use: bool
    skipped_reason: str | None
    requested: bool


@router.post("/evaluate-speaking")
async def evaluate_speaking(
    request: Request,
    audio: UploadFile | None = File(default=None),
    reference_text: str | None = Form(default=None),
    recognizedTextHe: str | None = Form(default=None),
    level: str = Form(default="A1"),
    activityTitle: str | None = Form(default=None),
    activityTopic: str | None = Form(default=None),
    targetVocabulary: str | None = Form(default=None),
    targetGrammar: str | None = Form(default=None),
    expectedStudentAction: str | None = Form(default=None),
    expectedPatterns: str | None = Form(default=None),
    activityMode: str | None = Form(default=None),
    analysisDepth: str | None = Form(default=None),
    userRequestedPronunciationCheck: str | bool | None = Form(default=None),
    remainingPronunciationChecks: str | None = Form(default=None),
):
    logger.info(
        "Received evaluate-speaking request",
        extra={"content_type": request.headers.get("content-type", "")},
    )
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("application/json"):
        payload = await request.json()
        return await evaluate_from_json_payload(payload)

    return await evaluate_from_form_payload(
        audio=audio,
        reference_text=reference_text,
        recognized_text_he=recognizedTextHe,
        level=level,
        activity_title=activityTitle,
        activity_topic=activityTopic,
        target_vocabulary=parse_json_array_field(targetVocabulary),
        target_grammar=parse_json_array_field(targetGrammar),
        expected_student_action=expectedStudentAction,
        expected_patterns=parse_json_array_field(expectedPatterns),
        activity_mode=activityMode,
        analysis_depth=analysisDepth,
        user_requested_pronunciation_check=parse_bool(userRequestedPronunciationCheck),
        remaining_pronunciation_checks=parse_optional_number(remainingPronunciationChecks),
    )


async def evaluate_from_json_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    recognized_text_he = str(payload.get("recognizedTextHe") or "").strip()
    if not recognized_text_he:
        raise HTTPException(
            status_code=400,
            detail="recognizedTextHe is required for JSON requests",
        )

    level = str(payload.get("level") or "A1")
    activity_mode = normalize_activity_mode(payload.get("activityMode"))
    analysis_depth = normalize_analysis_depth(
        payload.get("analysisDepth"),
        activity_mode,
    )
    user_requested_pronunciation_check = parse_bool(
        payload.get("userRequestedPronunciationCheck")
    )
    remaining_pronunciation_checks = parse_optional_number(
        payload.get("remainingPronunciationChecks")
    )
    reference_text = payload.get("referenceText") or payload.get("reference_text")
    azure_decision = decide_azure_pronunciation(
        level=level,
        activity_mode=activity_mode,
        analysis_depth=analysis_depth,
        user_requested_pronunciation_check=user_requested_pronunciation_check,
        remaining_pronunciation_checks=remaining_pronunciation_checks,
        has_audio=False,
        has_reference_text=bool(reference_text),
    )

    try:
        logger.info(
            "Starting JSON speaking evaluation",
            extra={"level": level, "activity_mode": activity_mode},
        )
        response = await run_in_threadpool(
            evaluate_hebrew_speaking,
            recognized_text_he=recognized_text_he,
            reference_text=reference_text,
            level=level,
            activity_title=payload.get("activityTitle"),
            activity_topic=payload.get("activityTopic"),
            target_vocabulary=coerce_string_list(payload.get("targetVocabulary")),
            target_grammar=coerce_string_list(payload.get("targetGrammar")),
            expected_student_action=payload.get("expectedStudentAction"),
            expected_patterns=coerce_string_list(payload.get("expectedPatterns")),
            pronunciation_warning="none",
            activity_mode=activity_mode,
            analysis_depth=analysis_depth,
        )
        attach_usage(
            response,
            activity_mode=activity_mode,
            analysis_depth=analysis_depth,
            used_azure=False,
            azure_skipped_reason=azure_decision.skipped_reason,
            remaining_pronunciation_checks=remaining_pronunciation_checks,
            pronunciation_check_consumed=False,
        )
        logger.info("Returning JSON speaking evaluation response")
        return response
    except GeminiNotConfiguredError:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Gemini is not configured",
                "code": "GEMINI_API_KEY_MISSING",
            },
        )


async def evaluate_from_form_payload(
    audio: UploadFile | None,
    reference_text: str | None,
    recognized_text_he: str | None,
    level: str,
    activity_title: str | None,
    activity_topic: str | None,
    target_vocabulary: list[str],
    target_grammar: list[str],
    expected_student_action: str | None,
    expected_patterns: list[str],
    activity_mode: str | None,
    analysis_depth: str | None,
    user_requested_pronunciation_check: bool,
    remaining_pronunciation_checks: float | None,
) -> dict[str, Any]:
    normalized_text = (recognized_text_he or "").strip()
    pronunciation_result: dict[str, Any] | None = None
    normalized_activity_mode = normalize_activity_mode(activity_mode)
    normalized_analysis_depth = normalize_analysis_depth(
        analysis_depth,
        normalized_activity_mode,
    )
    normalized_level = level or "A1"
    has_reference_text = bool((reference_text or "").strip())
    azure_decision = decide_azure_pronunciation(
        level=normalized_level,
        activity_mode=normalized_activity_mode,
        analysis_depth=normalized_analysis_depth,
        user_requested_pronunciation_check=user_requested_pronunciation_check,
        remaining_pronunciation_checks=remaining_pronunciation_checks,
        has_audio=audio is not None,
        has_reference_text=has_reference_text,
    )

    if audio is not None:
        if not audio.filename.lower().endswith(".wav"):
            raise HTTPException(
                status_code=400,
                detail="Only WAV files are supported for audio evaluation.",
            )

        if azure_decision.should_use:
            audio_bytes = await audio.read()
            validate_audio_duration(audio_bytes)
            pronunciation_result = await run_in_threadpool(
                assess_pronunciation, audio_bytes, reference_text
            )
            azure_text = (pronunciation_result.get("recognized_text") or "").strip()
            if azure_text:
                normalized_text = azure_text

    if not normalized_text:
        raise HTTPException(
            status_code=400,
            detail="recognizedTextHe is required when Azure pronunciation cannot provide usable text.",
        )

    pronunciation_warning = (
        infer_pronunciation_warning(pronunciation_result)
        if pronunciation_result is not None
        else "none"
    )

    try:
        logger.info(
            "Starting form speaking evaluation",
            extra={
                "level": normalized_level,
                "has_audio": audio is not None,
                "activity_mode": normalized_activity_mode,
                "analysis_depth": normalized_analysis_depth,
                "use_azure": azure_decision.should_use,
            },
        )
        evaluation = await run_in_threadpool(
            evaluate_hebrew_speaking,
            recognized_text_he=normalized_text,
            reference_text=reference_text,
            level=normalized_level,
            activity_title=activity_title,
            activity_topic=activity_topic,
            target_vocabulary=target_vocabulary,
            target_grammar=target_grammar,
            expected_student_action=expected_student_action,
            expected_patterns=expected_patterns,
            pronunciation_warning=pronunciation_warning,
            activity_mode=normalized_activity_mode,
            analysis_depth=normalized_analysis_depth,
        )
        attach_usage(
            evaluation,
            activity_mode=normalized_activity_mode,
            analysis_depth=normalized_analysis_depth,
            used_azure=pronunciation_result is not None,
            azure_skipped_reason=azure_decision.skipped_reason,
            remaining_pronunciation_checks=remaining_pronunciation_checks,
            pronunciation_check_consumed=pronunciation_result is not None,
        )
        logger.info("Returning form speaking evaluation response")
    except GeminiNotConfiguredError:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Gemini is not configured",
                "code": "GEMINI_API_KEY_MISSING",
            },
        )

    if pronunciation_result is not None:
        evaluation["azure"] = {
            "success": pronunciation_result.get("success", False),
            "reference_text": pronunciation_result.get("reference_text", reference_text),
            "scores": pronunciation_result.get("scores") or {},
        }
        if not pronunciation_result.get("success"):
            evaluation["azure"]["error"] = pronunciation_result.get("error")

    return evaluation


def decide_azure_pronunciation(
    level: str,
    activity_mode: str,
    analysis_depth: str,
    user_requested_pronunciation_check: bool,
    remaining_pronunciation_checks: float | None,
    has_audio: bool,
    has_reference_text: bool,
) -> AzureDecision:
    azure_enabled = parse_bool(os.getenv("USE_AZURE_PRONUNCIATION", "true"))
    free_chat_uses_azure = parse_bool(
        os.getenv("FREE_CHAT_USES_AZURE_PRONUNCIATION", "false")
    )
    level_upper = (level or "A1").upper()

    requested_by_policy = (
        activity_mode in {"repeat", "read_aloud"}
        or analysis_depth == "pronunciation_precise"
        or user_requested_pronunciation_check
        or (level_upper in {"B1", "B2"} and activity_mode == "assessment")
    )

    if activity_mode == "free_chat" and not user_requested_pronunciation_check:
        requested_by_policy = requested_by_policy and free_chat_uses_azure

    if level_upper in {"A1", "A2"} and activity_mode in {
        "guided_conversation",
        "meaning_conversation",
    }:
        return AzureDecision(
            False,
            "policy_not_allowed" if requested_by_policy else None,
            requested_by_policy,
        )

    if not azure_enabled:
        return AzureDecision(False, "disabled_by_config" if requested_by_policy else None, requested_by_policy)
    if remaining_pronunciation_checks == 0:
        return AzureDecision(False, "quota_exhausted" if requested_by_policy else None, requested_by_policy)
    if not requested_by_policy:
        return AzureDecision(False, None, False)
    if not has_audio:
        return AzureDecision(False, "missing_audio", True)
    if not has_reference_text:
        return AzureDecision(False, "missing_reference_text", True)

    return AzureDecision(True, None, True)


def attach_usage(
    evaluation: dict[str, Any],
    activity_mode: str,
    analysis_depth: str,
    used_azure: bool,
    azure_skipped_reason: str | None,
    remaining_pronunciation_checks: float | None,
    pronunciation_check_consumed: bool,
) -> None:
    returned_remaining = remaining_pronunciation_checks
    if pronunciation_check_consumed and returned_remaining is not None:
        returned_remaining = max(0, returned_remaining - 1)

    evaluation["usage"] = {
        "usedAzurePronunciation": used_azure,
        "usedGemini": True,
        "analysisDepth": analysis_depth,
        "activityMode": activity_mode,
        "costMode": "medium" if used_azure else "cheap",
        "pronunciationCheckConsumed": pronunciation_check_consumed,
        "remainingPronunciationChecks": returned_remaining,
        "azureSkippedReason": azure_skipped_reason,
    }


def normalize_activity_mode(value: Any) -> str:
    mode = str(value or DEFAULT_ACTIVITY_MODE).strip()
    return mode if mode in VALID_ACTIVITY_MODES else DEFAULT_ACTIVITY_MODE


def normalize_analysis_depth(value: Any, activity_mode: str) -> str:
    if value is None or str(value).strip() == "":
        return "meaning_only" if activity_mode == "meaning_conversation" else "standard"
    depth = str(value).strip()
    return depth if depth in VALID_ANALYSIS_DEPTHS else "standard"


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def parse_optional_number(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed


def validate_audio_duration(audio_bytes: bytes) -> None:
    max_seconds = parse_optional_number(os.getenv("MAX_AUDIO_SECONDS"))
    if max_seconds is None:
        max_seconds = DEFAULT_MAX_AUDIO_SECONDS
    try:
        with wave.open(BytesIO(audio_bytes), "rb") as wav:
            frame_rate = wav.getframerate()
            if frame_rate <= 0:
                return
            duration_seconds = wav.getnframes() / float(frame_rate)
    except wave.Error:
        return
    if duration_seconds > max_seconds:
        raise HTTPException(
            status_code=400,
            detail=f"Audio is too long. Maximum allowed duration is {max_seconds:g} seconds.",
        )


def parse_json_array_field(value: str | None) -> list[str]:
    if value is None or value.strip() == "":
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid JSON array field: {value}",
        ) from exc
    return coerce_string_list(parsed)


def coerce_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]
