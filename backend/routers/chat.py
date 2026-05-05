import os
import sqlite3

from fastapi import APIRouter, Body, HTTPException

from backend.database import DB_DIR, MASTER_DB

router = APIRouter()


def _list_dbs_labeled() -> list[dict]:
    """Return labeled DB options: EXPERIMENT (main db) + project DBs."""
    result: list[dict] = []
    if os.path.exists(os.path.join(DB_DIR, MASTER_DB)):
        result.append({"id": MASTER_DB, "label": "EXPERIMENT (共通DB)", "group": "EXPERIMENT"})
    proj_dir = os.path.join(DB_DIR, "projects")
    if os.path.isdir(proj_dir):
        for f in sorted(os.listdir(proj_dir)):
            if f.endswith(".db") and os.path.isfile(os.path.join(proj_dir, f)):
                stem = f[:-3]
                name = stem.split("_", 1)[1] if "_" in stem else stem
                result.append({"id": f"projects/{f}", "label": name, "group": "PROJECT"})
    return result


def _validate_db_path(db_path: str) -> str:
    """Validate and return absolute path; raise 400/404 on error."""
    full = os.path.abspath(os.path.join(DB_DIR, db_path))
    db_dir_abs = os.path.abspath(DB_DIR) + os.sep
    if not full.startswith(db_dir_abs):
        raise HTTPException(400, "Invalid db path")
    if not os.path.exists(full):
        raise HTTPException(404, f"DB not found: {db_path}")
    return full


@router.get("/databases")
def list_databases():
    """Return labeled DB options grouped by EXPERIMENT / PROJECT."""
    dbs = _list_dbs_labeled()
    default_id = dbs[0]["id"] if dbs else ""
    return {"databases": dbs, "default": default_id}


@router.post("/query")
def chat_query(body: dict = Body(...)):
    question: str = body.get("question", "").strip()
    db_path: str = body.get("db", MASTER_DB)

    if not question:
        raise HTTPException(400, "question is required")

    full = _validate_db_path(db_path)

    conn = sqlite3.connect(full)
    try:
        has_exp = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='experiment'"
        ).fetchone() is not None

        experiment_count: int | None = None
        experiment_ids: list[str] = []
        if has_exp:
            experiment_count = conn.execute(
                "SELECT COUNT(*) FROM experiment"
            ).fetchone()[0]
            rows = conn.execute(
                "SELECT experiment_id FROM experiment ORDER BY rowid"
            ).fetchall()
            experiment_ids = [r[0] for r in rows]
    finally:
        conn.close()

    labeled = _list_dbs_labeled()
    db_entry = next((d for d in labeled if d["id"] == db_path), None)
    db_label = db_entry["label"] if db_entry else db_path
    db_group = db_entry["group"] if db_entry else "EXPERIMENT"

    if experiment_count is None:
        message = f"「{db_label}」に experiment テーブルが見つかりませんでした"
    elif db_group == "PROJECT":
        message = (
            f"プロジェクト「{db_label}」から {experiment_count:,} 件の実験を読み込みました\n"
            "実験IDを選択してメインDBへの取り戻し・編集・追加ができます\n\n"
            "🚧 実験の取り出し・編集機能は現在実装中です"
        )
    else:
        message = (
            f"共通DB「{db_label}」から {experiment_count:,} 件の実験を読み込みました\n\n"
            "🚧 AIによる自然言語クエリは現在実装中です"
        )

    return {
        "db_label": db_label,
        "db": db_path,
        "experiment_count": experiment_count,
        "experiment_ids": experiment_ids,
        "message": message,
    }
