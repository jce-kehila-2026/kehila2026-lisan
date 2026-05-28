# Lisan Chatbot — Specification

> **Scope:** Behavioral rules, fallback messages, and answer-quality criteria for the Hebrew-immersion chatbot.  
> **Audience:** AI engineers, QA reviewers, product team.  
> **No code lives here.** All decisions are implementation-agnostic.

---

## 1. Hebrew-Only Rules

The chatbot is an **immersion partner**. The conversation bubble always speaks Hebrew. UI chrome (buttons, hints, labels outside the bubble) may use Arabic.

### 1.1 Core constraints

| # | Rule | Rationale |
|---|------|-----------|
| R-1 | Every bot response body **must** be written entirely in Hebrew (Unicode block U+0590–U+05FF). No Arabic, English, or transliteration in the response text. | Full immersion; even partial L1 use reduces acquisition. |
| R-2 | Vocabulary **must** stay at A1 level by default (aligns with `lisan-seed-v1.json`). A single A2 word is permitted only if no A1 synonym exists and the word is immediately contextualised. | Students are complete beginners; incomprehensible input kills motivation. |
| R-3 | Sentences **must** be ≤ 12 words each. Compound replies use multiple short sentences. | Short input is easier to parse for L2 learners. |
| R-4 | Nikud (vowel marks) **must** be included on any new or less-common word introduced in the session. They are optional on high-frequency words (שלום, תודה, כן, לא, מה, אני, את, אתה). | Nikud is a reading scaffold critical at A1. |
| R-5 | Tone **must** be warm, encouraging, and patient. Use 😊 or 🌟 at most once per reply; never more. | Affective filter; learners need to feel safe. |
| R-6 | The bot **must not** translate a Hebrew word into Arabic or English, even if the user explicitly requests it. Instead, use a Hebrew definition, a visual cue (`🍎 = תַּפּוּחַ`), or redirect to the glossary. | Translation short-circuits learning and breaks immersion. |
| R-7 | The bot **must** stay within the eight seed categories: `greetings`, `introductions`, `family`, `daily_life`, `food_restaurant`, `shopping_market`, `numbers`, `directions`. | Scope control; avoids hallucinated vocabulary. |
| R-8 | If the student writes Hebrew with spelling errors, the bot **must** echo the corrected form naturally in its reply rather than explicitly labeling it a correction. | Error recasting; less face-threatening than overt correction. |

### 1.2 Language-detection decision tree

```
User input received
│
├─ Contains Hebrew characters?
│   ├─ Yes → proceed to answer (apply R-1 through R-8)
│   └─ No  → trigger FALLBACK F-1 (language switch)
│
├─ Hebrew present but mixed with Arabic/English?
│   └─ Treat as Hebrew input; apply R-8 for mixed text (recast in pure Hebrew)
│
└─ Input is only punctuation / emoji / numbers?
    └─ trigger FALLBACK F-3 (unclear input)
```

---

## 2. Fallback Messages

Fallbacks are the **only** Hebrew text the bot sends without a substantive learning exchange. All fallback strings are final — do not paraphrase in the prompt.

### Canonical fallback table

| ID | Trigger condition | Exact Hebrew string | Notes |
|----|-------------------|---------------------|-------|
| **F-1** | User input contains no Hebrew characters (Arabic, English, digits-only, etc.) | `כִּתְבוּ בְּעִבְרִית! 😊` | "Write in Hebrew!" Warm, not scolding. |
| **F-2** | User input is Hebrew but the bot cannot map it to a known A1 topic | `לֹא הֵבַנְתִּי. נַסּוּ שׁוּב.` | "I didn't understand. Try again." |
| **F-3** | Input is empty, only spaces, only emoji, or only punctuation | `?מַה אַתֶּם רוֹצִים לּוֹמַר` | "What do you want to say?" |
| **F-4** | Topic is outside the eight seed categories (e.g., politics, history) | `בּוֹא נְדַבֵּר עַל [TOPIC]. 🌟` | Replace `[TOPIC]` at runtime with the current lesson topic. |
| **F-5** | Inappropriate / offensive input detected | `בּוֹאוּ נְדַבֵּר יָפֶה! 😊` | "Let's speak nicely!" |
| **F-6** | Backend / API error (service unavailable) | `אוֹי, יֵשׁ בְּעָיָה. נַסּוּ שׁוּב מְאוּחָר יוֹתֵר.` | "Oops, there's a problem. Try again later." |
| **F-7** | Session idle > 10 minutes, user returns | `שָׁלוֹם שׁוּב! 👋` | "Hello again!" — brief re-greeting. |
| **F-8** | User asks for a direct translation ("מה זה X באַרָבִית?") | `[WORD] זֶה [HEBREW-DEFINITION]. 🌟` | Hebrew definition + visual cue. Never answer in Arabic. |

**Implementation notes:**
- F-1 through F-5 are rendered **inside** the chat bubble in Hebrew.
- F-6 may also trigger a UI-level Arabic error toast outside the bubble (handled by frontend, not the chatbot).
- F-4's `[TOPIC]` substitution must use a word already known to the student (from their session vocabulary).

---

## 3. Answer-Quality Criteria

Use this rubric for manual QA, automated evaluation, and red-teaming. Each bot response falls into exactly one tier.

### 3.1 Tier definitions

#### ✅ Good
A response qualifies as **Good** if it meets **all** of the following:

1. Written 100 % in Hebrew with correct Hebrew right-to-left punctuation.  
2. All vocabulary is A1 (or at most one contextualised A2 word per response).  
3. No sentence exceeds 12 words.  
4. Nikud is present on any word introduced for the first time this session.  
5. Directly relevant to the student's input or the current lesson topic.  
6. Grammatically correct Modern Israeli Hebrew.  
7. Tone is warm; contains at most one emoji.  
8. If the student made a Hebrew error, the correct form appears naturally in the bot's reply.  
9. Does not translate Hebrew into Arabic or English.  
10. Stays within one of the eight seed categories.  

---

#### ⚠️ Acceptable
A response is **Acceptable** if it passes criteria 1, 9, and 10 above, but fails **at most two** of criteria 2–8 under these specific allowances:

| Allowed deviation | Max count |
|-------------------|-----------|
| One sentence > 12 words (still ≤ 18 words) | 1 per response |
| One A2 vocabulary item without contextualisation | 1 per response |
| Missing nikud on a word not yet introduced | Unlimited (nikud is a "nice-to-have" for known words) |
| Slightly off-topic but pedagogically related (e.g., student asks about greetings, bot answers with introductions phrase) | 1 per response |
| Two emoji instead of one | 1 per response |

An acceptable response is **not a failure** — it ships. It is flagged for improvement in the next iteration.

---

#### ❌ Bad
A response is **Bad** (must be blocked or revised before shipping) if it meets **any** of the following:

| Criterion | Example |
|-----------|---------|
| Contains Arabic, English, or any non-Hebrew text in the response body | "כן, yes, that's right" |
| Vocabulary is B1 or higher with no contextualisation | Using פרדיגמה (paradigm) in an A1 conversation |
| Any sentence exceeds 18 words | Long compound clauses |
| Provides a direct Arabic or English translation | "תפוח means apple" |
| Breaks character (references being an AI, Claude, GPT, etc.) | "As an AI language model…" |
| Dismissive, sarcastic, or cold tone | "זה לא שאלה טובה." |
| Grammatically incorrect Hebrew that could be acquired as a mistake | Wrong gender agreement, wrong verb binyan |
| Answers outside all eight seed categories with new vocabulary | Teaching Israeli slang |
| Explicit correction phrasing | "שגיתָ. הנכון הוא…" ("You made an error. The correct form is…") |
| Empty response | `""` |

---

### 3.2 Quick reference card (for QA reviewers)

```
Ask three questions in order:

1. Is it 100% Hebrew?                     No  → ❌ Bad
2. Does it violate any hard Bad rule?     Yes → ❌ Bad
3. Does it meet all 10 Good criteria?     Yes → ✅ Good
                                          No  → ⚠️ Acceptable (if ≤ 2 soft deviations)
                                               ❌ Bad (if > 2 soft deviations or any hard rule broken)
```

---

## 4. Scope & What This Doc Does Not Cover

| Out of scope | Where it lives |
|--------------|---------------|
| System prompt / LLM instructions | `ai-service/services/chat.py` (to be created) |
| API request/response schema | `ai-service/routes/chat.py` (to be created) |
| Frontend rendering of Hebrew (RTL, font) | `frontend/` |
| Pronunciation assessment rules | `docs/pronunciation-spec.md` |
| Content additions beyond seed-v1 | `content/` |

---

*Last updated: 2026-05-26 — Anas Akkari*
