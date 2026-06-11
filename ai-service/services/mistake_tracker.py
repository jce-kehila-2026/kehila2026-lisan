from __future__ import annotations

from services.conversation_memory import CONVERSATION_MEMORY


def register_grammar_errors(session_id: str | None, errors) -> bool:
    if not session_id or not errors:
        return False
    repeated = False
    for error in errors:
        fact_key = f"grammar_err_{error.code}"
        raw = CONVERSATION_MEMORY.get_fact(session_id, fact_key)
        count = int(raw) + 1 if raw and raw.isdigit() else 1
        CONVERSATION_MEMORY.set_fact(session_id, fact_key, str(count))
        if count >= 2:
            repeated = True
    return repeated
