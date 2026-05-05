from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from backend.database import init_db
from backend.settings_database import init_settings_db
from backend.routers import experiments, masters, io, settings, docs, projects
from backend.routers import db_config, chat

app = FastAPI(title="Laser Experiment Database API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    init_settings_db()
    # Sync trajectory type defs from column_def candidates
    from backend.database import SessionLocal
    from backend.routers.masters import sync_trajectory_type_defs
    _db = SessionLocal()
    try:
        sync_trajectory_type_defs(_db)
    finally:
        _db.close()


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/")
def root():
    return {"message": "Laser Experiment Database API is running"}


app.include_router(experiments.router, prefix="/api/experiments", tags=["experiments"])
app.include_router(masters.router, prefix="/api/masters", tags=["masters"])
app.include_router(io.router, prefix="/api/io", tags=["io"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(docs.router, prefix="/api/docs", tags=["docs"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(db_config.router, prefix="/api/db", tags=["db"])

