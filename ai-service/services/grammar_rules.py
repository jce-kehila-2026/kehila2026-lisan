"""
grammar_rules.py

Detects common A1-level Hebrew grammar errors in student transcriptions
and returns a concise correction hint to inject into the LLM system prompt.

Errors detected (A1 scope):
  GENDER_VERB   — masculine verb used where feminine expected (or vice versa)
                  e.g. "אני (f) גר" instead of "אני (f) גרה"
  GENDER_ADJ    — masculine adjective with feminine noun (or vice versa)
                  e.g. "ילדה טוב" instead of "ילדה טובה"
  PLURAL_VERB   — singular verb with plural subject
                  e.g. "הם גר" instead of "הם גרים"
  PRONOUN_VERB  — pronoun/verb agreement mismatch
                  e.g. "אתה גרה" (masc pronoun + fem verb)

Only the FIRST detected error is returned — one correction per turn is
enough for an A1 learner.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Token sets
# ---------------------------------------------------------------------------

_MASC_PRONOUNS = frozenset(["הוא", "אתה", "אני"])   # context-dependent for אני
_FEM_PRONOUNS  = frozenset(["היא", "את"])
_PLUR_PRONOUNS = frozenset(["הם", "הן", "אנחנו", "אתם", "אתן"])

# Present-tense verb pairs  {masculine_singular: feminine_singular}
_MASC_TO_FEM_VERB: dict[str, str] = {
    "גר":    "גרה",
    "עובד":  "עובדת",
    "רוצה":  "רוצה",   # same form — intentionally identical
    "אוכל":  "אוכלת",
    "שותה":  "שותה",   # same form
    "לומד":  "לומדת",
    "מדבר":  "מדברת",
    "הולך":  "הולכת",
    "יושב":  "יושבת",
    "עומד":  "עומדת",
    "בא":    "באה",
    "יודע":  "יודעת",
    "רואה":  "רואה",   # same form
    "שומע":  "שומעת",
    "כותב":  "כותבת",
    "קורא":  "קוראת",
}
_FEM_TO_MASC_VERB = {v: k for k, v in _MASC_TO_FEM_VERB.items() if v != k}

# Adjective pairs  {masc: fem}
_MASC_TO_FEM_ADJ: dict[str, str] = {
    "טוב":   "טובה",
    "גדול":  "גדולה",
    "קטן":   "קטנה",
    "יפה":   "יפה",    # same form
    "חדש":   "חדשה",
    "ישן":   "ישנה",
    "חכם":   "חכמה",
    "עייף":  "עייפה",
    "שמח":   "שמחה",
    "עצוב":  "עצובה",
}
_FEM_TO_MASC_ADJ = {v: k for k, v in _MASC_TO_FEM_ADJ.items() if v != k}

# Feminine nouns that commonly trigger adjective agreement errors
_FEM_NOUNS = frozenset([
    "ילדה", "אישה", "בת", "אמא", "מורה",
    "עיר", "מדינה", "ארץ", "שנה", "שעה",
])
_MASC_NOUNS = frozenset([
    "ילד", "איש", "בן", "אבא",
    "בית", "יום", "שבוע", "חודש",
])

# Plural verb suffixes used without a plural subject
_PLURAL_VERB_SUFFIXES = ("ים", "ות", "ים")   # masc-plur, fem-plur

# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class GrammarError:
    code: str          # e.g. "GENDER_VERB"
    found: str         # the erroneous token(s)
    expected: str      # the correct form
    hint: str          # one-line correction injected into the system prompt


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_grammar_errors(text: str) -> list[GrammarError]:
    """
    Scan Hebrew text for A1-level grammar errors.

    Returns a list of GrammarError objects (may be empty).
    Only the most actionable errors are returned; false positives
    are suppressed rather than reported.
    """
    if not text or not text.strip():
        return []

    tokens = _tokenize(text)
    errors: list[GrammarError] = []

    errors.extend(_check_pronoun_verb_agreement(tokens))
    errors.extend(_check_noun_adjective_agreement(tokens))

    return errors[:1]   # return at most one error per message


def build_grammar_hint(errors: list[GrammarError]) -> str:
    """
    Format detected errors as a one-line hidden instruction for the LLM.
    Returns an empty string when there are no errors.
    """
    if not errors:
        return ""
    hints = "; ".join(e.hint for e in errors)
    return (
        f"[Grammar note — do not mention this to the student, "
        f"but gently model the correct form in your reply: {hints}]"
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    """Split text into Hebrew word tokens, strip punctuation."""
    return [
        re.sub(r"[^א-ת]", "", w)
        for w in text.split()
        if re.search(r"[א-ת]", w)
    ]


def _check_pronoun_verb_agreement(tokens: list[str]) -> list[GrammarError]:
    """Detect pronoun + verb gender/number mismatch."""
    errors: list[GrammarError] = []

    for i, token in enumerate(tokens):
        if i + 1 >= len(tokens):
            break
        verb = tokens[i + 1]

        # Masculine pronoun + feminine verb
        if token in _MASC_PRONOUNS and verb in _FEM_TO_MASC_VERB:
            correct = _FEM_TO_MASC_VERB[verb]
            errors.append(GrammarError(
                code="GENDER_VERB",
                found=f"{token} {verb}",
                expected=f"{token} {correct}",
                hint=f'say "{correct}" not "{verb}" after "{token}"',
            ))

        # Feminine pronoun + masculine verb
        elif token in _FEM_PRONOUNS and verb in _MASC_TO_FEM_VERB:
            correct = _MASC_TO_FEM_VERB[verb]
            if correct != verb:   # skip identical forms
                errors.append(GrammarError(
                    code="GENDER_VERB",
                    found=f"{token} {verb}",
                    expected=f"{token} {correct}",
                    hint=f'say "{correct}" not "{verb}" after "{token}"',
                ))

        # Plural pronoun + singular verb
        elif token in _PLUR_PRONOUNS and verb in _MASC_TO_FEM_VERB:
            errors.append(GrammarError(
                code="PLURAL_VERB",
                found=f"{token} {verb}",
                expected=f"{token} {verb}ים",
                hint=(
                    f'use the plural form of "{verb}" '
                    f'after the plural pronoun "{token}"'
                ),
            ))

    return errors[:1]


def _check_noun_adjective_agreement(tokens: list[str]) -> list[GrammarError]:
    """Detect noun + adjective gender mismatch."""
    errors: list[GrammarError] = []

    for i, token in enumerate(tokens):
        if i + 1 >= len(tokens):
            break
        adj = tokens[i + 1]

        # Feminine noun + masculine adjective
        if token in _FEM_NOUNS and adj in _MASC_TO_FEM_ADJ:
            correct = _MASC_TO_FEM_ADJ[adj]
            if correct != adj:
                errors.append(GrammarError(
                    code="GENDER_ADJ",
                    found=f"{token} {adj}",
                    expected=f"{token} {correct}",
                    hint=(
                        f'the noun "{token}" is feminine — '
                        f'use "{correct}" not "{adj}"'
                    ),
                ))

        # Masculine noun + feminine adjective
        elif token in _MASC_NOUNS and adj in _FEM_TO_MASC_ADJ:
            correct = _FEM_TO_MASC_ADJ[adj]
            errors.append(GrammarError(
                code="GENDER_ADJ",
                found=f"{token} {adj}",
                expected=f"{token} {correct}",
                hint=(
                    f'the noun "{token}" is masculine — '
                    f'use "{correct}" not "{adj}"'
                ),
            ))

    return errors[:1]
