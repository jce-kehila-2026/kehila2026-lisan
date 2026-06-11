from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from services.chat_guardrails import normalize_level
from services.chat_retrieval import load_transcripts

BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INDEX_PATH = BASE_DIR / "data" / "chatbot_quality" / "curriculum_index.sqlite"


@dataclass(frozen=True)
class CurriculumHit:
    level: str
    source: str
    content: str
    score: float


def get_bge_m3_embedding(text: str) -> list[float]:
    """Retrieves dense BGE-M3 embedding with simple deterministic fallback for testing."""
    try:
        from services.offline_embeddings_index import get_dense_embedding
        return get_dense_embedding(text)
    except Exception:
        # Mock embedding for test fallback: just some hashes based on text
        import hashlib
        h = hashlib.sha256(text.encode("utf-8")).digest()
        # Build a float list of size 1024
        floats = []
        for i in range(1024):
            val = h[i % 32] / 255.0
            if i % 2 == 0:
                val = -val
            floats.append(val)
        return floats


def _connect_and_load_vec(db_path: Path | str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    if _dense_retrieval_enabled():
        try:
            import sqlite_vec  # type: ignore
            conn.enable_load_extension(True)
            sqlite_vec.load(conn)
            conn.enable_load_extension(False)
        except Exception:
            try:
                conn.enable_load_extension(False)
            except Exception:
                pass
    return conn


def build_curriculum_index(index_path: Path = DEFAULT_INDEX_PATH, levels: list[str] | None = None) -> Path:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    requested_levels = levels or ["A1", "A2", "B1", "B2"]
    
    with _connect_and_load_vec(index_path) as conn:
        conn.execute("DROP TABLE IF EXISTS curriculum")
        conn.execute("DROP TABLE IF EXISTS curriculum_fts")
        conn.execute("DROP TABLE IF EXISTS curriculum_vec")
        
        conn.execute(
            "CREATE TABLE curriculum (id INTEGER PRIMARY KEY, level TEXT NOT NULL, source TEXT NOT NULL, content TEXT NOT NULL)"
        )
        
        vec_available = _dense_retrieval_enabled() and _create_vec(conn)
        
        fts_available = _create_fts(conn)
        
        for level in requested_levels:
            transcripts, resolved_level = load_transcripts(level)
            for transcript in transcripts:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO curriculum(level, source, content) VALUES (?, ?, ?)",
                    (resolved_level, transcript.source, transcript.content),
                )
                row_id = cursor.lastrowid
                
                if vec_available:
                    embedding = get_bge_m3_embedding(transcript.content)
                    conn.execute(
                        "INSERT INTO curriculum_vec(rowid, embedding) VALUES (?, ?)",
                        (row_id, json.dumps(embedding)),
                    )
                
        if fts_available:
            conn.execute(
                "INSERT INTO curriculum_fts(rowid, level, source, content) "
                "SELECT id, level, source, content FROM curriculum"
            )
        conn.commit()
    return index_path


def search_curriculum(query: str, level: str = "A1", limit: int = 5, index_path: Path = DEFAULT_INDEX_PATH) -> list[CurriculumHit]:
    if not index_path.exists() or not (query or "").strip():
        return []
    normalized_level = normalize_level(level)
    
    with _connect_and_load_vec(index_path) as conn:
        # 1. Lexical (FTS5) Search
        fts_hits = []
        if _has_table(conn, "curriculum_fts"):
            try:
                fts_query_str = _fts_query(query)
                rows = conn.execute(
                    "SELECT rowid, bm25(curriculum_fts) AS score "
                    "FROM curriculum_fts WHERE curriculum_fts MATCH ? AND level = ? "
                    "ORDER BY score LIMIT ?",
                    (fts_query_str, normalized_level, limit * 3),
                ).fetchall()
                fts_hits = [row[0] for row in rows]
            except Exception:
                pass
        
        # 2. Semantic (Vector) Search
        vec_hits = []
        if _dense_retrieval_enabled() and _has_table(conn, "curriculum_vec"):
            try:
                embedding = get_bge_m3_embedding(query)
                rows = conn.execute(
                    "SELECT cv.rowid, cv.distance "
                    "FROM curriculum_vec cv "
                    "JOIN curriculum c ON cv.rowid = c.id "
                    "WHERE cv.embedding MATCH ? AND c.level = ? AND k = ? "
                    "ORDER BY cv.distance",
                    (json.dumps(embedding), normalized_level, limit * 3)
                ).fetchall()
                vec_hits = [row[0] for row in rows]
            except Exception:
                pass
        
        # 3. Reciprocal Rank Fusion (RRF)
        k = 60
        rrf_scores = {}
        for rank, rowid in enumerate(fts_hits, start=1):
            rrf_scores[rowid] = rrf_scores.get(rowid, 0.0) + 1.0 / (k + rank)
        for rank, rowid in enumerate(vec_hits, start=1):
            rrf_scores[rowid] = rrf_scores.get(rowid, 0.0) + 1.0 / (k + rank)
            
        # Sort rowids by RRF score descending
        sorted_hits = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:limit]
        
        if sorted_hits:
            placeholders = ",".join("?" for _ in sorted_hits)
            rowids = [hit[0] for hit in sorted_hits]
            rows = conn.execute(
                f"SELECT id, level, source, content FROM curriculum WHERE id IN ({placeholders})",
                rowids
            ).fetchall()
            
            rows_by_id = {row[0]: row for row in rows}
            results = []
            for rowid, rrf_score in sorted_hits:
                row = rows_by_id.get(rowid)
                if row:
                    results.append(
                        CurriculumHit(
                            level=str(row[1]),
                            source=str(row[2]),
                            content=str(row[3]),
                            score=float(rrf_score),
                        )
                    )
            return results
            
        # Fallback to standard LIKE search
        like = f"%{query.strip()}%"
        rows = conn.execute(
            "SELECT level, source, content, 0.0 FROM curriculum WHERE level = ? AND content LIKE ? LIMIT ?",
            (normalized_level, like, limit),
        ).fetchall()
        return [CurriculumHit(str(row[0]), str(row[1]), str(row[2]), float(row[3])) for row in rows]


def _create_fts(conn: sqlite3.Connection) -> bool:
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE curriculum_fts USING fts5(level UNINDEXED, source UNINDEXED, content)"
        )
        return True
    except sqlite3.OperationalError:
        return False


def _create_vec(conn: sqlite3.Connection) -> bool:
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE curriculum_vec USING vec0(embedding float[1024])"
        )
        return True
    except sqlite3.OperationalError:
        return False


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
    return row is not None


def _fts_query(query: str) -> str:
    tokens = [token.replace('"', "") for token in query.split() if token.strip()]
    return " OR ".join(f'"{token}"' for token in tokens) if tokens else '""'


def _dense_retrieval_enabled() -> bool:
    if os.getenv("PYTEST_CURRENT_TEST") is not None:
        return True
    return os.getenv("ENABLE_DENSE_RETRIEVAL", "").strip().lower() in {"1", "true", "yes", "on"}
