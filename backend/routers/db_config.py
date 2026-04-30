import os

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi import File as FastAPIFile
from pydantic import BaseModel

from backend.database import DB_DIR, MASTER_DB, get_current_db_name, switch_db

router = APIRouter()


@router.get("/info")
def get_db_info():
    current = get_current_db_name()
    available: list[str] = []
    try:
        for f in sorted(os.listdir(DB_DIR)):
            if f.endswith(".db") and os.path.isfile(os.path.join(DB_DIR, f)):
                available.append(f)
    except Exception:
        pass
    return {
        "db_name": current,
        "is_master": current == MASTER_DB,
        "master_db": MASTER_DB,
        "available": available,
    }


class SwitchRequest(BaseModel):
    db_name: str


@router.post("/switch")
def switch_to_db(req: SwitchRequest):
    name = req.db_name
    if os.sep in name or "/" in name or not name.endswith(".db"):
        raise HTTPException(400, "Invalid database name")
    db_path = os.path.join(DB_DIR, name)
    if not os.path.isfile(db_path):
        raise HTTPException(404, f"Database '{name}' not found")
    switch_db(name)
    current = get_current_db_name()
    return {"db_name": current, "is_master": current == MASTER_DB}


@router.post("/open")
async def open_db_file(file: UploadFile = FastAPIFile(...)):
    """Upload a .db file and use it as the active database."""
    name = os.path.basename(file.filename or "")
    if not name.endswith(".db"):
        raise HTTPException(400, "File must be a .db file")
    content = await file.read()
    if not content.startswith(b"SQLite format 3"):
        raise HTTPException(400, "Not a valid SQLite database")
    dest = os.path.join(DB_DIR, name)
    with open(dest, "wb") as f:
        f.write(content)
    switch_db(name)
    current = get_current_db_name()
    return {"db_name": current, "is_master": current == MASTER_DB}
