from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import init_db
from backend.settings_database import init_settings_db
from backend.routers import experiments, masters, io, settings, docs

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


@app.get("/")
def root():
    return {"message": "Laser Experiment Database API is running"}


app.include_router(experiments.router, prefix="/api/experiments", tags=["experiments"])
app.include_router(masters.router, prefix="/api/masters", tags=["masters"])
app.include_router(io.router, prefix="/api/io", tags=["io"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(docs.router, prefix="/api/docs", tags=["docs"])

