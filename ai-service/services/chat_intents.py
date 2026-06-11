from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from services.chat_guardrails import ARABIC_RE, hebrew_words, normalize_hebrew_token
from services.language_profile import LanguageProfile


BASE_DIR = Path(__file__).resolve().parents[1]
INTENT_EXAMPLES_PATH = BASE_DIR / "data" / "chatbot_quality" / "intent_examples.json"
MODEL_DIR = BASE_DIR / "data" / "setfit_intent_model"

HEBREW_RE = re.compile(r"[\u0590-\u05ff]+")
_WORD_MEANING_RE = re.compile(
    r"(שו\s+יעני|شو\s+يعني|וש\s+يعني|ما\s+معنى|ماذا\s+تعني|شو\s+معنى|"
    r"מה\s+זה\s+אומר|מה\s+הפירוש\s+של|מה\s+המשמעות\s+של|מה\s+פירוש|"
    r"what\s+is|what\s+does)",
    re.IGNORECASE,
)
_TRANSLATE_RE = re.compile(
    r"(תרגם|תתרגם|ترجم|ترجمة|بالعربي|בערבית|באנגלית|بالانجليزي|بالإنجليزي|"
    r"איך\s+אומרים|كيف\s+بنقول)",
    re.IGNORECASE,
)
_CORRECTION_RE = re.compile(r"(תקן|תתקן|صحح|صلح|تصحيح)")
_EXAMPLE_RE = re.compile(r"(דוגמה|مثال|اعطني\s+مثال|תן\s+דוגמה)")
_QUESTION_RE = re.compile(r"(שאל\s+אותי|اسألني|سؤال|תשאל)")
_FORMAL_RE = re.compile(r"(רשמי|פורמלי|صياغة\s+رسمية|رسمي)")

_SETFIT_MODEL = None
_SETFIT_MODEL_LOADED = False


@dataclass(frozen=True)
class Intent:
    name: str
    target_word: str | None = None


def detect_intent(message: str, language_profile: LanguageProfile | None = None) -> Intent | None:
    text = (message or "").strip()
    if not text:
        return None

    patterns = _example_patterns()
    if _matches_any(text, patterns.get("WORD_MEANING", [])) or _WORD_MEANING_RE.search(text):
        return Intent(name="WORD_MEANING", target_word=_extract_target_hebrew_word(text))
    if _matches_any(text, patterns.get("TRANSLATE_REQUEST", [])) or _TRANSLATE_RE.search(text):
        return Intent(name="TRANSLATE_REQUEST", target_word=_extract_target_hebrew_word(text))
    if _matches_any(text, patterns.get("CORRECTION_REQUEST", [])) or _CORRECTION_RE.search(text):
        return Intent(name="CORRECTION_REQUEST")
    if _FORMAL_RE.search(text):
        return Intent(name="FORMAL_DRAFT")
    if _matches_any(text, patterns.get("EXAMPLE_REQUEST", [])) or _EXAMPLE_RE.search(text):
        return Intent(name="EXAMPLE_REQUEST", target_word=_extract_target_hebrew_word(text))
    if _matches_any(text, patterns.get("ASK_ME", [])) or _QUESTION_RE.search(text):
        return Intent(name="ASK_ME")

    setfit_intent = classify_intent_setfit(text)
    if setfit_intent:
        if setfit_intent in {"WORD_MEANING", "TRANSLATE_REQUEST", "EXAMPLE_REQUEST"}:
            return Intent(name=setfit_intent, target_word=_extract_target_hebrew_word(text))
        return Intent(name=setfit_intent)

    if language_profile and language_profile.is_mixed and language_profile.has_hebrew:
        hebrew_part = extract_hebrew_part(text)
        if hebrew_part and hebrew_part != text:
            return detect_intent(hebrew_part, None)
    return None


def extract_hebrew_part(message: str) -> str:
    without_arabic = ARABIC_RE.sub(" ", message or "")
    without_arabic = without_arabic.replace("؟", " ").replace("،", " ")
    return re.sub(r"\s+", " ", without_arabic).strip()


def has_arabic(message: str) -> bool:
    return bool(ARABIC_RE.search(message or ""))


def classify_intent_setfit(message: str) -> str | None:
    model = get_setfit_model()
    if model is None:
        return None
    label_file = MODEL_DIR / "labels.json"
    if not label_file.exists():
        return None
    try:
        labels_data = json.loads(label_file.read_text(encoding="utf-8"))
        id_to_label = labels_data["id_to_label"]
        preds = model.predict([message])
        pred_idx = int(preds[0])
    except Exception:
        return None
    if 0 <= pred_idx < len(id_to_label):
        return str(id_to_label[pred_idx])
    return None


def get_setfit_model():
    global _SETFIT_MODEL, _SETFIT_MODEL_LOADED
    if not _env_enabled("ENABLE_SETFIT_INTENT"):
        return None
    if _SETFIT_MODEL_LOADED:
        return _SETFIT_MODEL
    _SETFIT_MODEL_LOADED = True
    if not (MODEL_DIR / "config.json").exists():
        return None
    try:
        from setfit import SetFitModel  # type: ignore
        _SETFIT_MODEL = SetFitModel.from_pretrained(str(MODEL_DIR))
    except Exception:
        _SETFIT_MODEL = None
    return _SETFIT_MODEL


@lru_cache(maxsize=1)
def _example_patterns() -> dict[str, list[str]]:
    if not INTENT_EXAMPLES_PATH.exists():
        return {}
    try:
        data = json.loads(INTENT_EXAMPLES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    patterns: dict[str, list[str]] = {}
    for intent, examples in data.items():
        if isinstance(examples, list):
            patterns[str(intent)] = [str(example).strip() for example in examples if str(example).strip()]
    return patterns


def _matches_any(text: str, examples: list[str]) -> bool:
    normalized = _normalize_for_match(text)
    return any(_normalize_for_match(example) in normalized for example in examples)


def _normalize_for_match(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _extract_target_hebrew_word(text: str) -> str | None:
    scaffolding = {
        "מה", "זה", "אומר", "אומרת", "הפירוש", "המשמעות", "פירוש",
        "של", "המילה", "מילה", "בעברית", "בערבית", "לערבית", "באנגלית",
        "לאנגלית", "תרגם", "תתרגם", "תתקן", "תקן", "דוגמה", "אומרים", "איך",
    }
    candidates = [
        normalize_hebrew_token(token)
        for token in hebrew_words(text)
        if normalize_hebrew_token(token)
        and normalize_hebrew_token(token) not in scaffolding
    ]
    return candidates[-1] if candidates else None


def _env_enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}
