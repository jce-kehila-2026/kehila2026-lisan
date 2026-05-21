import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any

from google import genai
from google.genai import types as genai_types

logger = logging.getLogger(__name__)
GEMINI_TIMEOUT_EXECUTOR = ThreadPoolExecutor(
    max_workers=8,
    thread_name_prefix="gemini-timeout",
)


DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_MAX_RETRIES = 0
DEFAULT_GEMINI_REQUEST_DELAY_SECONDS = 0.0
DEFAULT_GEMINI_TIMEOUT_SECONDS = 10.0
DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 512
FALLBACK_HE_FEEDBACK = "לא שמעתי טוב. נסי שוב בבקשה."
GOOD_HE_FEEDBACK = "יפה מאוד. נמשיך."
RETRY_HE_FEEDBACK = "כמעט נכון. נסה שוב."
UNCLEAR_AUDIO_HE_FEEDBACK = "לא שמעתי ברור. נסה שוב."
OFF_TOPIC_HE_FEEDBACK = "המשפט נכון, אבל לא בנושא הזה. נסה לענות על השאלה."
SHORT_HE_FEEDBACK_MAX_CHARS = 120
MAX_SENTENCE_MARKERS = 2
VALID_CORRECTION_TYPES = {
    "grammar",
    "vocabulary",
    "meaning",
    "pronunciation_warning",
    "topic",
}
VALID_SEVERITIES = {"low", "medium", "high"}
VALID_NEXT_ACTIONS = {"continue", "retry", "give_hint", "move_next"}
VALID_PRONUNCIATION_WARNINGS = {
    "none",
    "unclear_audio",
    "likely_mispronunciation",
}
HEBREW_CHAR_RE = re.compile(r"[\u0590-\u05FF]")
ARABIC_CHAR_RE = re.compile(r"[\u0600-\u06FF]")
LETTER_CHAR_RE = re.compile(r"[A-Za-z\u0590-\u05FF\u0600-\u06FF]")
SENTENCE_END_RE = re.compile(r"[.!?]")
POSITIVE_OPENING_RE = re.compile(r"^\s*(טוב מאוד|יפה מאוד)")
NON_HEBREW_WORD_RE = re.compile(r"[^\u0590-\u05FF\s]")
HEBREW_STOPWORDS = {
    "אני",
    "את",
    "אתה",
    "הוא",
    "היא",
    "אנחנו",
    "אתם",
    "אתן",
    "הם",
    "הן",
    "רוצה",
    "רוצים",
    "רוצות",
}


class GeminiNotConfiguredError(RuntimeError):
    pass


class GeminiTimeoutError(TimeoutError):
    pass


class GeminiQuotaExhaustedError(RuntimeError):
    pass


def infer_pronunciation_warning(pronunciation_result: dict[str, Any] | None) -> str:
    if not pronunciation_result:
        return "none"

    if not pronunciation_result.get("success"):
        return "unclear_audio"

    recognized_text = (pronunciation_result.get("recognized_text") or "").strip()
    if not recognized_text:
        return "unclear_audio"

    scores = pronunciation_result.get("scores") or {}
    accuracy = float(scores.get("accuracy") or 0)
    pronunciation = float(scores.get("pronunciation") or 0)

    if accuracy and pronunciation and (accuracy < 60 or pronunciation < 60):
        return "likely_mispronunciation"

    return "none"


def contains_hebrew(text: str) -> bool:
    return bool(HEBREW_CHAR_RE.search(text or ""))


def is_mostly_hebrew(text: str) -> bool:
    if not text:
        return False
    letters = LETTER_CHAR_RE.findall(text)
    if not letters:
        return False
    hebrew_chars = HEBREW_CHAR_RE.findall(text)
    return len(hebrew_chars) / len(letters) >= 0.6


def has_arabic(text: str) -> bool:
    return bool(ARABIC_CHAR_RE.search(text or ""))


def select_hebrew_fallback(
    recognized_text_he: str,
    pronunciation_warning: str,
    is_relevant: bool,
    is_within_activity_topic: bool,
    is_hebrew_correct_enough: bool,
) -> str:
    if pronunciation_warning == "unclear_audio":
        return UNCLEAR_AUDIO_HE_FEEDBACK
    if recognized_text_he and is_hebrew_correct_enough and not is_within_activity_topic:
        return OFF_TOPIC_HE_FEEDBACK
    if recognized_text_he and is_hebrew_correct_enough and is_relevant:
        return GOOD_HE_FEEDBACK
    return RETRY_HE_FEEDBACK


def is_valid_spoken_feedback(text: str) -> bool:
    if not text:
        return False
    if len(text) > SHORT_HE_FEEDBACK_MAX_CHARS:
        return False
    if SENTENCE_END_RE.findall(text) and len(SENTENCE_END_RE.findall(text)) > MAX_SENTENCE_MARKERS:
        return False
    if has_arabic(text):
        return False
    if not contains_hebrew(text):
        return False
    if not is_mostly_hebrew(text):
        return False
    return True


def has_retry_worthy_correction(
    corrections: list[dict[str, Any]],
    level: str,
    advanced_but_correct: bool,
) -> bool:
    if advanced_but_correct:
        return False

    for correction in corrections:
        correction_type = correction.get("type")
        severity = correction.get("severity")
        if severity in {"medium", "high"}:
            return True
        if (
            level.upper() in {"A1", "A2"}
            and correction_type in {"grammar", "vocabulary", "meaning"}
        ):
            return True

    return False


def normalize_hebrew_phrase(text: str) -> str:
    cleaned = NON_HEBREW_WORD_RE.sub(" ", text or "")
    return " ".join(cleaned.split())


def tokenize_hebrew_phrase(text: str) -> list[str]:
    normalized = normalize_hebrew_phrase(text)
    return [token for token in normalized.split() if token]


def content_tokens(text: str) -> list[str]:
    return [token for token in tokenize_hebrew_phrase(text) if token not in HEBREW_STOPWORDS]


def compute_token_overlap_ratio(left_tokens: list[str], right_tokens: list[str]) -> float:
    if not left_tokens or not right_tokens:
        return 0.0
    left_set = set(left_tokens)
    right_set = set(right_tokens)
    return len(left_set & right_set) / max(1, len(right_set))


def common_prefix_length(left_tokens: list[str], right_tokens: list[str]) -> int:
    count = 0
    for left, right in zip(left_tokens, right_tokens):
        if left != right:
            break
        count += 1
    return count


def common_suffix_length(left_tokens: list[str], right_tokens: list[str]) -> int:
    count = 0
    for left, right in zip(reversed(left_tokens), reversed(right_tokens)):
        if left != right:
            break
        count += 1
    return count


def choose_best_expected_pattern(
    recognized_text_he: str,
    expected_patterns: list[str],
) -> tuple[str | None, float]:
    recognized_tokens = tokenize_hebrew_phrase(recognized_text_he)
    best_pattern = None
    best_score = -1.0

    for pattern in expected_patterns:
        pattern_tokens = tokenize_hebrew_phrase(pattern)
        overlap = compute_token_overlap_ratio(recognized_tokens, pattern_tokens)
        exact_bonus = 1.0 if normalize_hebrew_phrase(pattern) == normalize_hebrew_phrase(recognized_text_he) else 0.0
        score = overlap + exact_bonus
        if score > best_score:
            best_pattern = pattern
            best_score = score

    return best_pattern, max(best_score, 0.0)


def build_expected_pattern_fallback(
    recognized_text_he: str,
    level: str,
    pronunciation_warning: str,
    expected_patterns: list[str],
) -> dict[str, Any] | None:
    if not expected_patterns:
        return None

    best_pattern, _ = choose_best_expected_pattern(recognized_text_he, expected_patterns)
    if not best_pattern:
        return None

    recognized_norm = normalize_hebrew_phrase(recognized_text_he)
    expected_norm = normalize_hebrew_phrase(best_pattern)
    recognized_tokens = tokenize_hebrew_phrase(recognized_text_he)
    expected_tokens = tokenize_hebrew_phrase(best_pattern)
    recognized_content = content_tokens(recognized_text_he)
    expected_content = content_tokens(best_pattern)
    prefix_len = common_prefix_length(recognized_tokens, expected_tokens)
    suffix_len = common_suffix_length(recognized_tokens, expected_tokens)
    content_overlap = compute_token_overlap_ratio(recognized_content, expected_content)

    if recognized_norm == expected_norm:
        spoken_feedback = select_hebrew_fallback(
            recognized_text_he=recognized_text_he,
            pronunciation_warning=pronunciation_warning,
            is_relevant=True,
            is_within_activity_topic=True,
            is_hebrew_correct_enough=True,
        )
        return {
            "isRelevant": True,
            "isWithinActivityTopic": True,
            "isHebrewCorrectEnough": True,
            "level": level,
            "score": 90,
            "recognizedTextHe": recognized_text_he,
            "advancedButCorrectLanguage": False,
            "pronunciationWarning": pronunciation_warning,
            "corrections": [],
            "nextAction": "continue",
            "spokenFeedbackHe": spoken_feedback,
            "displayFeedback": {"he": spoken_feedback, "ar": ""},
            "tts": {"language": "he", "voiceStyle": "simple_teacher", "shouldSpeak": True},
            "fallbackRule": "expected_pattern_match",
        }

    if prefix_len > 0 or suffix_len > 0:
        diff_start = prefix_len
        diff_end_recognized = len(recognized_tokens) - suffix_len if suffix_len else len(recognized_tokens)
        diff_end_expected = len(expected_tokens) - suffix_len if suffix_len else len(expected_tokens)
        student_text = " ".join(recognized_tokens[diff_start:diff_end_recognized] or recognized_tokens[diff_start:])
        correct_text = " ".join(expected_tokens[diff_start:diff_end_expected] or expected_tokens[diff_start:])
        if suffix_len:
            student_text = " ".join(recognized_tokens[diff_start:])
            correct_text = " ".join(expected_tokens[diff_start:])

        spoken_feedback = f"כמעט נכון. אומרים: {best_pattern}, נסה שוב."
        return {
            "isRelevant": True,
            "isWithinActivityTopic": True,
            "isHebrewCorrectEnough": False,
            "level": level,
            "score": 55,
            "recognizedTextHe": recognized_text_he,
            "advancedButCorrectLanguage": False,
            "pronunciationWarning": pronunciation_warning,
            "corrections": [
                {
                    "type": "vocabulary",
                    "severity": "medium",
                    "studentText": student_text or recognized_text_he,
                    "correctText": correct_text or best_pattern,
                    "explanationHeSimple": f"בעברית אומרים {correct_text or best_pattern}.",
                    "explanationArOptional": "",
                }
            ],
            "nextAction": "retry",
            "spokenFeedbackHe": spoken_feedback,
            "displayFeedback": {"he": spoken_feedback, "ar": ""},
            "tts": {"language": "he", "voiceStyle": "simple_teacher", "shouldSpeak": True},
            "fallbackRule": "expected_pattern_mismatch",
        }

    if content_overlap >= 0.5:
        spoken_feedback = f"נכון. אפשר גם לומר: {best_pattern}."
        return {
            "isRelevant": True,
            "isWithinActivityTopic": True,
            "isHebrewCorrectEnough": True,
            "level": level,
            "score": 78,
            "recognizedTextHe": recognized_text_he,
            "advancedButCorrectLanguage": True,
            "pronunciationWarning": pronunciation_warning,
            "corrections": [],
            "nextAction": "continue",
            "spokenFeedbackHe": spoken_feedback,
            "displayFeedback": {"he": spoken_feedback, "ar": ""},
            "tts": {"language": "he", "voiceStyle": "simple_teacher", "shouldSpeak": True},
            "fallbackRule": "expected_pattern_match",
        }

    spoken_feedback = RETRY_HE_FEEDBACK
    return {
        "isRelevant": True,
        "isWithinActivityTopic": True,
        "isHebrewCorrectEnough": False,
        "level": level,
        "score": 50,
        "recognizedTextHe": recognized_text_he,
        "advancedButCorrectLanguage": False,
        "pronunciationWarning": pronunciation_warning,
        "corrections": [],
        "nextAction": "retry",
        "spokenFeedbackHe": spoken_feedback,
        "displayFeedback": {"he": spoken_feedback, "ar": ""},
        "tts": {"language": "he", "voiceStyle": "simple_teacher", "shouldSpeak": True},
        "fallbackRule": "expected_pattern_mismatch",
    }


def evaluate_hebrew_speaking(
    recognized_text_he: str,
    level: str = "A1",
    activity_title: str | None = None,
    activity_topic: str | None = None,
    target_vocabulary: list[str] | None = None,
    target_grammar: list[str] | None = None,
    expected_student_action: str | None = None,
    expected_patterns: list[str] | None = None,
    reference_text: str | None = None,
    pronunciation_warning: str = "none",
    max_feedback_items: int | None = None,
    activity_mode: str = "guided_conversation",
    analysis_depth: str = "standard",
) -> dict[str, Any]:
    started_at = time.perf_counter()
    model = os.getenv("LLM_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not os.getenv("GEMINI_API_KEY"):
        raise GeminiNotConfiguredError("Gemini is not configured")
    gemini_timeout_seconds = parse_timeout_seconds(
        os.getenv("GEMINI_TIMEOUT_SECONDS"),
        DEFAULT_GEMINI_TIMEOUT_SECONDS,
    )
    logger.info(
        "Starting Gemini speaking evaluation",
        extra={
            "model": model,
            "level": level,
            "timeout_seconds": gemini_timeout_seconds,
        },
    )
    prompt = build_evaluation_prompt(
        recognized_text_he=recognized_text_he,
        level=level,
        activity_title=activity_title,
        activity_topic=activity_topic,
        target_vocabulary=target_vocabulary or [],
        target_grammar=target_grammar or [],
        expected_student_action=expected_student_action,
        expected_patterns=expected_patterns or [],
        reference_text=reference_text,
        pronunciation_warning=pronunciation_warning,
        max_feedback_items=max_feedback_items,
        activity_mode=activity_mode,
        analysis_depth=analysis_depth,
    )
    prompt_chars = len(prompt)

    gemini_started_at = time.perf_counter()
    try:
        logger.info(
            "Calling Gemini for speaking evaluation",
            extra={"model": model, "level": level, "prompt_chars": prompt_chars},
        )
        response_text = call_gemini_json_with_timeout(
            model=model,
            prompt=prompt,
            timeout_seconds=gemini_timeout_seconds,
        )
        parsed = json.loads(response_text)
        fallback_used = False
        evaluation_source = "gemini"
        fallback_reason = None
        provider_error_code = None
        gemini_ms = round((time.perf_counter() - gemini_started_at) * 1000)
        used_timeout = False
    except GeminiTimeoutError:
        logger.warning(
            "Gemini evaluation timed out for speaking assessment",
            extra={"model": model, "level": level, "timeout_seconds": gemini_timeout_seconds},
        )
        parsed = build_safe_fallback_output(
            recognized_text_he=recognized_text_he,
            level=level,
            pronunciation_warning=pronunciation_warning,
            expected_patterns=build_fallback_candidates(
                expected_patterns=expected_patterns,
                target_vocabulary=target_vocabulary,
                reference_text=reference_text,
            ),
        )
        fallback_used = True
        evaluation_source = "fallback"
        fallback_reason = "gemini_timeout"
        provider_error_code = None
        gemini_ms = round((time.perf_counter() - gemini_started_at) * 1000)
        used_timeout = True
    except GeminiQuotaExhaustedError:
        logger.warning(
            "Gemini quota exhausted",
            extra={"model": model, "level": level},
        )
        parsed = build_safe_fallback_output(
            recognized_text_he=recognized_text_he,
            level=level,
            pronunciation_warning=pronunciation_warning,
            expected_patterns=build_fallback_candidates(
                expected_patterns=expected_patterns,
                target_vocabulary=target_vocabulary,
                reference_text=reference_text,
            ),
        )
        fallback_used = True
        evaluation_source = "fallback"
        fallback_reason = "gemini_quota_exhausted"
        provider_error_code = "RESOURCE_EXHAUSTED"
        gemini_ms = round((time.perf_counter() - gemini_started_at) * 1000)
        used_timeout = False
    except Exception:
        logger.exception(
            "Gemini evaluation failed for speaking assessment",
            extra={"model": model, "level": level},
        )
        parsed = build_safe_fallback_output(
            recognized_text_he=recognized_text_he,
            level=level,
            pronunciation_warning=pronunciation_warning,
            expected_patterns=build_fallback_candidates(
                expected_patterns=expected_patterns,
                target_vocabulary=target_vocabulary,
                reference_text=reference_text,
            ),
        )
        fallback_used = True
        evaluation_source = "fallback"
        fallback_reason = "gemini_error"
        provider_error_code = None
        gemini_ms = round((time.perf_counter() - gemini_started_at) * 1000)
        used_timeout = False

    normalized = normalize_evaluation_output(
        parsed,
        recognized_text_he=recognized_text_he,
        level=level,
        pronunciation_warning=pronunciation_warning,
        max_feedback_items=max_feedback_items,
    )
    normalized["fallbackUsed"] = fallback_used
    normalized["evaluationSource"] = evaluation_source
    if fallback_reason:
        normalized["fallbackReason"] = fallback_reason
    if provider_error_code:
        normalized["providerErrorCode"] = provider_error_code
    normalized["performance"] = {
        "totalMs": round((time.perf_counter() - started_at) * 1000),
        "geminiMs": gemini_ms,
        "usedTimeout": used_timeout,
        "promptChars": prompt_chars,
        "model": model,
    }
    logger.info(
        "Completed speaking evaluation",
        extra={
            "model": model,
            "level": level,
            "fallback_used": fallback_used,
            "evaluation_source": evaluation_source,
            "fallback_reason": fallback_reason,
        },
    )
    return normalized


def build_evaluation_prompt(
    recognized_text_he: str,
    level: str,
    activity_title: str | None,
    activity_topic: str | None,
    target_vocabulary: list[str],
    target_grammar: list[str],
    expected_student_action: str | None,
    expected_patterns: list[str],
    reference_text: str | None,
    pronunciation_warning: str,
    max_feedback_items: int | None,
    activity_mode: str,
    analysis_depth: str,
) -> str:
    output_schema = {
        "isRelevant": True,
        "isWithinActivityTopic": True,
        "isHebrewCorrectEnough": True,
        "level": level,
        "score": 85,
        "recognizedTextHe": recognized_text_he,
        "advancedButCorrectLanguage": False,
        "pronunciationWarning": pronunciation_warning,
        "corrections": [
            {
                "type": "grammar",
                "severity": "low",
                "studentText": recognized_text_he,
                "correctText": recognized_text_he,
                "explanationHeSimple": "תשובה קצרה ופשוטה בעברית.",
                "explanationArOptional": "",
            }
        ],
        "nextAction": "continue",
        "spokenFeedbackHe": "טוב מאוד. נמשיך.",
        "displayFeedback": {
            "he": "טוב מאוד. נמשיך.",
            "ar": "",
        },
        "tts": {
            "language": "he",
            "voiceStyle": "simple_teacher",
            "shouldSpeak": True,
        },
    }

    max_items_text = (
        str(max_feedback_items)
        if max_feedback_items is not None
        else ("1" if level.upper() in {"A1", "A2"} else "2")
    )
    level_policy = (
        "For A1/A2: focus on meaning, basic vocabulary, simple sentence order, "
        "and communication quality. Correct only one main issue. Keep spokenFeedbackHe "
        "very short and simple. Do not overcorrect pronunciation."
        if level.upper() in {"A1", "A2"}
        else "For B1/B2: allow deeper correction, natural phrasing, terminology, "
        "and more precise feedback when useful. Still keep spokenFeedbackHe short."
    )

    return f"""
You are a Hebrew speaking tutor for Arabic-speaking students.
Return JSON only. Do not include markdown. Do not include explanation outside JSON.

Tutor rules:
- The main spoken feedback must be simple Hebrew.
- spokenFeedbackHe must be short, natural, and suitable for TTS.
- Maximum 1 to 2 short Hebrew sentences.
- Give the correct Hebrew phrase when there is a mistake.
- Do not over-explain grammar.
- Do not punish correct Hebrew just because it is above the student's level.
- If the student used correct but advanced Hebrew, accept it and optionally suggest a simpler phrase.
- Curriculum context guides the activity target, but it is not the only valid Hebrew.
- If the answer is correct Hebrew but off-topic, mark topic relevance low, not Hebrew correctness.
- Arabic is optional only in displayFeedback.ar or explanationArOptional.
- Limit corrections to at most {max_items_text}.
- If there is no real mistake, corrections should be an empty array.
- nextAction must be one of: continue, retry, give_hint, move_next.
- pronunciationWarning must be one of: none, unclear_audio, likely_mispronunciation.
- {level_policy}

Student context:
- level: {level}
- activityMode: {activity_mode}
- analysisDepth: {analysis_depth}
- recognizedTextHe: {recognized_text_he}
- referenceText: {reference_text or ""}
- activityTitle: {activity_title or ""}
- activityTopic: {activity_topic or ""}
- targetVocabulary: {json.dumps(target_vocabulary, ensure_ascii=False)}
- targetGrammar: {json.dumps(target_grammar, ensure_ascii=False)}
- expectedStudentAction: {expected_student_action or ""}
- expectedPatterns: {json.dumps(expected_patterns, ensure_ascii=False)}
- pronunciationWarningFromServer: {pronunciation_warning}

Return exactly this JSON shape:
{json.dumps(output_schema, ensure_ascii=False)}
""".strip()


def call_gemini_json(model: str, prompt: str, timeout_seconds: float) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiNotConfiguredError("Gemini is not configured")

    http_timeout_ms = max(1000, int(timeout_seconds * 1000))
    logger.info(
        "Preparing Gemini client",
        extra={
            "model": model,
            "has_key": bool(api_key),
            "key_length": len(api_key),
            "http_timeout_ms": http_timeout_ms,
            "prompt_chars": len(prompt),
        },
    )
    client = genai.Client(
        api_key=api_key,
        http_options=genai_types.HttpOptions(timeout=http_timeout_ms),
    )
    logger.info("Gemini client created", extra={"model": model})
    max_retries = int(os.getenv("GEMINI_MAX_RETRIES", str(DEFAULT_GEMINI_MAX_RETRIES)))
    base_delay = float(
        os.getenv(
            "GEMINI_REQUEST_DELAY_SECONDS",
            str(DEFAULT_GEMINI_REQUEST_DELAY_SECONDS),
        )
    )
    max_output_tokens = int(
        os.getenv(
            "GEMINI_MAX_OUTPUT_TOKENS",
            str(DEFAULT_GEMINI_MAX_OUTPUT_TOKENS),
        )
    )

    attempt = 0
    while True:
        try:
            logger.info(
                "Sending generate_content request to Gemini",
                extra={
                    "model": model,
                    "attempt": attempt + 1,
                    "prompt_chars": len(prompt),
                    "max_output_tokens": max_output_tokens,
                },
            )
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    max_output_tokens=max_output_tokens,
                    temperature=0.2,
                ),
            )
            logger.info(
                "Gemini generate_content completed successfully",
                extra={"model": model, "attempt": attempt + 1},
            )
            return (response.text or "").strip()
        except Exception as exc:
            if is_gemini_quota_exhausted(exc):
                logger.warning(
                    "Gemini quota exhausted",
                    extra={"model": model, "attempt": attempt + 1},
                )
                raise GeminiQuotaExhaustedError("Gemini quota exhausted") from exc
            logger.warning(
                "Gemini generate_content failed",
                extra={
                    "model": model,
                    "attempt": attempt + 1,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc)[:300],
                },
            )
            attempt += 1
            if attempt > max_retries or "429" not in str(exc):
                raise
            retry_delay = parse_retry_delay_seconds(str(exc)) or max(3.0, base_delay)
            if retry_delay > 0:
                logger.info(
                    "Waiting before Gemini retry",
                    extra={"model": model, "retry_delay_seconds": retry_delay},
                )
            time.sleep(retry_delay)


def is_gemini_quota_exhausted(exc: Exception) -> bool:
    message = str(exc)
    status_code = getattr(exc, "status_code", None)
    return (
        status_code == 429
        and "RESOURCE_EXHAUSTED" in message
    ) or (
        "429" in message
        and "RESOURCE_EXHAUSTED" in message
    )


def call_gemini_json_with_timeout(model: str, prompt: str, timeout_seconds: float) -> str:
    future = GEMINI_TIMEOUT_EXECUTOR.submit(
        call_gemini_json,
        model,
        prompt,
        timeout_seconds,
    )
    try:
        return future.result(timeout=timeout_seconds)
    except FuturesTimeoutError as exc:
        logger.warning(
            "Gemini timeout reached before provider returned",
            extra={"model": model, "timeout_seconds": timeout_seconds},
        )
        future.cancel()
        raise GeminiTimeoutError(
            f"Gemini call exceeded timeout of {timeout_seconds} seconds"
        ) from exc
    except GeminiQuotaExhaustedError:
        raise
    except Exception as exc:
        if is_gemini_quota_exhausted(exc):
            logger.warning(
                "Gemini quota exhausted",
                extra={"model": model},
            )
            raise GeminiQuotaExhaustedError("Gemini quota exhausted") from exc
        raise


def parse_retry_delay_seconds(message: str) -> float | None:
    match = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", message, flags=re.IGNORECASE)
    if not match:
        return None
    return float(match.group(1))


def parse_timeout_seconds(value: str | None, default: float) -> float:
    try:
        parsed = float(value) if value is not None else default
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def build_fallback_candidates(
    expected_patterns: list[str] | None,
    target_vocabulary: list[str] | None,
    reference_text: str | None,
) -> list[str]:
    candidates: list[str] = []
    for value in (expected_patterns or []) + (target_vocabulary or []):
        cleaned = str(value or "").strip()
        if cleaned and cleaned not in candidates:
            candidates.append(cleaned)
    reference = str(reference_text or "").strip()
    if reference and reference not in candidates:
        candidates.append(reference)
    return candidates


def build_safe_fallback_output(
    recognized_text_he: str,
    level: str,
    pronunciation_warning: str,
    expected_patterns: list[str] | None = None,
) -> dict[str, Any]:
    expected_pattern_fallback = build_expected_pattern_fallback(
        recognized_text_he=recognized_text_he,
        level=level,
        pronunciation_warning=pronunciation_warning,
        expected_patterns=expected_patterns or [],
    )
    if expected_pattern_fallback:
        return expected_pattern_fallback

    has_text = bool((recognized_text_he or "").strip())
    spoken_feedback = (
        "טוב מאוד. נמשיך."
        if has_text and pronunciation_warning == "none"
        else FALLBACK_HE_FEEDBACK
    )
    next_action = "continue" if has_text and pronunciation_warning == "none" else "retry"
    spoken_feedback = select_hebrew_fallback(
        recognized_text_he=recognized_text_he,
        pronunciation_warning=pronunciation_warning,
        is_relevant=has_text,
        is_within_activity_topic=has_text,
        is_hebrew_correct_enough=has_text and pronunciation_warning == "none",
    )

    return {
        "isRelevant": has_text,
        "isWithinActivityTopic": has_text,
        "isHebrewCorrectEnough": has_text and pronunciation_warning == "none",
        "level": level,
        "score": 80 if has_text and pronunciation_warning == "none" else 30,
        "recognizedTextHe": recognized_text_he or "",
        "advancedButCorrectLanguage": False,
        "pronunciationWarning": pronunciation_warning,
        "corrections": [],
        "nextAction": next_action,
        "spokenFeedbackHe": spoken_feedback,
        "displayFeedback": {
            "he": spoken_feedback,
            "ar": "",
        },
        "tts": {
            "language": "he",
            "voiceStyle": "simple_teacher",
            "shouldSpeak": True,
        },
        "fallbackRule": "generic_timeout_fallback",
    }


def normalize_evaluation_output(
    payload: dict[str, Any] | Any,
    recognized_text_he: str,
    level: str,
    pronunciation_warning: str,
    max_feedback_items: int | None,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = {}
    fallback_rule = str(payload.get("fallbackRule") or "").strip() or None

    normalized_level = str(payload.get("level") or level or "A1")
    correction_limit = max_feedback_items
    if correction_limit is None and normalized_level.upper() in {"A1", "A2"}:
        correction_limit = 1
    elif correction_limit is None:
        correction_limit = 2

    normalized_corrections = []
    for correction in payload.get("corrections") or []:
        if not isinstance(correction, dict):
            continue
        correction_type = correction.get("type")
        severity = correction.get("severity")
        if correction_type not in VALID_CORRECTION_TYPES:
            continue
        if severity not in VALID_SEVERITIES:
            severity = "low"

        normalized_corrections.append(
            {
                "type": correction_type,
                "severity": severity,
                "studentText": str(correction.get("studentText") or recognized_text_he or ""),
                "correctText": str(correction.get("correctText") or ""),
                "explanationHeSimple": str(correction.get("explanationHeSimple") or ""),
                "explanationArOptional": str(correction.get("explanationArOptional") or ""),
            }
        )

    normalized_corrections = normalized_corrections[:correction_limit]

    advanced_but_correct = bool(payload.get("advancedButCorrectLanguage", False))
    is_relevant = bool(payload.get("isRelevant", bool(recognized_text_he)))
    is_within_activity_topic = bool(
        payload.get("isWithinActivityTopic", bool(recognized_text_he))
    )
    is_hebrew_correct_enough = bool(
        payload.get(
            "isHebrewCorrectEnough",
            bool(recognized_text_he) and pronunciation_warning != "unclear_audio",
        )
    )
    needs_retry = has_retry_worthy_correction(
        normalized_corrections,
        normalized_level,
        advanced_but_correct,
    )
    if needs_retry:
        is_hebrew_correct_enough = False

    spoken_feedback = str(payload.get("spokenFeedbackHe") or "").strip()
    next_action = payload.get("nextAction")
    if next_action not in VALID_NEXT_ACTIONS:
        next_action = "continue" if recognized_text_he else "retry"
    if needs_retry:
        next_action = "retry"

    if (
        next_action == "retry"
        and spoken_feedback
        and POSITIVE_OPENING_RE.search(spoken_feedback)
    ):
        spoken_feedback = ""

    if not is_valid_spoken_feedback(spoken_feedback):
        spoken_feedback = select_hebrew_fallback(
            recognized_text_he=recognized_text_he,
            pronunciation_warning=pronunciation_warning,
            is_relevant=is_relevant,
            is_within_activity_topic=is_within_activity_topic,
            is_hebrew_correct_enough=is_hebrew_correct_enough,
        )

    if next_action == "retry" and recognized_text_he:
        correction = normalized_corrections[0] if normalized_corrections else None
        needs_retry_feedback_repair = (
            not is_valid_spoken_feedback(spoken_feedback)
            or POSITIVE_OPENING_RE.search(spoken_feedback)
        )
        if correction and correction.get("correctText") and needs_retry_feedback_repair:
            spoken_feedback = (
                f"כמעט נכון. אומרים: {correction['correctText']}, נסה שוב."
            )
        elif needs_retry_feedback_repair:
            spoken_feedback = RETRY_HE_FEEDBACK

    server_pronunciation_warning = (
        pronunciation_warning
        if pronunciation_warning in VALID_PRONUNCIATION_WARNINGS
        else "none"
    )

    display_feedback = payload.get("displayFeedback")
    if not isinstance(display_feedback, dict):
        display_feedback = {}
    display_he = str(display_feedback.get("he") or "").strip()
    if display_he and not is_valid_spoken_feedback(display_he):
        display_he = spoken_feedback
    if not display_he:
        display_he = spoken_feedback

    normalized = {
        "isRelevant": is_relevant,
        "isWithinActivityTopic": is_within_activity_topic,
        "isHebrewCorrectEnough": is_hebrew_correct_enough,
        "level": normalized_level,
        "score": clamp_score(payload.get("score")),
        "recognizedTextHe": str(payload.get("recognizedTextHe") or recognized_text_he or ""),
        "advancedButCorrectLanguage": advanced_but_correct,
        "pronunciationWarning": server_pronunciation_warning,
        "corrections": normalized_corrections,
        "nextAction": next_action,
        "spokenFeedbackHe": spoken_feedback,
        "displayFeedback": {
            "he": display_he,
            "ar": str(display_feedback.get("ar") or ""),
        },
        "tts": {
            "language": "he",
            "voiceStyle": "simple_teacher",
            "shouldSpeak": True,
        },
    }
    if fallback_rule:
        normalized["fallbackRule"] = fallback_rule

    if normalized["nextAction"] == "retry":
        normalized["score"] = min(normalized["score"], 60)
    if (
        normalized_level.upper() in {"A1", "A2"}
        and normalized_corrections
        and not advanced_but_correct
    ):
        normalized["score"] = min(normalized["score"], 55)

    return normalized


def clamp_score(value: Any) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        score = 0
    return max(0, min(100, score))
