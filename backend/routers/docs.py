import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

router = APIRouter()

_DOCS_DIR = os.path.normpath(os.path.join(__file__, "..", "..", "..", "docs"))


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
