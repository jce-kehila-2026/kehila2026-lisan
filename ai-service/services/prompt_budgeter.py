from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PromptBudget:
    estimated_tokens: int
    budget_tokens: int
    trimmed: bool


def estimate_tokens(text: str) -> int:
    # Good enough for Hebrew/Arabic/English guard budgeting without tiktoken.
    # Hebrew words tend to be compact, so combine word and char estimates.
    stripped = text or ""
    word_estimate = max(1, len(stripped.split()) * 2) if stripped.strip() else 0
    char_estimate = max(1, len(stripped) // 4) if stripped.strip() else 0
    return max(word_estimate, char_estimate)


def fit_text_to_budget(text: str, budget_tokens: int) -> tuple[str, PromptBudget]:
    if budget_tokens <= 0:
        return "", PromptBudget(0, budget_tokens, bool(text))
    estimated = estimate_tokens(text)
    if estimated <= budget_tokens:
        return text, PromptBudget(estimated, budget_tokens, False)

    lines = [line for line in (text or "").splitlines() if line.strip()]
    kept: list[str] = []
    used = 0
    for line in lines:
        line_tokens = estimate_tokens(line)
        if kept and used + line_tokens > budget_tokens:
            break
        if not kept and line_tokens > budget_tokens:
            max_chars = max(40, budget_tokens * 4)
            kept.append(line[:max_chars].rstrip())
            used = estimate_tokens(kept[-1])
            break
        kept.append(line)
        used += line_tokens
    trimmed_text = "\n".join(kept).strip()
    return trimmed_text, PromptBudget(estimate_tokens(trimmed_text), budget_tokens, True)


def fit_prompt_parts(
    *,
    base_prompt: str,
    vocabulary: list[str],
    context: str,
    grammar_hint: str,
    budget_tokens: int,
) -> tuple[list[str], str, PromptBudget]:
    fixed = "\n".join([base_prompt, grammar_hint]).strip()
    fixed_tokens = estimate_tokens(fixed)
    vocab_budget = max(80, int(budget_tokens * 0.35))
    context_budget = max(0, budget_tokens - fixed_tokens - vocab_budget)

    kept_vocab: list[str] = []
    used_vocab = 0
    for token in vocabulary:
        token_cost = estimate_tokens(token)
        if kept_vocab and used_vocab + token_cost > vocab_budget:
            break
        kept_vocab.append(token)
        used_vocab += token_cost

    trimmed_context, context_meta = fit_text_to_budget(context, context_budget)
    total = fixed_tokens + estimate_tokens(", ".join(kept_vocab)) + context_meta.estimated_tokens
    return kept_vocab, trimmed_context, PromptBudget(total, budget_tokens, context_meta.trimmed or len(kept_vocab) < len(vocabulary))
