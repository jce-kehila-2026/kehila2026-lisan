from __future__ import annotations

from functools import lru_cache
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
POLICY_PATH = BASE_DIR / "data" / "chatbot_quality" / "response_policy.yaml"


DEFAULT_POLICY: dict[str, object] = {
    "allow_arabic_support": True,
    "max_context_chunks": 2,
    "min_retrieval_score": 0.15,
    "prompt_token_budget": 1200,
    "template_levels": ["A1", "A2", "B1", "B2"],
    "b2_formal_drafting": True,
    "cache_intent_templates": True,
    "offline_embeddings_enabled": False,
}


@lru_cache(maxsize=1)
def load_response_policy() -> dict[str, object]:
    policy = dict(DEFAULT_POLICY)
    if not POLICY_PATH.exists():
        return policy
    for raw_line in POLICY_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        key = key.strip()
        value = _parse_value(raw_value.strip())
        if key:
            policy[key] = value
    return policy


def get_bool(name: str) -> bool:
    return bool(load_response_policy().get(name, DEFAULT_POLICY.get(name)))


def get_int(name: str) -> int:
    value = load_response_policy().get(name, DEFAULT_POLICY.get(name, 0))
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return int(DEFAULT_POLICY.get(name, 0) or 0)


def get_float(name: str) -> float:
    value = load_response_policy().get(name, DEFAULT_POLICY.get(name, 0.0))
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return float(DEFAULT_POLICY.get(name, 0.0) or 0.0)


def _parse_value(raw: str) -> object:
    lowered = raw.lower()
    if lowered in {"true", "yes", "on", "1"}:
        return True
    if lowered in {"false", "no", "off", "0"}:
        return False
    if "," in raw:
        return [part.strip() for part in raw.split(",") if part.strip()]
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        return raw
