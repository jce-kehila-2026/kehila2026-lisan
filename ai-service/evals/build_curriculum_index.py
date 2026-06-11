from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from services.curriculum_index import build_curriculum_index, search_curriculum


def main() -> int:
    path = build_curriculum_index()
    probe_hits = search_curriculum("איפה הדואר", level="A1", limit=1, index_path=path)
    print(f"built={path}")
    print(f"probe_hits={len(probe_hits)}")
    return 0 if path.exists() else 1


if __name__ == "__main__":
    raise SystemExit(main())
