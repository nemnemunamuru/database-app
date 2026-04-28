from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from backend.settings_database import Setting, get_settings_db

router = APIRouter()


@router.get("/")
def get_all_settings(db: Session = Depends(get_settings_db)):
    """Return all settings as a key→value dict."""
    return {s.key: s.value for s in db.query(Setting).all()}


@router.get("/{key}")
def get_setting(key: str, db: Session = Depends(get_settings_db)):
    s = db.get(Setting, key)
    return {"key": key, "value": s.value if s else None}


@router.put("/{key}")
def upsert_setting(key: str, body: dict = Body(...), db: Session = Depends(get_settings_db)):
    """Create or update a setting value."""
    s = db.get(Setting, key)
    if s is None:
        s = Setting(key=key)
        db.add(s)
    s.value = body.get("value")
    db.commit()
    db.refresh(s)
    return {"key": s.key, "value": s.value}
