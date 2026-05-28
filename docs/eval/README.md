# Lisan Chatbot — Eval Dataset

> Companion to [docs/chatbot-spec.md](../chatbot-spec.md).  
> No code lives here — prompts and expected behaviors only.

---

## File

| File | Description |
|------|-------------|
| `chatbot-eval-v1.json` | 139 eval entries |

---

## Distribution

| Type | Count | IDs | What it tests |
|------|-------|-----|---------------|
| `valid_a1` | 55 | E_001–E_055 | Normal A1 Hebrew input across all 8 seed categories |
| `valid_a1_misspelled` | 5 | E_056–E_060 | Hebrew with typical Arabic-speaker spelling errors; tests R-8 recast |
| `out_of_scope` | 20 | E_061–E_080 | Hebrew inside the right language but outside the 8 categories; must trigger F-4 |
| `translation_request` | 5 | E_081–E_085 | Hebrew asking for Arabic/English translations; must trigger F-8 |
| `invalid_arabic` | 15 | E_086–E_100 | Pure Arabic input; must trigger F-1 |
| `invalid_english` | 8 | E_101–E_108 | Pure English input; must trigger F-1 |
| `invalid_mixed_ar` | 8 | E_109–E_116 | Hebrew + Arabic mixed; contains Hebrew so not F-1 — bot recasts in pure Hebrew |
| `invalid_mixed_en` | 7 | E_117–E_123 | Hebrew + English mixed; same recast treatment (E_123 also hits F-8) |
| `edge_long` | 8 | E_124–E_131 | Valid Hebrew but very long (30–50 words); tests R-3 compliance in response |
| `edge_strange` | 8 | E_132–E_139 | Emoji-only, punctuation-only, gibberish Hebrew, single letters |

**Total: 139**

---

## Entry Schema

```json
{
  "id": "E_001",
  "prompt": "...",
  "prompt_type": "valid_a1 | valid_a1_misspelled | out_of_scope | translation_request | invalid_arabic | invalid_english | invalid_mixed_ar | invalid_mixed_en | edge_long | edge_strange",
  "input_language": "hebrew | arabic | english | hebrew_arabic | hebrew_english | none",
  "category": "greetings | introductions | family | daily_life | food_restaurant | shopping_market | numbers | directions | out_of_scope | null",
  "expected_behavior": "respond_in_hebrew | respond_with_recast | trigger_F1 | trigger_F2 | trigger_F3 | trigger_F4 | trigger_F8",
  "expected_fallback": "F-1 | F-2 | F-3 | F-4 | F-8 | null",
  "expected_response_tier": "good | acceptable | fallback",
  "notes": "..."
}
```

---

## How to Use

### Manual QA pass

1. Feed `prompt` into the chatbot.
2. Check `expected_behavior`:
   - If `trigger_FX` → verify the bot emits exactly the fallback string from `chatbot-spec.md §2`.
   - If `respond_in_hebrew` → score the response against the **Good / Acceptable / Bad** rubric in `chatbot-spec.md §3`.
   - If `respond_with_recast` → additionally check that the corrected Hebrew form appears naturally in the response (R-8).
3. Record result as `pass` / `fail` / `partial`.

### Automated eval

Suggested fields to assert programmatically:

| Check | How |
|-------|-----|
| Response is 100% Hebrew | Regex: no codepoints outside U+0590–U+05FF, spaces, punctuation |
| Fallback string is exact | String equality against spec §2 table |
| Sentence length ≤ 12 words | Split on spaces; count per sentence |
| Nikud present on new words | Flag words without nikud for human review |

### Coverage by category

Run this query on a results file to check that all 8 categories have passing entries before a release:

```python
from collections import Counter
import json

with open("chatbot-eval-v1.json") as f:
    entries = json.load(f)["entries"]

valid = [e for e in entries if e["prompt_type"] == "valid_a1"]
print(Counter(e["category"] for e in valid))
```

---

## Versioning

| Version | Date | Change |
|---------|------|--------|
| v1 | 2026-05-26 | Initial 139-entry dataset |

Next planned: v2 — add dialogue-turn sequences (multi-turn eval), add A2 boundary cases.
