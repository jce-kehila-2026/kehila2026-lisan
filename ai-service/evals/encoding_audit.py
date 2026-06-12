"""
encoding_audit.py

Reusable mojibake / encoding scanner for the ai-service repo.

Why this exists
---------------
A live audit caught old eval/test fixtures that stored Arabic/Hebrew as
mojibake (UTF-8 bytes that were decoded as cp1252/latin-1 and re-saved). Such
text *looks* like garbage ("Ø¯Ø±Ø³" instead of "درس") but tests written against
the SAME garbage still pass — silently hiding real breakage in the Arabic /
Hebrew message paths.

This module finds three failure modes:
  1. NOT-UTF8       — the file is not valid UTF-8 at all.
  2. U+FFFD         — the file contains the replacement character (lossy decode).
  3. MOJIBAKE       — the file contains the tell-tale Latin-1-rendered-UTF-8
                      bigrams (e.g. "Ø¯", "Ã©", "â€") that signal Arabic /
                      Hebrew text was double-decoded.

It is consumed by both:
  - the CLI report  (python -m evals.encoding_audit)
  - the pytest guard (tests/test_encoding_audit.py)
"""
from __future__ import annotations

import os
import re

# Repo root = parent of the evals/ directory this file lives in.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCAN_EXTENSIONS = (".py", ".json", ".jsonl", ".yaml", ".yml", ".txt", ".md")

# Directories we never scan (binary / vendored / generated).
SKIP_DIR_PARTS = {"__pycache__", ".git", ".pytest_cache", "node_modules", "voice_stt_audio"}

# Files that legitimately contain mojibake / replacement examples *as data*
# (the scanner and its test describe the very patterns they hunt for).
SKIP_FILE_NAMES = {"encoding_audit.py", "test_encoding_audit.py"}

# Script-range detectors.
ARABIC_RE = re.compile(r"[؀-ۿݐ-ݿ]")
HEBREW_RE = re.compile(r"[֐-׿]")
REPLACEMENT_CHAR = "�"

# Mojibake bigrams: when UTF-8 (where Arabic lead bytes are 0xD8/0xD9 and
# Hebrew lead bytes are 0xD6/0xD7) is mis-decoded as Latin-1/cp1252, every
# real character turns into one of these capital-Latin + continuation pairs.
# We require a SEQUENCE of >=2 such bigrams to avoid flagging legitimate prose
# that merely mentions "Ø" once (e.g. a units symbol).
_MOJIBAKE_RUN = re.compile(
    r"(?:[Â-ÃÐ-Ùâ][-¿ -ÿ]){2,}"
)


def _should_skip(path: str) -> bool:
    parts = set(path.replace("\\", "/").split("/"))
    return bool(parts & SKIP_DIR_PARTS)


def iter_text_files(root: str = REPO_ROOT):
    """Yield absolute paths of all scannable text files under root."""
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skip dirs in-place so os.walk doesn't descend into them.
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_PARTS]
        if _should_skip(dirpath):
            continue
        for name in filenames:
            if name in SKIP_FILE_NAMES:
                continue
            if name.endswith(SCAN_EXTENSIONS):
                yield os.path.join(dirpath, name)


def scan_file(path: str) -> list[str]:
    """Return a list of problem descriptions for one file (empty = clean)."""
    problems: list[str] = []
    try:
        raw = open(path, "rb").read()
    except OSError as exc:
        return [f"unreadable: {exc}"]

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [f"NOT-UTF8: {exc}"]

    if REPLACEMENT_CHAR in text:
        problems.append(f"U+FFFD replacement char x{text.count(REPLACEMENT_CHAR)}")

    moji = _MOJIBAKE_RUN.findall(text)
    if moji:
        sample = moji[0][:20]
        problems.append(f"mojibake run x{len(moji)} (e.g. {sample!r})")

    return problems


def scan_repo(root: str = REPO_ROOT) -> dict[str, list[str]]:
    """Scan the whole repo. Returns {path: [problems]} for offending files."""
    offenders: dict[str, list[str]] = {}
    for path in iter_text_files(root):
        problems = scan_file(path)
        if problems:
            offenders[path] = problems
    return offenders


def inventory(root: str = REPO_ROOT) -> dict[str, dict[str, bool]]:
    """Return {path: {ar: bool, he: bool}} for every file holding AR/HE text."""
    found: dict[str, dict[str, bool]] = {}
    for path in iter_text_files(root):
        try:
            text = open(path, "rb").read().decode("utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        has_ar = bool(ARABIC_RE.search(text))
        has_he = bool(HEBREW_RE.search(text))
        if has_ar or has_he:
            found[path] = {"ar": has_ar, "he": has_he}
    return found


def _rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace("\\", "/")


def main() -> int:
    offenders = scan_repo()
    inv = inventory()
    print(f"AR/HE text files inventoried : {len(inv)}")
    print(f"Encoding problems found      : {len(offenders)}")
    print("-" * 60)
    if offenders:
        for path, problems in sorted(offenders.items()):
            print(f"  [FAIL] {_rel(path)}")
            for p in problems:
                print(f"         - {p}")
        return 1
    print("  [OK] No mojibake / encoding problems detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
