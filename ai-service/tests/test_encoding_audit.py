"""
test_encoding_audit.py

Regression guard against mojibake creeping back into the repo.

A live audit found old fixtures that stored Arabic/Hebrew as double-decoded
garbage (UTF-8 read as cp1252 then re-saved). Tests written against that same
garbage still passed, silently masking breakage in the AR/HE message paths.

This test fails the build the moment ANY scannable text file contains:
  - invalid UTF-8,
  - a U+FFFD replacement character, or
  - a run of Latin-1-rendered-UTF-8 mojibake bigrams (e.g. "Ø¯Ø±Ø³").

If this test fails, the offending file must be re-saved as clean UTF-8 — do
NOT "fix" it by matching the test to the garbage.
"""
from __future__ import annotations

import os
import sys

# Make the repo root importable so `evals.encoding_audit` resolves when pytest
# is invoked from anywhere.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from evals.encoding_audit import scan_repo, inventory  # noqa: E402


def test_repo_has_no_mojibake():
    offenders = scan_repo()
    if offenders:
        lines = ["Encoding problems detected (re-save as UTF-8):"]
        for path, problems in sorted(offenders.items()):
            rel = os.path.relpath(path, _REPO_ROOT).replace("\\", "/")
            lines.append(f"  {rel}: {'; '.join(problems)}")
        raise AssertionError("\n".join(lines))


def test_real_arabic_hebrew_files_are_present():
    """Sanity check: the inventory must actually find AR/HE content, otherwise
    a future glob/encoding regression that nukes all non-ASCII text would make
    test_repo_has_no_mojibake pass vacuously."""
    inv = inventory()
    assert len(inv) > 50, (
        f"Expected the repo to hold many AR/HE text files, found {len(inv)}. "
        "Has non-ASCII content been lost?"
    )
