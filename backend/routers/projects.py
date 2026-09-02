"""Projects router – manages per-project draft SQLite databases.

Each project gets its own SQLite file (same schema as the main DB) stored in
db/projects/<project_id>.db.  Project metadata is kept in
db/projects/manifest.json.

Workflow:
  1. POST /api/projects           → create project (name → new DB)
  2. GET  /api/projects/{id}/experiments  → list experiments in project
  3. POST /api/projects/{id}/experiments  → add experiment to project
  4. POST /api/projects/{id}/merge        → merge project into main DB
"""

import csv
import io
import json
import os
import re
import uuid
import html
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool

from backend.models import Base, Experiment, Project, Result
from backend.routers.io import MODEL_ORDER

router = APIRouter()

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(__file__)
PROJECTS_DIR = os.path.normpath(os.path.join(_HERE, "..", "..", "db", "projects"))
MANIFEST_FILE = os.path.join(PROJECTS_DIR, "manifest.json")


# ── Manifest helpers ──────────────────────────────────────────────────────────

def _ensure_dir() -> None:
    os.makedirs(PROJECTS_DIR, exist_ok=True)


def _load_manifest() -> dict:
    _ensure_dir()
    if not os.path.exists(MANIFEST_FILE):
        return {}
    with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_manifest(data: dict) -> None:
    _ensure_dir()
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def _safe_name(name: str) -> str:
    """Filesystem-safe version of a project name (max 40 chars)."""
    safe = re.sub(r'[\\/:*?"<>|]', '_', name)
    safe = re.sub(r'_+', '_', safe).strip('_')
    return safe[:40]


def _make_db_filename(project_id: str, name: str) -> str:
    safe = _safe_name(name)
    return f"{project_id}_{safe}.db" if safe else f"{project_id}.db"


def _db_path(project_id: str) -> str:
    """Return DB file path. Auto-migrates legacy {id}.db files to {id}_{name}.db."""
    manifest = _load_manifest()
    entry = manifest.get(project_id, {})
    filename = entry.get("db_filename")
    if filename:
        return os.path.join(PROJECTS_DIR, filename)
    # Legacy: try old-style {project_id}.db and rename if possible
    old_path = os.path.join(PROJECTS_DIR, f"{project_id}.db")
    name = entry.get("name", "")
    if name and os.path.exists(old_path):
        new_filename = _make_db_filename(project_id, name)
        new_path = os.path.join(PROJECTS_DIR, new_filename)
        try:
            os.rename(old_path, new_path)
            entry["db_filename"] = new_filename
            manifest[project_id] = entry
            _save_manifest(manifest)
            return new_path
        except OSError:
            pass
    return old_path


def _row(item) -> dict:
    return {c.name: getattr(item, c.name) for c in item.__table__.columns}


# ── Engine cache (allows dispose before file deletion) ───────────────────────
_engines: dict = {}


def _get_engine(project_id: str, db_path: str):
    if project_id not in _engines:
        _engines[project_id] = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
            poolclass=NullPool,
        )
    return _engines[project_id]


def _dispose_engine(project_id: str):
    engine = _engines.pop(project_id, None)
    if engine:
        engine.dispose()


def _project_session(project_id: str) -> Session:
    """Return a new SQLAlchemy Session for the given project DB."""
    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    db_path = _db_path(project_id)
    if not os.path.exists(db_path):
        raise HTTPException(404, "Project DB file not found")
    engine = _get_engine(project_id, db_path)
    # Migrate: create new tables (e.g. project) and add new columns
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(experiment)"))}
        if "project_id" not in cols:
            conn.execute(text("ALTER TABLE experiment ADD COLUMN project_id TEXT"))
            conn.commit()
            cols.add("project_id")
        # Add remarks to project table if missing
        proj_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(project)"))}
        if "remarks" not in proj_cols:
            conn.execute(text("ALTER TABLE project ADD COLUMN remarks TEXT"))
            conn.commit()
        # Add new result columns if missing
        result_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(result)"))}
        for col, col_type in [("gap_opening_mm", "REAL"), ("dissimilar_material_flag", "INTEGER")]:
            if col not in result_cols:
                conn.execute(text(f"ALTER TABLE result ADD COLUMN {col} {col_type}"))
                conn.commit()
        # Sync custom columns from main DB's column_defs
        try:
            from backend.database import _migrate_experiment_custom_cols, SessionLocal as _MainSession
            _main = _MainSession()
            try:
                _rows = _main.execute(text(
                    "SELECT column_name, data_type FROM column_def"
                    " WHERE table_name='EXPERIMENT' AND (is_id = '' OR is_id IS NULL)"
                )).fetchall()
            finally:
                _main.close()
            from backend.database import _CUSTOM_COL_TYPE_MAP
            for col_name, data_type in _rows:
                if col_name not in cols:
                    sql_type = _CUSTOM_COL_TYPE_MAP.get(data_type or "", "TEXT")
                    conn.execute(text(f'ALTER TABLE experiment ADD COLUMN "{col_name}" {sql_type}'))
                    conn.commit()
                    cols.add(col_name)
        except Exception:
            pass
        # Ensure project_setting KV table exists
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS project_setting "
            "(key TEXT PRIMARY KEY, value TEXT)"
        ))
        conn.commit()
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


# ── List projects ─────────────────────────────────────────────────────────────

@router.get("")
def list_projects():
    manifest = _load_manifest()
    result = []
    for pid, meta in manifest.items():
        exp_count = 0
        db_path = _db_path(pid)
        if os.path.exists(db_path):
            try:
                engine = create_engine(
                    f"sqlite:///{db_path}",
                    connect_args={"check_same_thread": False},
                )
                with engine.connect() as conn:
                    exp_count = conn.execute(
                        text("SELECT COUNT(*) FROM experiment")
                    ).scalar() or 0
                engine.dispose()
            except Exception:
                pass
        result.append({
            "project_id": pid,
            "name": meta.get("name", ""),
            "created_at": meta.get("created_at", ""),
            "experiment_count": exp_count,
        })
    result.sort(key=lambda x: x["created_at"], reverse=True)
    return result


# ── Create project ────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str
    project_id: str | None = None  # if provided, preserve the original ID


@router.post("")
def create_project(req: CreateProjectRequest):
    _ensure_dir()
    project_id = req.project_id if req.project_id else str(uuid.uuid4())
    # Duplicate check
    manifest = _load_manifest()
    if project_id in manifest:
        raise HTTPException(409, f"プロジェクト ID '{project_id[:8]}…' は既に存在します")
    db_filename = _make_db_filename(project_id, req.name)
    db_path = os.path.join(PROJECTS_DIR, db_filename)

    # Create DB with the same schema as the main DB
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    # Auto-insert the project record so experiments can reference it
    _Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    proj_db = _Session()
    try:
        proj_rec = Project(project_id=project_id, project_name=req.name)
        proj_db.add(proj_rec)
        proj_db.commit()
    finally:
        proj_db.close()
    engine.dispose()

    created_at = datetime.now().isoformat(timespec="seconds")
    manifest = _load_manifest()
    manifest[project_id] = {"name": req.name, "created_at": created_at, "db_filename": db_filename}
    _save_manifest(manifest)

    return {
        "project_id": project_id,
        "name": req.name,
        "created_at": created_at,
        "experiment_count": 0,
    }


# ── Rename project ────────────────────────────────────────────────────────────

class RenameProjectRequest(BaseModel):
    name: str


@router.put("/{project_id}")
def rename_project(project_id: str, req: RenameProjectRequest):
    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    manifest[project_id]["name"] = req.name
    _save_manifest(manifest)
    return {"project_id": project_id, "name": req.name}


# ── Import project from uploaded .db file ─────────────────────────────────────

@router.post("/import")
async def import_project(file: UploadFile = FastAPIFile(...)):
    _ensure_dir()
    tmp_path = os.path.join(PROJECTS_DIR, f"_tmp_{uuid.uuid4()}.db")
    contents = await file.read()
    with open(tmp_path, "wb") as f:
        f.write(contents)

    # Read project metadata from inside the .db file
    project_id = None
    project_name = None
    try:
        engine = create_engine(
            f"sqlite:///{tmp_path}",
            connect_args={"check_same_thread": False},
            poolclass=NullPool,
        )
        with engine.connect() as conn:
            tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
            if "experiment" not in tables:
                engine.dispose()
                os.remove(tmp_path)
                raise HTTPException(400, "Invalid project database: missing 'experiment' table")
            if "project" in tables:
                row = conn.execute(text("SELECT project_id, project_name FROM project LIMIT 1")).fetchone()
                if row:
                    project_id = row[0]
                    project_name = row[1]
        engine.dispose()
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(400, f"Invalid database file: {e}")

    # Fallback: generate new ID / use filename as name
    if not project_id:
        project_id = str(uuid.uuid4())
    if not project_name:
        orig = file.filename or ""
        project_name = orig[:-3] if orig.lower().endswith(".db") else (orig or project_id)

    # Duplicate check
    manifest = _load_manifest()
    if project_id in manifest:
        os.remove(tmp_path)
        raise HTTPException(409, f'"{project_name}" は既にインポートされています (ID: {project_id[:8]}…)')

    # Move to final location with id_name filename
    db_filename = _make_db_filename(project_id, project_name)
    db_path = os.path.join(PROJECTS_DIR, db_filename)
    os.replace(tmp_path, db_path)

    created_at = datetime.now().isoformat(timespec="seconds")
    manifest[project_id] = {"name": project_name, "created_at": created_at, "db_filename": db_filename}
    _save_manifest(manifest)
    return {"project_id": project_id, "name": project_name, "created_at": created_at}


# ── Delete project ────────────────────────────────────────────────────────────

@router.delete("/{project_id}")
def delete_project(project_id: str):
    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    # Dispose engine to release file handle before deletion (required on Windows)
    _dispose_engine(project_id)
    db_path = _db_path(project_id)
    if os.path.exists(db_path):
        os.remove(db_path)
    del manifest[project_id]
    _save_manifest(manifest)
    return {"message": "Project deleted"}


# ── List experiments in project ───────────────────────────────────────────────

@router.get("/{project_id}/experiments")
def list_project_experiments(project_id: str):
    db = _project_session(project_id)
    try:
        rows = db.query(Experiment).all()
        return [_row(r) for r in rows]
    finally:
        db.close()


@router.get("/{project_id}/export/csv")
def export_project_experiments_csv(project_id: str):
    """Export all project experiments with their related configuration fields."""
    from backend.routers.experiments import _build_export_row

    db = _project_session(project_id)
    try:
        rows = [_build_export_row(exp, db) for exp in db.query(Experiment).order_by(Experiment.experiment_id).all()]
        columns = list(dict.fromkeys(key for row in rows for key in row))
        output = io.StringIO()
        output.write("\ufeff")
        writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in columns})
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=project_{project_id}_experiments.csv"},
        )
    finally:
        db.close()


# ── Create experiment in project ──────────────────────────────────────────────

class ExperimentPayload(BaseModel):
    experiment_id: str | None = None   # if provided, preserve the original ID
    galvano_system_id: str | None = None
    welding_condition_id: str | None = None
    experiment_material_id: str | None = None
    shielding_condition_id: str | None = None
    result_id: str | None = None
    observation_id: str | None = None
    file_id: str | None = None
    project_id: str | None = None
    remarks: str | None = None


@router.post("/{project_id}/experiments")
def create_project_experiment(project_id: str, req: ExperimentPayload):
    db = _project_session(project_id)
    try:
        payload = req.model_dump(exclude={"experiment_id"})
        payload["project_id"] = project_id  # always stamp
        new_id = req.experiment_id if req.experiment_id else str(uuid.uuid4())
        # If the ID already exists, skip (idempotent load)
        existing = db.get(Experiment, new_id)
        if existing:
            return _row(existing)
        exp = Experiment(experiment_id=new_id, **payload)
        db.add(exp)
        db.commit()
        db.refresh(exp)
        return _row(exp)
    finally:
        db.close()


# ── Update experiment in project ──────────────────────────────────────────────

@router.put("/{project_id}/experiments/{experiment_id}")
def update_project_experiment(
    project_id: str, experiment_id: str, req: ExperimentPayload
):
    db = _project_session(project_id)
    try:
        exp = db.get(Experiment, experiment_id)
        if not exp:
            raise HTTPException(404, "Experiment not found")
        payload = req.model_dump()
        payload["project_id"] = project_id  # always stamp
        for k, v in payload.items():
            setattr(exp, k, v)
        db.commit()
        db.refresh(exp)
        return _row(exp)
    finally:
        db.close()


# ── Delete experiment in project ──────────────────────────────────────────────

@router.delete("/{project_id}/experiments/{experiment_id}")
def delete_project_experiment(project_id: str, experiment_id: str):
    db = _project_session(project_id)
    try:
        exp = db.get(Experiment, experiment_id)
        if not exp:
            raise HTTPException(404, "Experiment not found")
        db.delete(exp)
        db.commit()
        return {"message": "Deleted"}
    finally:
        db.close()


# ── Write result fields for project experiment ────────────────────────────────

_RESULT_NUMERIC_COLS = {"oct_depth_mm", "cross_section_depth_mm", "spatter_severity", "crack_severity"}

@router.post("/{project_id}/experiments/{experiment_id}/write-result")
def write_project_result(project_id: str, experiment_id: str, body: dict = Body(...)):
    """Create-or-update the Result record for a project experiment."""
    db = _project_session(project_id)
    try:
        exp = db.get(Experiment, experiment_id)
        if not exp:
            raise HTTPException(404, "Experiment not found")
        safe = {k: float(v) for k, v in body.items() if k in _RESULT_NUMERIC_COLS and v is not None}
        if not safe:
            raise HTTPException(400, "No valid result fields provided")
        if exp.result_id:
            result = db.get(Result, exp.result_id)
            if result:
                for k, v in safe.items():
                    setattr(result, k, v)
                db.commit()
                db.refresh(result)
                return {"result_id": result.result_id, **safe}
        new_result = Result(result_id=str(uuid.uuid4()), **safe)
        db.add(new_result)
        exp.result_id = new_result.result_id
        db.commit()
        db.refresh(new_result)
        return {"result_id": new_result.result_id, **safe}
    finally:
        db.close()


# ── Merge project into main DB ────────────────────────────────────────────────

@router.get("/{project_id}/merge/preview")
def merge_preview(project_id: str):
    """Return a diff of experiment rows that already exist in main DB but differ."""
    import sqlite3 as _sqlite3

    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    db_path = _db_path(project_id)
    if not os.path.exists(db_path):
        raise HTTPException(404, "Project DB file not found")

    from backend.database import SessionLocal

    main_db: Session = SessionLocal()
    try:
        src_conn = _sqlite3.connect(db_path)
        src_conn.row_factory = _sqlite3.Row
        src_cur = src_conn.cursor()

        src_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='experiment'")
        if not src_cur.fetchone():
            return {"conflicts": [], "new_count": 0}

        src_cur.execute("SELECT * FROM experiment")
        src_rows = [dict(r) for r in src_cur.fetchall()]
        src_conn.close()

        col_names = {c.name for c in Experiment.__table__.columns}
        conflicts = []
        new_count = 0

        for row in src_rows:
            exp_id = row.get("experiment_id")
            if not exp_id:
                continue
            existing = main_db.get(Experiment, exp_id)
            if existing is None:
                new_count += 1
                continue
            # Compare columns
            main_row = {c: getattr(existing, c) for c in col_names}
            src_filtered = {k: v for k, v in row.items() if k in col_names}
            diffs = {}
            for col in col_names:
                main_val = main_row.get(col)
                src_val = src_filtered.get(col)
                if str(main_val) != str(src_val):
                    diffs[col] = {"main": main_val, "project": src_val}
            if diffs:
                conflicts.append({
                    "experiment_id": exp_id,
                    "diffs": diffs,
                })

        return {"conflicts": conflicts, "new_count": new_count}
    finally:
        main_db.close()


@router.post("/{project_id}/merge")
def merge_project(project_id: str, body: dict = Body(default={})):
    """Merge all records from the project DB into the main DB.
    If body contains overwrite_ids=[...], those experiment IDs will be updated (not skipped).
    """
    import sqlite3 as _sqlite3

    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    db_path = _db_path(project_id)
    if not os.path.exists(db_path):
        raise HTTPException(404, "Project DB file not found")

    overwrite_ids: set[str] = set(body.get("overwrite_ids", []))
    proj_name = manifest[project_id].get("name", project_id)

    from backend.database import SessionLocal

    main_db: Session = SessionLocal()
    results: dict = {}
    try:
        # ── Ensure Project record exists in main DB ────────────────────────
        proj_rec = main_db.get(Project, project_id)
        if proj_rec is None:
            proj_rec = Project(project_id=project_id, project_name=proj_name)
            main_db.add(proj_rec)
            main_db.commit()

        src_conn = _sqlite3.connect(db_path)
        src_conn.row_factory = _sqlite3.Row
        src_cur = src_conn.cursor()

        for table_name, model, pk_field in MODEL_ORDER:
            src_cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (model.__tablename__,),
            )
            if not src_cur.fetchone():
                results[table_name] = {"inserted": 0, "skipped": 0, "updated": 0, "note": "not in source"}
                continue

            src_cur.execute(f"SELECT * FROM {model.__tablename__}")
            src_rows = [dict(r) for r in src_cur.fetchall()]
            inserted = skipped = updated = 0
            col_names = {c.name for c in model.__table__.columns}
            # Build composite PK tuple if the model has multiple PK columns
            pk_cols = [c.name for c in model.__table__.columns if c.primary_key]
            for row in src_rows:
                pk_val = row.get(pk_field)
                if not pk_val:
                    existing = None
                elif len(pk_cols) > 1:
                    pk_tuple = tuple(row.get(c) for c in pk_cols)
                    existing = main_db.get(model, pk_tuple)
                else:
                    existing = main_db.get(model, str(pk_val))
                if existing:
                    # Overwrite only if explicitly requested (experiment table only)
                    if model is Experiment and str(pk_val) in overwrite_ids:
                        filtered = {k: v for k, v in row.items() if k in col_names}
                        filtered["project_id"] = project_id
                        for k, v in filtered.items():
                            setattr(existing, k, v)
                        updated += 1
                    else:
                        skipped += 1
                    continue
                filtered = {k: v for k, v in row.items() if k in col_names}
                if model is Experiment:
                    filtered["project_id"] = project_id
                try:
                    main_db.add(model(**filtered))
                    inserted += 1
                except Exception:
                    skipped += 1
            try:
                main_db.commit()
            except Exception:
                main_db.rollback()
                skipped += inserted + updated
                inserted = updated = 0
            results[table_name] = {"inserted": inserted, "skipped": skipped, "updated": updated}

        src_conn.close()
    finally:
        main_db.close()

    return {"message": "Merge complete", "details": results}


# ── Deep fetch: full nested tree for one experiment ───────────────────────────

@router.get("/{project_id}/experiments/{experiment_id}/deep")
def get_experiment_deep(project_id: str, experiment_id: str):
    """Return the full nested object tree for an experiment, fetching each
    referenced record from the *main* database."""
    import sqlite3 as _sqlite3

    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")

    # Get the experiment row from the project DB
    proj_db = _project_session(project_id)
    try:
        exp = proj_db.get(Experiment, experiment_id)
        if not exp:
            raise HTTPException(404, "Experiment not found")
        exp_row = _row(exp)
    finally:
        proj_db.close()

    from backend.database import SessionLocal
    from backend.models import (
        GalvanoSystem, Ftheta, Optics, LaserDevice, LaserBeam, Doe,
        WeldingCondition, TrajectorySet, MainTrajectory, LineParameter,
        SubTrajectory, WobblingParameter,
        ExperimentMaterial, MaterialState, Material,
        ShieldingCondition, Result, Observation, File, Project,
    )

    # Open project DB again for record lookups
    proj_db2 = _project_session(project_id)
    main_db = SessionLocal()
    try:
        def fetch(model, pk_val):
            """Fetch from project DB first, fall back to main DB."""
            if not pk_val:
                return None
            obj = proj_db2.get(model, pk_val)
            if obj is None:
                obj = main_db.get(model, pk_val)
            return {c.name: getattr(obj, c.name) for c in obj.__table__.columns} if obj else None

        def fetch_laser_beams(lb_id):
            if not lb_id:
                return []
            rows = proj_db2.query(LaserBeam).filter(LaserBeam.laser_beam_id == lb_id).all()
            if not rows:
                rows = main_db.query(LaserBeam).filter(LaserBeam.laser_beam_id == lb_id).all()
            return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

        def fetch_optics_group(optics_group_id):
            if not optics_group_id:
                return []
            rows = proj_db2.query(Optics).filter(Optics.optics_id == optics_group_id).all()
            if not rows:
                rows = main_db.query(Optics).filter(Optics.optics_id == optics_group_id).all()
            result = []
            for o in rows:
                od = {c.name: getattr(o, c.name) for c in o.__table__.columns}
                ld = fetch(LaserDevice, o.laser_device_id)
                if ld:
                    ld["laser_beams"] = fetch_laser_beams(ld.get("laser_beam_id"))
                od["laser_device"] = ld
                od["doe"] = fetch(Doe, o.doe_id)
                result.append(od)
            return result

        # galvano_system branch
        gs = fetch(GalvanoSystem, exp_row.get("galvano_system_id"))
        if gs:
            gs["ftheta"] = fetch(Ftheta, gs.get("ftheta_id"))
            gs["optics_rows"] = fetch_optics_group(gs.get("optics_id"))

        # welding_condition branch
        wc = fetch(WeldingCondition, exp_row.get("welding_condition_id"))
        if wc:
            ts = fetch(TrajectorySet, wc.get("trajectory_set_id"))
            if ts:
                mt = fetch(MainTrajectory, ts.get("main_trajectory_id"))
                if mt:
                    mt["line_parameter"] = fetch(LineParameter, mt.get("main_trajectory_parameter_id"))
                ts["main_trajectory"] = mt
                st = fetch(SubTrajectory, ts.get("sub_trajectory_id"))
                if st:
                    st["wobbling_parameter"] = fetch(WobblingParameter, st.get("sub_trajectory_parameter_id"))
                ts["sub_trajectory"] = st
            wc["trajectory_set"] = ts

        # experiment_material branch — composite PK (id, role), may have multiple rows
        em_id = exp_row.get("experiment_material_id")
        em_list = []
        if em_id:
            rows_proj = proj_db2.query(ExperimentMaterial).filter(
                ExperimentMaterial.experiment_material_id == em_id
            ).all()
            rows_main = main_db.query(ExperimentMaterial).filter(
                ExperimentMaterial.experiment_material_id == em_id
            ).all() if not rows_proj else []
            for em_row in (rows_proj or rows_main):
                em_data = {c.name: getattr(em_row, c.name) for c in em_row.__table__.columns}
                ms = fetch(MaterialState, em_data.get("material_state_id"))
                if ms:
                    ms["material"] = fetch(Material, ms.get("material_id"))
                em_data["material_state"] = ms
                em_list.append(em_data)

        # project branch
        proj_id = exp_row.get("project_id") or project_id
        project_obj = fetch(Project, proj_id)
        if not project_obj:
            # Fallback: build from manifest
            m = _load_manifest()
            proj_name = m.get(proj_id, {}).get("name")
            project_obj = {"project_id": proj_id, "project_name": proj_name} if proj_name else None

        return {
            "experiment": exp_row,
            "galvano_system": gs,
            "welding_condition": wc,
            "experiment_material": em_list,
            "shielding_condition": fetch(ShieldingCondition, exp_row.get("shielding_condition_id")),
            "result": fetch(Result, exp_row.get("result_id")),
            "observation": fetch(Observation, exp_row.get("observation_id")),
            "file": fetch(File, exp_row.get("file_id")),
            "project": project_obj,
        }
    finally:
        proj_db2.close()
        main_db.close()


@router.post("/{project_id}/records/{table_name}")
def create_project_record(
    project_id: str,
    table_name: str,
    body: dict = Body(...),
):
    """Create a record of any table type in the project DB and return it with a new UUID."""
    table_map = {name: (model, pk) for name, model, pk in MODEL_ORDER}
    entry = table_map.get(table_name)
    if not entry:
        raise HTTPException(404, f"Table '{table_name}' not found")
    model, pk_field = entry

    db = _project_session(project_id)
    try:
        body.pop(pk_field, None)
        new_id = str(uuid.uuid4())
        # Use only actual column names — exclude relationship attributes (which
        # share the same name as nested dicts from the /deep endpoint).
        col_names = {c.name for c in model.__table__.columns}
        filtered = {k: v for k, v in body.items() if k in col_names}
        instance = model(**{pk_field: new_id, **filtered})
        db.add(instance)
        db.commit()
        db.refresh(instance)
        return {c.name: getattr(instance, c.name) for c in instance.__table__.columns}
    finally:
        db.close()


@router.get("/{project_id}/export/db")
def export_project_db(project_id: str):
    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    db_path = _db_path(project_id)
    if not os.path.exists(db_path):
        raise HTTPException(404, "Project DB file not found")
    name = manifest[project_id].get("name", project_id)
    return FileResponse(
        path=db_path,
        media_type="application/octet-stream",
        filename=f"{name}.db",
    )


# ── Markdown report ───────────────────────────────────────────────────────────

def _v(val) -> str:
    """Format a value for Markdown table cell."""
    if val is None:
        return ""
    return str(val)


def _md_table(rows: list[dict], skip_keys: set[str] | None = None) -> str:
    """Render a list of dicts as a Markdown key-value table."""
    if not rows:
        return ""
    skip = skip_keys or set()
    lines = ["| Key | Value |", "|---|---|"]
    for k, v in rows[0].items():
        if k in skip:
            continue
        lines.append(f"| {k} | {_v(v)} |")
    return "\n".join(lines)


def _md_section(title: str, data: dict | None, skip_keys: set[str] | None = None, level: int = 3) -> str:
    hdr = "#" * level
    if not data:
        return f"{hdr} {title}\n\n*(no data)*\n"
    skip = skip_keys or set()
    lines = [f"{hdr} {title}", "", "| Key | Value |", "|---|---|"]
    for k, v in data.items():
        if k in skip or isinstance(v, (dict, list)):
            continue
        lines.append(f"| `{k}` | {_v(v)} |")
    return "\n".join(lines) + "\n"


_REPORT_SECTIONS = [
    "Welding Condition",
    "Trajectory",
    "Galvano System",
    "Ftheta",
    "Optics",
    "Experiment Material",
    "Shielding Condition",
    "Result",
    "Observation",
]


def _normalize_report_field_key(key: str) -> str:
    """Normalize role-specific report keys for settings selection."""
    if not key:
        return key
    s = str(key)
    s = re.sub(r"^Optics\[[^\]]+\]", "Optics", s)
    s = re.sub(r"^Optics\s+role\d+", "Optics", s)
    s = re.sub(r"^Role\[[^\]]+\]", "Role", s)
    s = re.sub(r"^Role\d+", "Role", s)
    return s


def _is_hidden_report_field(raw_key: str, hidden_set: set[str]) -> bool:
    # Backward compatible: accept both legacy raw keys and normalized keys.
    return raw_key in hidden_set or _normalize_report_field_key(raw_key) in hidden_set


def _collect_report_sections(project_id: str):
    """Return (exp_rows, all_sections) for use by /report/fields and /report/md."""
    from backend.database import SessionLocal
    from backend.models import (
        GalvanoSystem, Ftheta, Optics, LaserDevice, LaserBeam, Doe,
        WeldingCondition, TrajectorySet, MainTrajectory, LineParameter,
        SubTrajectory, WobblingParameter,
        ExperimentMaterial, MaterialState, Material,
        ShieldingCondition, Result, Observation,
    )

    proj_db = _project_session(project_id)
    try:
        experiments = proj_db.query(Experiment).all()
        exp_rows = [_row(e) for e in experiments]
    finally:
        proj_db.close()

    proj_db2 = _project_session(project_id)
    main_db = SessionLocal()
    try:
        def fetch(model, pk_val):
            if not pk_val:
                return None
            pk_cols = list(model.__table__.primary_key.columns)
            if len(pk_cols) == 1:
                obj = proj_db2.get(model, pk_val)
                if obj is None:
                    obj = main_db.get(model, pk_val)
            else:
                # Composite PK: filter by first PK column
                id_col = getattr(model, pk_cols[0].name)
                obj = proj_db2.query(model).filter(id_col == pk_val).first()
                if obj is None:
                    obj = main_db.query(model).filter(id_col == pk_val).first()
            return {c.name: getattr(obj, c.name) for c in obj.__table__.columns} if obj else None

        def fetch_laser_beams(lb_id):
            if not lb_id:
                return []
            rows = proj_db2.query(LaserBeam).filter(LaserBeam.laser_beam_id == lb_id).all()
            if not rows:
                rows = main_db.query(LaserBeam).filter(LaserBeam.laser_beam_id == lb_id).all()
            return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]

        def fetch_optics_rows(optics_id):
            if not optics_id:
                return []
            rows = proj_db2.query(Optics).filter(Optics.optics_id == optics_id).all()
            if not rows:
                rows = main_db.query(Optics).filter(Optics.optics_id == optics_id).all()
            result = []
            for o in rows:
                od = {c.name: getattr(o, c.name) for c in o.__table__.columns}
                ld = fetch(LaserDevice, o.laser_device_id)
                if ld:
                    ld["laser_beams"] = fetch_laser_beams(ld.get("laser_beam_id"))
                od["laser_device"] = ld
                od["doe"] = fetch(Doe, o.doe_id)
                result.append(od)
            return result

        def _flat(prefix: str, d) -> dict:
            if not d:
                return {}
            out = {}
            for k, v in d.items():
                if k.endswith("_id") or isinstance(v, (dict, list)):
                    continue
                label = f"{prefix} / {k}" if prefix else k
                out[label] = v
            return out

        all_sections: dict = {s: [] for s in _REPORT_SECTIONS}

        for exp in exp_rows:
            # Welding Condition
            wc = fetch(WeldingCondition, exp.get("welding_condition_id"))
            all_sections["Welding Condition"].append(_flat("", wc))

            # Trajectory
            traj: dict = {}
            if wc:
                ts = fetch(TrajectorySet, wc.get("trajectory_set_id"))
                traj.update(_flat("Trajectory Set", ts))
                if ts:
                    mt = fetch(MainTrajectory, ts.get("main_trajectory_id"))
                    traj.update(_flat("Main Trajectory", mt))
                    if mt:
                        lp = fetch(LineParameter, mt.get("main_trajectory_parameter_id"))
                        traj.update(_flat("Line Parameter", lp))
                    st = fetch(SubTrajectory, ts.get("sub_trajectory_id"))
                    traj.update(_flat("Sub Trajectory", st))
                    if st:
                        wp = fetch(WobblingParameter, st.get("sub_trajectory_parameter_id"))
                        traj.update(_flat("Wobbling", wp))
            all_sections["Trajectory"].append(traj)

            # Galvano System
            gs = fetch(GalvanoSystem, exp.get("galvano_system_id"))
            all_sections["Galvano System"].append(_flat("", gs))

            # Ftheta
            ftheta: dict = {}
            if gs:
                ft = fetch(Ftheta, gs.get("ftheta_id"))
                ftheta.update(_flat("", ft))
            all_sections["Ftheta"].append(ftheta)

            # Optics
            optics: dict = {}
            if gs:
                optics_list = fetch_optics_rows(gs.get("optics_id"))
                multi = len(optics_list) > 1
                for oi, orow in enumerate(optics_list, 1):
                    role_name = (orow.get("optics_role") or "").strip()
                    if role_name:
                        pfx = f"Optics[{role_name}]"
                    else:
                        pfx = f"Optics role{oi}" if multi else "Optics"
                    scalar_orow = {k: v for k, v in orow.items() if k not in ("laser_device", "doe", "optics_role")}
                    optics.update(_flat(pfx, scalar_orow))
                    ld = orow.get("laser_device")
                    ld_pfx = f"{pfx} / Laser Device"
                    optics.update(_flat(ld_pfx, ld))
                    if ld:
                        beams = ld.get("laser_beams") or []
                        multi_b = len(beams) > 1
                        for bi, lb in enumerate(beams, 1):
                            b_pfx = f"{ld_pfx} / Beam {bi}" if multi_b else f"{ld_pfx} / Beam"
                            optics.update(_flat(b_pfx, lb))
                    optics.update(_flat(f"{pfx} / DOE", orow.get("doe")))
            all_sections["Optics"].append(optics)

            # Experiment Material
            mat_data: dict = {}
            em_id = exp.get("experiment_material_id")
            em_rows = []
            if em_id:
                em_rows = proj_db2.query(ExperimentMaterial).filter(
                    ExperimentMaterial.experiment_material_id == em_id
                ).all()
                if not em_rows:
                    em_rows = main_db.query(ExperimentMaterial).filter(
                        ExperimentMaterial.experiment_material_id == em_id
                    ).all()

            for ei, em_row in enumerate(em_rows, 1):
                em_obj = {c.name: getattr(em_row, c.name) for c in em_row.__table__.columns}
                role_name = (em_obj.get("material_role") or "").strip()
                rpfx = f"Role[{role_name}]" if role_name else f"Role{ei}"
                scalar_em = {k: v for k, v in em_obj.items() if k not in ("material_state_id", "material_role")}
                mat_data.update(_flat(rpfx, scalar_em))

                ms = fetch(MaterialState, em_obj.get("material_state_id"))
                mat_data.update(_flat(f"{rpfx} / Material State", ms))
                if ms:
                    mat = fetch(Material, ms.get("material_id"))
                    mat_data.update(_flat(f"{rpfx} / Material", mat))
            all_sections["Experiment Material"].append(mat_data)

            # Shielding Condition
            sc = fetch(ShieldingCondition, exp.get("shielding_condition_id"))
            all_sections["Shielding Condition"].append(_flat("", sc))

            # Result
            result = fetch(Result, exp.get("result_id"))
            all_sections["Result"].append(_flat("", result))

            # Observation
            obs = fetch(Observation, exp.get("observation_id"))
            all_sections["Observation"].append(_flat("", obs))

        return exp_rows, all_sections
    finally:
        proj_db2.close()
        main_db.close()


@router.get("/{project_id}/report/fields")
def get_report_fields(project_id: str):
    """Return ordered field keys per section for this project (used to build the settings UI)."""
    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    _, all_sections = _collect_report_sections(project_id)
    result = []
    for sec in _REPORT_SECTIONS:
        sec_data = all_sections[sec]
        if all(not d for d in sec_data):
            continue
        seen: list = []
        seen_set: set = set()
        for d in sec_data:
            for k in d:
                nk = _normalize_report_field_key(k)
                if nk not in seen_set:
                    seen.append(nk)
                    seen_set.add(nk)
        result.append({"section": sec, "fields": seen})
    return result


@router.get("/{project_id}/report/config")
def get_report_config(project_id: str):
    """Return current report display config for a project."""
    from backend.settings_database import SessionLocal as SettingsSession, ReportConfig as RC
    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    db = SettingsSession()
    try:
        rc = db.get(RC, project_id)
        hidden = json.loads(rc.hidden_fields) if rc and rc.hidden_fields else []
        layout_mode = rc.layout_mode if rc and rc.layout_mode else "sectioned"
        chart_columns = int(rc.chart_columns) if rc and rc.chart_columns else 2
        chart_width = int(rc.chart_width) if rc and rc.chart_width else 640
        return {
            "hidden_fields": hidden,
            "layout_mode": layout_mode,
            "chart_columns": chart_columns,
            "chart_width": chart_width,
        }
    finally:
        db.close()


@router.put("/{project_id}/report/config")
def put_report_config(project_id: str, body: dict = Body(...)):
    """Save report display config for a project."""
    from backend.settings_database import SessionLocal as SettingsSession, ReportConfig as RC
    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    hidden = body.get("hidden_fields", [])
    layout_mode = body.get("layout_mode") or "sectioned"
    if layout_mode not in {"sectioned", "combined_by_experiment"}:
        raise HTTPException(400, "Invalid layout_mode")
    try:
        chart_columns = int(body.get("chart_columns", 2))
        chart_width = int(body.get("chart_width", 640))
    except Exception:
        raise HTTPException(400, "Invalid chart layout values")
    if chart_columns < 1 or chart_columns > 6:
        raise HTTPException(400, "chart_columns must be between 1 and 6")
    if chart_width < 120 or chart_width > 3000:
        raise HTTPException(400, "chart_width must be between 120 and 3000")
    db = SettingsSession()
    try:
        rc = db.get(RC, project_id)
        if rc is None:
            rc = RC(project_id=project_id)
            db.add(rc)
        rc.hidden_fields = json.dumps(hidden, ensure_ascii=False)
        rc.layout_mode = layout_mode
        rc.chart_columns = chart_columns
        rc.chart_width = chart_width
        db.commit()
        return {
            "hidden_fields": hidden,
            "layout_mode": layout_mode,
            "chart_columns": chart_columns,
            "chart_width": chart_width,
        }
    finally:
        db.close()


@router.get("/{project_id}/report/md")
def export_project_report_md(project_id: str):
    """Generate a wide-table Markdown report comparing all experiments in the project."""
    from io import BytesIO
    from urllib.parse import quote
    from fastapi.responses import StreamingResponse
    from backend.settings_database import SessionLocal as SettingsSession, ReportConfig as RC

    manifest = _load_manifest()
    if project_id not in manifest:
        raise HTTPException(404, f"Project '{project_id}' not found")
    proj_name = manifest[project_id].get("name", project_id)

    # Load report config
    s_db = SettingsSession()
    try:
        rc = s_db.get(RC, project_id)
        hidden_set: set = set(json.loads(rc.hidden_fields) if rc and rc.hidden_fields else [])
        layout_mode = rc.layout_mode if rc and rc.layout_mode else "sectioned"
    finally:
        s_db.close()

    exp_rows, all_sections = _collect_report_sections(project_id)
    n = len(exp_rows)
    exp_labels = [exp.get("experiment_id", f"No.{i}") for i, exp in enumerate(exp_rows, 1)]

    def _table_metrics(col_count: int) -> tuple[str, str]:
        # PDF用: 列数が増えるほどフォントと余白を小さくして横幅内に収める
        if col_count >= 18:
            return "8px", "2px 4px"
        if col_count >= 12:
            return "9px", "2px 5px"
        if col_count >= 8:
            return "10px", "3px 6px"
        return "11px", "4px 8px"

    def _html_table(headers: list[str], rows: list[list[str]]) -> str:
        if not headers:
            return ""
        fz, pad = _table_metrics(len(headers))
        head = "".join(
            f'<th style="border:1px solid #999;padding:{pad};text-align:left;white-space:normal;word-break:break-word;">{html.escape(str(h))}</th>'
            for h in headers
        )
        body_rows = []
        for row in rows:
            cols = "".join(
                f'<td style="border:1px solid #b5b5b5;padding:{pad};vertical-align:top;white-space:normal;word-break:break-word;">{html.escape(str(c))}</td>'
                for c in row
            )
            body_rows.append(f"<tr>{cols}</tr>")
        return (
            f'<div style="max-width:100%;overflow-x:hidden;">'
            f'<table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:{fz};line-height:1.25;">'
            f"<thead><tr>{head}</tr></thead>"
            f"<tbody>{''.join(body_rows)}</tbody>"
            f"</table></div>"
        )

    def _wide_tables(sec_exps: list) -> tuple:
        """Return (common_html, varying_html) for a section, respecting hidden_set."""
        all_keys: list = []
        seen: set = set()
        for d in sec_exps:
            for k in d:
                if k not in seen:
                    all_keys.append(k)
                    seen.add(k)
        # Filter out hidden fields
        all_keys = [k for k in all_keys if not _is_hidden_report_field(k, hidden_set)]
        if not all_keys:
            return "", ""

        common_keys = [k for k in all_keys
                       if all(d.get(k) == sec_exps[0].get(k) for d in sec_exps)]
        varying_keys = [k for k in all_keys if k not in set(common_keys)]

        common_md = ""
        if common_keys:
            common_rows = [[k, _v(sec_exps[0].get(k))] for k in common_keys]
            common_md = _html_table(["Parameter", "Value"], common_rows) + "\n"

        varying_md = ""
        if varying_keys:
            headers = ["Experiment ID", *varying_keys]
            var_rows = []
            for label, d in zip(exp_labels, sec_exps):
                var_rows.append([label, *[_v(d.get(k)) for k in varying_keys]])
            varying_md = _html_table(headers, var_rows) + "\n"

        return common_md, varying_md

    def _combined_table_md() -> str:
        visible_keys: list[str] = []
        seen: set[str] = set()
        for sec in _REPORT_SECTIONS:
            for d in all_sections[sec]:
                for k in d:
                    if _is_hidden_report_field(k, hidden_set) or k in seen:
                        continue
                    visible_keys.append(k)
                    seen.add(k)
        headers = ["Experiment ID", *visible_keys]
        rows: list[list[str]] = []
        for label, idx in zip(exp_labels, range(len(exp_rows))):
            merged: dict[str, object] = {}
            for sec in _REPORT_SECTIONS:
                merged.update(all_sections[sec][idx] or {})
            rows.append([label, *[_v(merged.get(k)) for k in visible_keys]])
        return _html_table(headers, rows) + "\n"

    lines: list = []
    lines.append(f"# Project Report: {proj_name}")
    lines.append(f"\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"\nTotal experiments: {n}\n")
    lines.append(
        "<style>"
        "@page{size:A4 landscape;margin:8mm;}"
        "table{max-width:100%;}"
        "th,td{box-sizing:border-box;}"
        "</style>\n"
    )
    lines.append("---\n")

    # Experiment overview
    lines.append("## 実験一覧\n")
    overview_rows: list[list[str]] = []
    for exp in exp_rows:
        exp_id = exp.get("experiment_id") or "—"
        remarks = exp.get("remarks") or "—"
        overview_rows.append([str(exp_id), str(remarks)])
    lines.append(_html_table(["Experiment ID", "Remarks"], overview_rows))
    lines.append("\n---\n")

    if layout_mode == "combined_by_experiment":
        lines.append("## 実験別統合テーブル\n")
        lines.append(_combined_table_md())
        lines.append("\n---\n")
    else:
        # One section block per section
        for sec in _REPORT_SECTIONS:
            sec_data = all_sections[sec]
            if all(not d for d in sec_data):
                continue
            lines.append(f"## {sec}\n")
            common_md, varying_md = _wide_tables(sec_data)
            if common_md:
                lines.append("### 共通項目\n")
                lines.append(common_md)
            if varying_md:
                lines.append("### 実験別パラメータ\n")
                lines.append(varying_md)
            if not common_md and not varying_md:
                lines.append("*(no data)*\n")
            lines.append("\n---\n")

    content = "\n".join(lines)
    filename = f"{proj_name}_report.md"
    encoded_filename = quote(filename, safe="")
    return StreamingResponse(
        BytesIO(content.encode("utf-8")),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


# ── Per-project settings (stored in project's own DB) ────────────────────────

@router.get("/{project_id}/settings/{key}")
def get_project_setting(project_id: str, key: str):
    """Return a KV setting stored in the project's own DB."""
    db = _project_session(project_id)
    try:
        row = db.execute(
            text("SELECT value FROM project_setting WHERE key = :key"),
            {"key": key},
        ).fetchone()
        return {"key": key, "value": row[0] if row else None}
    finally:
        db.close()


@router.put("/{project_id}/settings/{key}")
def put_project_setting(project_id: str, key: str, body: dict = Body(...)):
    """Upsert a KV setting in the project's own DB."""
    db = _project_session(project_id)
    try:
        db.execute(
            text(
                "INSERT INTO project_setting (key, value) VALUES (:key, :value) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            ),
            {"key": key, "value": body.get("value")},
        )
        db.commit()
        return {"key": key, "value": body.get("value")}
    finally:
        db.close()
