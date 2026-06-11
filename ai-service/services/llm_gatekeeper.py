from __future__ import annotations

from dataclasses import dataclass

from services.answer_templates import (
    TemplateAnswer,
    render_ask_me,
    render_correction,
    render_example,
    render_formal_draft,
    render_known_phrase,
    render_translation,
    render_word_meaning,
)
from services.chat_intents import detect_intent
from services.language_profile import LanguageProfile


@dataclass(frozen=True)
class GatekeeperDecision:
    template: TemplateAnswer
    needs_llm: bool = False


def decide_local_answer(
    message: str,
    level: str,
    language_profile: LanguageProfile | None = None,
) -> GatekeeperDecision | None:
    known_phrase = render_known_phrase(message, level)
    if known_phrase is not None:
        return GatekeeperDecision(template=known_phrase)

    intent = detect_intent(message, language_profile)
    if intent is None:
        correction = render_correction(message)
        return GatekeeperDecision(template=correction) if correction else None

    if intent.name == "WORD_MEANING":
        answer = render_word_meaning(intent.target_word)
    elif intent.name == "TRANSLATE_REQUEST":
        answer = render_translation(message, intent.target_word)
    elif intent.name == "CORRECTION_REQUEST":
        answer = render_correction(message)
    elif intent.name == "EXAMPLE_REQUEST":
        answer = render_example(intent.target_word)
    elif intent.name == "ASK_ME":
        answer = render_ask_me(level)
    elif intent.name == "FORMAL_DRAFT":
        answer = render_formal_draft(message, level)
    else:
        answer = None

    return GatekeeperDecision(template=answer) if answer is not None else None
