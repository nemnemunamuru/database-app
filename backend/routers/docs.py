import os
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ColumnDef

router = APIRouter()

_DOCS_DIR = os.path.normpath(os.path.join(__file__, "..", "..", "..", "docs"))


@router.get("/er_diagram_live", response_class=PlainTextResponse)
def er_diagram_live(db: Session = Depends(get_db)):
    """Generate a Mermaid ER diagram from the current column_def table."""
    rows = db.query(ColumnDef).order_by(ColumnDef.table_name, ColumnDef.order_index).all()

    # Group columns by table
    tables: dict[str, list[ColumnDef]] = defaultdict(list)
    for r in rows:
        tables[r.table_name].append(r)

    # Collect FK relationships
    # pk rows define the target table; fk rows in another table reference it
    pk_columns: dict[str, str] = {}  # column_name → owner table
    for tname, cols in tables.items():
        for c in cols:
            if c.is_id == "pk":
                pk_columns[c.column_name] = tname

    # Special-case: trajectory parameter FKs omit "type" in the column name
    # e.g. FK main_trajectory_parameter_id → PK main_trajectory_type_parameter_id
    FK_ALIAS: dict[str, str] = {
        "main_trajectory_parameter_id": "main_trajectory_type_parameter_id",
        "sub_trajectory_parameter_id":  "sub_trajectory_type_parameter_id",
    }

    def _find_pk_table(fk_col: str) -> str | None:
        resolved = FK_ALIAS.get(fk_col, fk_col)
        return pk_columns.get(resolved)

    lines = ["erDiagram"]

    # Entity blocks
    for tname, cols in sorted(tables.items()):
        lines.append(f"    {tname} {{")
        for c in cols:
            dtype = (c.data_type or "string").strip()
            cname = (c.column_name or "").strip()
            if c.is_id == "pk":
                lines.append(f"        {dtype} {cname} PK")
            elif c.is_id == "fk":
                lines.append(f"        {dtype} {cname} FK")
            else:
                lines.append(f"        {dtype} {cname}")
        lines.append("    }")
        lines.append("")

    # Relationship lines (FK → PK owner)
    seen_rels: set[tuple[str, str]] = set()
    for tname, cols in sorted(tables.items()):
        for c in cols:
            if c.is_id == "fk":
                target = _find_pk_table(c.column_name)
                if target and target != tname:
                    key = (tname, target)
                    if key not in seen_rels:
                        seen_rels.add(key)
                        lines.append(f"    {tname} }}o--|| {target} : \"\"")

    content = "\n".join(lines)

    # Persist to docs/er_diagram.mmd so the static file stays in sync
    mmd_path = os.path.join(_DOCS_DIR, "er_diagram.mmd")
    with open(mmd_path, "w", encoding="utf-8") as f:
        f.write(content)

    return content


@router.get("/{filename}", response_class=PlainTextResponse)
def get_doc_file(filename: str):
    """Serve a file from the docs/ directory as plain text."""
    # Prevent path traversal
    safe_name = os.path.basename(filename)
    path = os.path.join(_DOCS_DIR, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"File '{safe_name}' not found in docs/")
    with open(path, encoding="utf-8") as f:
        return f.read()
