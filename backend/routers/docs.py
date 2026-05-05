import os
import re
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

    # Group columns by table (strip table name whitespace)
    tables: dict[str, list[ColumnDef]] = defaultdict(list)
    for r in rows:
        tables[r.table_name.strip()].append(r)

    def _safe_id(s: str) -> str:
        """Sanitize an identifier: strip, collapse whitespace to underscore, remove invalid chars."""
        s = s.strip()
        s = re.sub(r"\s+", "_", s)          # internal spaces → _
        s = re.sub(r"[^\w]", "_", s)        # non-word chars → _
        s = re.sub(r"_+", "_", s)           # collapse multiple _
        return s.strip("_") or "unknown"

    # Collect FK relationships using sanitized names
    # pk_columns maps column_name → list of owner tables (polymorphic: multiple tables share same PK name)
    pk_columns: dict[str, list[str]] = defaultdict(list)
    for tname, cols in tables.items():
        safe_tname = _safe_id(tname)
        for c in cols:
            if c.is_id == "pk":
                pk_columns[_safe_id(c.column_name)].append(safe_tname)

    # Special-case: trajectory parameter FKs omit "type" in the column name
    # e.g. FK main_trajectory_parameter_id → PK main_trajectory_type_parameter_id
    FK_ALIAS: dict[str, str] = {
        "main_trajectory_parameter_id": "main_trajectory_type_parameter_id",
        "sub_trajectory_parameter_id":  "sub_trajectory_type_parameter_id",
    }

    def _find_pk_tables(fk_col: str) -> list[str]:
        resolved = FK_ALIAS.get(fk_col, fk_col)
        return pk_columns.get(resolved, [])

    lines = ["erDiagram"]

    # Entity blocks
    for tname, cols in sorted(tables.items()):
        safe_tname = _safe_id(tname)
        lines.append(f"    {safe_tname} {{")
        seen_attrs: set[str] = set()
        for c in cols:
            dtype = _safe_id(c.data_type or "string")
            cname = _safe_id(c.column_name or "col")
            attr_key = f"{dtype}_{cname}"
            if attr_key in seen_attrs:
                continue
            seen_attrs.add(attr_key)
            if c.is_id == "pk":
                lines.append(f"        {dtype} {cname} PK")
            elif c.is_id == "fk":
                lines.append(f"        {dtype} {cname} FK")
            else:
                lines.append(f"        {dtype} {cname}")
        lines.append("    }")
        lines.append("")

    # Relationship lines (FK → PK owner, supports polymorphic: one FK → multiple PK tables)
    seen_rels: set[tuple[str, str]] = set()
    for tname, cols in sorted(tables.items()):
        safe_tname = _safe_id(tname)
        for c in cols:
            if c.is_id == "fk":
                targets = _find_pk_tables(_safe_id(c.column_name))
                for target in targets:
                    if target != safe_tname:
                        key = (safe_tname, target)
                        if key not in seen_rels:
                            seen_rels.add(key)
                            lines.append(f'    {safe_tname} }}o--|| {target} : "ref"')

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
