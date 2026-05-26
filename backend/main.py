import os
from pathlib import Path

# mimetypes に依存せず直接指定（Windows レジストリ問題を回避）
_MIME: dict[str, str] = {
    ".html": "text/html",
    ".js":   "application/javascript",
    ".mjs":  "application/javascript",
    ".css":  "text/css",
    ".json": "application/json",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico":  "image/x-icon",
    ".woff": "font/woff",
    ".woff2":"font/woff2",
    ".ttf":  "font/ttf",
    ".eot":  "application/vnd.ms-fontobject",
    ".map":  "application/json",
}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from backend.database import init_db
from backend.settings_database import init_settings_db
from backend.routers import experiments, masters, io, settings, docs, projects, chat
from backend.routers import db_config, oct

app = FastAPI(title="Laser Experiment Database API")

_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    init_settings_db()


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


app.include_router(experiments.router, prefix="/api/experiments", tags=["experiments"])
app.include_router(masters.router, prefix="/api/masters", tags=["masters"])
app.include_router(io.router, prefix="/api/io", tags=["io"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(docs.router, prefix="/api/docs", tags=["docs"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(db_config.router, prefix="/api/db", tags=["db"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(oct.router, prefix="/api/oct", tags=["oct"])

# Serve built React app if frontend/dist exists (production / deployed mode)
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    @app.get("/", include_in_schema=False)
    def root():
        return FileResponse(str(_dist / "index.html"), media_type="text/html")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        file = _dist / full_path
        if file.is_file():
            media_type = _MIME.get(file.suffix.lower(), "application/octet-stream")
            return FileResponse(str(file), media_type=media_type)
        return FileResponse(str(_dist / "index.html"), media_type="text/html")
else:
    @app.get("/")
    def root():
        return {"message": "Laser Experiment Database API is running"}

