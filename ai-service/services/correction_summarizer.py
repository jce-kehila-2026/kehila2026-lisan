"""
correction_summarizer.py — condense the reviewer rules of one level into a
short guidance paragraph for the tutor prompt.

Called only by the backend (POST /api/ai/internal/summarize-corrections) after
an approve / deactivate / reactivate / manual regenerate. The backend owns
Firestore and validates the result (every active rule id must be covered, no
unknown ids, length cap) before it goes live; this module only asks the LLM
and parses its JSON.

Language: the guidance is written in ENGLISH, because the tutor system prompts
(prompts/chat-system-prompt-*.txt) and the raw rule block are English, and the
models follow English meta-instructions most reliably. Hebrew example phrases
from the rules are kept verbatim.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from services.chat_provider import ProviderCallOptions, call_provider, get_configured_provider

SUMMARY_MAX_CHARS = 900
MAX_RULES = 60
MAX_RULE_CHARS = 300
SUMMARY_TEMPERATURE = 0.1
SUMMARY_MAX_OUTPUT_TOKENS = 1200


class SummaryParseError(ValueError):
    """The LLM answer was not the JSON shape we asked for."""


@dataclass
class SummaryResult:
    summary: str
    sentences: list[dict] = field(default_factory=list)
    provider: str = ""
    model: str = ""


SYSTEM_PROMPT = f"""You condense rules written by human reviewers of a Hebrew tutor chatbot.
The tutor teaches Hebrew to Arabic-speaking WOMEN; the learner is always addressed in the feminine form.

You receive a JSON list of rules, each with an "id" and "ruleText", for CEFR level {{level}}.
Write concise, imperative guidance for the tutor, in English (keep any Hebrew example words or sentences exactly as written).

Strict requirements:
- Merge duplicate or overlapping rules into one sentence.
- NEVER add a rule, fact or example that is not in the input.
- NEVER drop a rule: every input id must appear in the "ruleIds" of at least one sentence.
- Use only ids from the input. Do not invent ids.
- Keep feminine-learner conventions (address her as את, feminine verbs and adjectives).
- The whole "summary" must be at most {SUMMARY_MAX_CHARS} characters.
- "summary" is exactly the sentences joined with single spaces.

Answer with JSON only, no markdown, in this exact shape:
{{{{"summary": "...", "sentences": [{{{{"text": "...", "ruleIds": ["id1", "id2"]}}}}]}}}}
"""


def _clean(value: object, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = " ".join(value.split())
    return text[:limit]


def build_messages(level: str, rules: list[dict]) -> tuple[str, str]:
    system = SYSTEM_PROMPT.format(level=level)
    payload = [
        {"id": _clean(rule.get("id"), 128), "ruleText": _clean(rule.get("ruleText"), MAX_RULE_CHARS)}
        for rule in rules[:MAX_RULES]
    ]
    question = "Rules:\n" + json.dumps(payload, ensure_ascii=False)
    return system, question


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_summary_json(raw: str) -> SummaryResult:
    """Parse the model answer. Raises SummaryParseError on a bad shape."""
    text = _FENCE_RE.sub("", (raw or "").strip())
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise SummaryParseError("no JSON object in model answer")
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise SummaryParseError(f"invalid JSON: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise SummaryParseError("JSON is not an object")

    raw_sentences = data.get("sentences")
    if not isinstance(raw_sentences, list) or not raw_sentences:
        raise SummaryParseError("sentences missing")
    sentences: list[dict] = []
    for item in raw_sentences:
        if not isinstance(item, dict):
            raise SummaryParseError("sentence is not an object")
        sentence_text = " ".join(str(item.get("text") or "").split())
        rule_ids = item.get("ruleIds")
        if not sentence_text or not isinstance(rule_ids, list):
            raise SummaryParseError("sentence needs text and ruleIds")
        sentences.append({"text": sentence_text, "ruleIds": [str(rid) for rid in rule_ids]})

    summary = data.get("summary")
    summary = " ".join(summary.split()) if isinstance(summary, str) else ""
    if not summary:
        summary = " ".join(s["text"] for s in sentences)
    return SummaryResult(summary=summary, sentences=sentences)


def summarize_corrections(level: str, rules: list[dict]) -> SummaryResult:
    """One LLM call through the normal provider fallback chain."""
    system, question = build_messages(level, rules)
    provider, model = get_configured_provider()
    result = call_provider(
        provider,
        model,
        system,
        question,
        ProviderCallOptions(
            max_output_tokens=SUMMARY_MAX_OUTPUT_TOKENS,
            temperature=SUMMARY_TEMPERATURE,
        ),
    )
    parsed = parse_summary_json(result.answer)
    parsed.provider = result.provider or provider
    parsed.model = result.model or model
    return parsed
