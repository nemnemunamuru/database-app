import json
import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

MASTER_DB = "experiment.db"
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "db"))
CONFIG_PATH = os.path.join(DB_DIR, "config.json")


def _load_last_db() -> str:
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f).get("last_db", MASTER_DB)
    except Exception:
        return MASTER_DB


def _save_last_db(name: str) -> None:
    os.makedirs(DB_DIR, exist_ok=True)
    cfg: dict = {}
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        pass
    cfg["last_db"] = name
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


_current_db_name: str = _load_last_db()


def _make_engine(db_name: str):
    path = os.path.join(DB_DIR, db_name)
    return create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})


engine = _make_engine(_current_db_name)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_current_db_name() -> str:
    return _current_db_name


def get_current_db_path() -> str:
    return os.path.join(DB_DIR, _current_db_name)


def switch_db(db_name: str) -> None:
    global engine, SessionLocal, _current_db_name
    engine.dispose()
    engine = _make_engine(db_name)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _current_db_name = db_name
    _save_last_db(db_name)
    init_db()


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from backend.models import Base
    Base.metadata.create_all(bind=engine)
    _migrate()


_CUSTOM_COL_TYPE_MAP = {
    "string": "TEXT", "text": "TEXT", "uuid": "TEXT",
    "float": "REAL", "integer": "INTEGER", "boolean": "INTEGER",
    "date": "TEXT", "datetime": "TEXT",
}


def _migrate_experiment_custom_cols(conn, existing_cols: set) -> None:
    """Add any non-pk/fk columns from column_defs(EXPERIMENT) to the experiment table."""
    try:
        rows = conn.execute(text(
            "SELECT column_name, data_type FROM column_def"
            " WHERE table_name='EXPERIMENT' AND (is_id = '' OR is_id IS NULL)"
        )).fetchall()
        for col_name, data_type in rows:
            if col_name not in existing_cols:
                sql_type = _CUSTOM_COL_TYPE_MAP.get(data_type or "", "TEXT")
                conn.execute(text(f'ALTER TABLE experiment ADD COLUMN "{col_name}" {sql_type}'))
                conn.commit()
                existing_cols.add(col_name)
    except Exception:
        pass  # column_def table may not exist yet on first run


def _migrate():
    """Apply incremental schema changes to existing DB without losing data."""
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(experiment)"))}
        if "project_id" not in cols:
            conn.execute(text("ALTER TABLE experiment ADD COLUMN project_id TEXT REFERENCES project(project_id)"))
            conn.commit()
            cols.add("project_id")
        # Auto-add custom columns defined in column_defs for EXPERIMENT table
        _migrate_experiment_custom_cols(conn, cols)
