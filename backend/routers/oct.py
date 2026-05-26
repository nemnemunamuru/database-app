"""
OCT Remote Mode Router
──────────────────────
フロントエンドから待受状態をセット → OCT PC から CSV パスを PUSH → Result に書き込む
"""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Experiment, Result

router = APIRouter()

# ── サーバーメモリ内状態 (再起動でリセット) ──────────────────────────────────
_state: dict = {
    "experiment_id": None,
    "project_id": None,
    "received": False,
    "received_paths": {},
}

# 許可するカラム名（SQL インジェクション防止）
_ALLOWED_COLS = {"oct_surface_csv_path", "oct_depth_csv_path", "oct_result_csv_path"}


# ── スキーマ ─────────────────────────────────────────────────────────────────
class PushBody(BaseModel):
    oct_surface_csv_path:  Optional[str] = None
    oct_depth_csv_path:    Optional[str] = None
    oct_result_csv_path:   Optional[str] = None


# ── エンドポイント ────────────────────────────────────────────────────────────

@router.post("/activate/{experiment_id}")
def activate(experiment_id: str, project_id: Optional[str] = None):
    """指定実験を OCT 待受状態にセット（DB 検証なし）"""
    if not experiment_id or len(experiment_id) < 8:
        raise HTTPException(status_code=422, detail="Invalid experiment_id")
    _state["experiment_id"] = experiment_id
    _state["project_id"] = project_id
    _state["received"] = False
    _state["received_paths"] = {}
    return {"ok": True, "experiment_id": experiment_id, "project_id": project_id}


@router.delete("/activate")
def deactivate():
    """待受状態を解除"""
    _state["experiment_id"] = None
    _state["project_id"] = None
    _state["received"] = False
    _state["received_paths"] = {}
    return {"ok": True}


@router.get("/status")
def status():
    """現在の待受状態を返す（フロントエンドがポーリング）"""
    return {
        "active_experiment_id": _state["experiment_id"],
        "received": _state["received"],
        "received_paths": _state["received_paths"],
    }


def _push_to_project_db(project_id: str, exp_id: str, updates: dict) -> str:
    """プロジェクト専用 SQLite DB に直接書き込む。result_id を返す。"""
    from backend.routers.projects import _db_path
    db_path = _db_path(project_id)

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT result_id FROM experiment WHERE experiment_id=?", (exp_id,)
        ).fetchone()
        if not row or not row[0]:
            raise HTTPException(status_code=400, detail="Experiment has no Result record linked")
        result_id = row[0]

        safe_updates = {k: v for k, v in updates.items() if k in _ALLOWED_COLS}
        set_clause = ", ".join(f"{k}=?" for k in safe_updates)
        conn.execute(
            f"UPDATE result SET {set_clause} WHERE result_id=?",
            list(safe_updates.values()) + [result_id],
        )
        conn.commit()

    return result_id


@router.post("/push")
def push(body: PushBody, db: Session = Depends(get_db)):
    """
    OCT PC から CSV パスを受け取り、待受中の実験の Result に書き込む
    待受状態でない場合は 400 エラー
    """
    exp_id = _state["experiment_id"]
    project_id = _state.get("project_id")
    if not exp_id:
        raise HTTPException(status_code=400, detail="No experiment is waiting for OCT data. Activate remote mode first.")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No CSV paths provided")

    if project_id:
        # プロジェクト専用 DB へ直接 SQLite で書き込み
        result_id = _push_to_project_db(project_id, exp_id, updates)
    else:
        # メイン DB（SQLAlchemy）
        exp = db.get(Experiment, exp_id)
        if not exp:
            raise HTTPException(status_code=404, detail=f"Experiment '{exp_id}' not found")
        if not exp.result_id:
            raise HTTPException(status_code=400, detail="Experiment has no Result record linked")
        result_id = exp.result_id
        result = db.get(Result, result_id)
        if not result:
            raise HTTPException(status_code=404, detail="Result record not found")
        for key, value in updates.items():
            setattr(result, key, value)
        db.commit()

    _state["received"] = True
    _state["received_paths"] = updates

    return {
        "ok": True,
        "experiment_id": exp_id,
        "result_id": result_id,
        "updated": updates,
    }



# ── エンドポイント ────────────────────────────────────────────────────────────

@router.post("/activate/{experiment_id}")
def activate(experiment_id: str, project_id: Optional[str] = None):
    """指定実験を OCT 待受状態にセット（DB 検証なし）"""
    if not experiment_id or len(experiment_id) < 8:
        raise HTTPException(status_code=422, detail="Invalid experiment_id")
    _state["experiment_id"] = experiment_id
    _state["project_id"] = project_id
    _state["received"] = False
    _state["received_paths"] = {}
    return {"ok": True, "experiment_id": experiment_id, "project_id": project_id}


@router.delete("/activate")
def deactivate():
    """待受状態を解除"""
    _state["experiment_id"] = None
    _state["project_id"] = None
    _state["received"] = False
    _state["received_paths"] = {}
    return {"ok": True}


@router.get("/status")
def status():
    """現在の待受状態を返す（フロントエンドがポーリング）"""
    return {
        "active_experiment_id": _state["experiment_id"],
        "received": _state["received"],
        "received_paths": _state["received_paths"],
    }


@router.post("/push")
def push(body: PushBody, db: Session = Depends(get_db)):
    """
    OCT PC から CSV パスを受け取り、待受中の実験の Result に書き込む
    待受状態でない場合は 400 エラー
    """
    exp_id = _state["experiment_id"]
    project_id = _state.get("project_id")
    if not exp_id:
        raise HTTPException(status_code=400, detail="No experiment is waiting for OCT data. Activate remote mode first.")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No CSV paths provided")

    # プロジェクト専用 DB があればそちらを使用、なければメイン DB
    if project_id:
        from backend.routers.projects import _project_session
        target_db = _project_session(project_id)
    else:
        target_db = db

    try:
        exp = target_db.get(Experiment, exp_id)
        if not exp:
            raise HTTPException(status_code=404, detail=f"Experiment '{exp_id}' not found")

        if not exp.result_id:
            raise HTTPException(status_code=400, detail="Experiment has no Result record linked")

        result_id = exp.result_id  # セッションクローズ前に取得

        result = target_db.get(Result, result_id)
        if not result:
            raise HTTPException(status_code=404, detail="Result record not found")

        for key, value in updates.items():
            setattr(result, key, value)
        target_db.commit()
    finally:
        if project_id:
            target_db.close()

    _state["received"] = True
    _state["received_paths"] = updates

    return {
        "ok": True,
        "experiment_id": exp_id,
        "result_id": result_id,
        "updated": updates,
    }
