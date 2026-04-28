import io as io_module
import json
import os
import shutil
import uuid
import zipfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi import File as FastAPIFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    Experiment, GalvanoSystem, Ftheta, Optics, OpticsEntry,
    LaserDevice, LaserBeam, LaserBeamEntry,
    Doe, WeldingCondition, TrajectorySet, MainTrajectory, SubTrajectory,
    LineParameter, WobblingParameter,
    ExperimentMaterial, MaterialState,
    Material, ShieldingCondition, Result, Observation, File,
    ColumnDef,
)

router = APIRouter()

# ── All models in FK dependency order (parents first) ────────────────────────
MODEL_ORDER = [
    ("laser_beam",          LaserBeam,          "laser_beam_id"),
    ("laser_beam_entry",    LaserBeamEntry,     "laser_beam_entry_id"),
    ("laser_device",        LaserDevice,        "laser_device_id"),
    ("doe",                 Doe,                "doe_id"),
    ("optics",              Optics,             "optics_id"),
    ("optics_entry",        OpticsEntry,        "optics_entry_id"),
    ("ftheta",              Ftheta,             "ftheta_id"),
    ("galvano_system",      GalvanoSystem,      "galvano_system_id"),
    ("line_parameter",      LineParameter,      "main_trajectory_type_parameter_id"),
    ("main_trajectory",     MainTrajectory,     "main_trajectory_id"),
    ("wobbling_parameter",  WobblingParameter,  "sub_trajectory_type_parameter_id"),
    ("sub_trajectory",      SubTrajectory,      "sub_trajectory_id"),
    ("trajectory_set",      TrajectorySet,      "trajectory_set_id"),
    ("welding_condition",   WeldingCondition,   "welding_condition_id"),
    ("material",            Material,           "material_id"),
    ("material_state",      MaterialState,      "material_state_id"),
    ("experiment_material", ExperimentMaterial, "experiment_material_id"),
    ("shielding_condition", ShieldingCondition, "shielding_condition_id"),
    ("result",              Result,             "result_id"),
    ("observation",         Observation,        "observation_id"),
    ("file",                File,               "file_id"),
    ("experiment",          Experiment,         "experiment_id"),
    ("column_def",          ColumnDef,          "column_def_id"),
]

TABLE_MAP = {name: (model, pk) for name, model, pk in MODEL_ORDER}


def _row(item) -> dict:
    return {c.name: getattr(item, c.name) for c in item.__table__.columns}


# ── Export: full JSON backup ──────────────────────────────────────────────────

@router.get("/export/full")
def export_full(db: Session = Depends(get_db)):
    """Export all tables as a single JSON file."""
    data: dict = {}
    for table_name, model, _ in MODEL_ORDER:
        rows = [_row(r) for r in db.query(model).all()]
        data[table_name] = rows

    content = json.dumps(data, ensure_ascii=False, default=str, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=experiment_db_backup.json"},
    )


# ── Export: individual table as CSV ──────────────────────────────────────────

@router.get("/export/table/{table_name}")
def export_table_csv(table_name: str, db: Session = Depends(get_db)):
    """Export a single table as CSV."""
    import csv as csv_module
    entry = TABLE_MAP.get(table_name)
    if not entry:
        raise HTTPException(404, f"Table '{table_name}' not found")
    model, _ = entry
    col_names = [c.name for c in model.__table__.columns]
    rows = db.query(model).all()
    output = io_module.StringIO()
    writer = csv_module.DictWriter(output, fieldnames=col_names)
    writer.writeheader()
    for r in rows:
        writer.writerow(_row(r))
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={table_name}.csv"},
    )


# ── Export: all tables as ZIP of CSVs ────────────────────────────────────────

@router.get("/export/zip")
def export_zip(db: Session = Depends(get_db)):
    """Export all tables as a ZIP archive of CSV files."""
    import csv as csv_module
    buf = io_module.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for table_name, model, _ in MODEL_ORDER:
            col_names = [c.name for c in model.__table__.columns]
            rows = db.query(model).all()
            csv_buf = io_module.StringIO()
            writer = csv_module.DictWriter(csv_buf, fieldnames=col_names)
            writer.writeheader()
            for r in rows:
                writer.writerow(_row(r))
            zf.writestr(f"{table_name}.csv", csv_buf.getvalue())
    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=experiment_db_all_tables.zip"},
    )


# ── Import: restore from JSON backup ─────────────────────────────────────────

@router.post("/import/json")
async def import_json(file: UploadFile = FastAPIFile(...), db: Session = Depends(get_db)):
    """Restore DB from a full JSON backup (skips existing PKs)."""
    content = await file.read()
    try:
        data = json.loads(content)
    except Exception:
        raise HTTPException(400, "Invalid JSON file")

    results: dict = {}
    for table_name, model, pk_field in MODEL_ORDER:
        rows = data.get(table_name, [])
        inserted = skipped = 0
        for row in rows:
            pk_val = row.get(pk_field)
            if pk_val and db.get(model, str(pk_val)):
                skipped += 1
                continue
            if not pk_val:
                row[pk_field] = str(uuid.uuid4())
            else:
                row[pk_field] = str(pk_val)
            filtered = {k: v for k, v in row.items() if hasattr(model, k)}
            try:
                db.add(model(**filtered))
                inserted += 1
            except Exception:
                skipped += 1
        try:
            db.commit()
        except Exception:
            db.rollback()
            skipped += inserted
            inserted = 0
        results[table_name] = {"inserted": inserted, "skipped": skipped}

    return {"message": "Import complete", "details": results}


# ── Import: single table CSV ──────────────────────────────────────────────────

@router.post("/import/csv/{table_name}")
async def import_table_csv(
    table_name: str,
    file: UploadFile = FastAPIFile(...),
    db: Session = Depends(get_db),
):
    """Import a CSV file into a specific table (skips existing PKs)."""
    import csv as csv_module
    entry = TABLE_MAP.get(table_name)
    if not entry:
        raise HTTPException(404, f"Table '{table_name}' not found")
    model, pk_field = entry

    content = (await file.read()).decode("utf-8-sig")
    reader = csv_module.DictReader(io_module.StringIO(content))
    inserted = skipped = 0
    for row in reader:
        row = {k: (v if v != "" else None) for k, v in row.items()}
        pk_val = row.get(pk_field)
        if pk_val and db.get(model, str(pk_val)):
            skipped += 1
            continue
        if not pk_val:
            row[pk_field] = str(uuid.uuid4())
        else:
            row[pk_field] = str(pk_val)
        filtered = {k: v for k, v in row.items() if hasattr(model, k)}
        try:
            db.add(model(**filtered))
            inserted += 1
        except Exception:
            skipped += 1
    try:
        db.commit()
    except Exception:
        db.rollback()
        skipped += inserted
        inserted = 0

    return {"inserted": inserted, "skipped": skipped}


# ── Table list (for frontend) ─────────────────────────────────────────────────

@router.get("/tables")
def list_tables():
    """Return all available table names."""
    return [name for name, _, _ in MODEL_ORDER]

_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "db", "実験.db")
_DB_PATH = os.path.normpath(_DB_PATH)


# ── Export: download raw SQLite DB file ────────────────────────────────────

@router.get("/export/db")
def export_db():
    """Download the SQLite database file."""
    if not os.path.exists(_DB_PATH):
        raise HTTPException(404, "Database file not found")
    return FileResponse(
        path=_DB_PATH,
        media_type="application/octet-stream",
        filename="実験.db",
    )


# ── Import: upload and replace SQLite DB file ──────────────────────────────

@router.post("/import/db")
async def import_db(file: UploadFile = FastAPIFile(...)):
    """Replace the SQLite database file with the uploaded one."""
    # Back up the existing DB first
    backup_path = _DB_PATH + ".bak"
    if os.path.exists(_DB_PATH):
        shutil.copy2(_DB_PATH, backup_path)
    try:
        content = await file.read()
        # Validate it's a SQLite file (magic bytes: SQLite format 3)
        if not content.startswith(b"SQLite format 3"):
            raise HTTPException(400, "Uploaded file does not appear to be a valid SQLite database")
        with open(_DB_PATH, "wb") as f:
            f.write(content)
        return {"message": "Database replaced successfully", "size": len(content)}
    except HTTPException:
        # Restore backup on validation failure
        if os.path.exists(backup_path):
            shutil.copy2(backup_path, _DB_PATH)
        raise
    except Exception as e:
        if os.path.exists(backup_path):
            shutil.copy2(backup_path, _DB_PATH)
        raise HTTPException(500, f"Failed to replace database: {e}")


# ── Merge: add records from another SQLite DB file ────────────────────────────

@router.post("/merge/db")
async def merge_db(file: UploadFile = FastAPIFile(...), db: Session = Depends(get_db)):
    """Merge records from an uploaded SQLite DB into the current DB.

    For each table in dependency order, rows from the uploaded DB whose primary
    key does not already exist in the current DB are inserted. Existing rows are
    never overwritten.
    """
    import sqlite3 as _sqlite3
    import tempfile

    content = await file.read()
    if not content.startswith(b"SQLite format 3"):
        raise HTTPException(400, "Uploaded file does not appear to be a valid SQLite database")

    # Write the uploaded DB to a temp file so sqlite3 can open it
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    results: dict = {}
    try:
        src_conn = _sqlite3.connect(tmp_path)
        src_conn.row_factory = _sqlite3.Row
        src_cur = src_conn.cursor()

        for table_name, model, pk_field in MODEL_ORDER:
            # Check if the table exists in the uploaded DB
            src_cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (model.__tablename__,),
            )
            if not src_cur.fetchone():
                results[table_name] = {"inserted": 0, "skipped": 0, "note": "table not in source"}
                continue

            src_cur.execute(f"SELECT * FROM {model.__tablename__}")
            rows = src_cur.fetchall()
            inserted = skipped = 0
            valid_cols = {c.name for c in model.__table__.columns}

            for row in rows:
                row_dict = dict(row)
                pk_val = row_dict.get(pk_field)
                if pk_val is None:
                    skipped += 1
                    continue
                pk_val = str(pk_val)
                if db.get(model, pk_val):
                    skipped += 1
                    continue
                filtered = {k: v for k, v in row_dict.items() if k in valid_cols}
                filtered[pk_field] = pk_val
                try:
                    db.add(model(**filtered))
                    inserted += 1
                except Exception:
                    skipped += 1

            try:
                db.commit()
            except Exception:
                db.rollback()
                skipped += inserted
                inserted = 0

            results[table_name] = {"inserted": inserted, "skipped": skipped}

        src_conn.close()
    finally:
        os.unlink(tmp_path)

    total_inserted = sum(v["inserted"] for v in results.values())
    total_skipped  = sum(v["skipped"]  for v in results.values())
    return {
        "message": f"Merge complete — {total_inserted} rows added, {total_skipped} skipped",
        "details": results,
    }