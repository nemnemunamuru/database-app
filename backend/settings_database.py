from sqlalchemy import Column, Integer, String, Text, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

SETTINGS_DATABASE_URL = "sqlite:///./db/setting.db"

engine = create_engine(SETTINGS_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class SettingsBase(DeclarativeBase):
    pass


class Setting(SettingsBase):
    __tablename__ = "setting"
    key   = Column(String, primary_key=True)
    value = Column(Text)


class ReportConfig(SettingsBase):
    __tablename__ = "report_config"
    project_id    = Column(String, primary_key=True)
    hidden_fields = Column(Text, default="[]")   # JSON array of field keys to hide
    layout_mode   = Column(String, default="sectioned")
    chart_columns = Column(Integer, default=2)
    chart_width   = Column(Integer, default=640)


def init_settings_db():
    SettingsBase.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(report_config)"))}
        if "layout_mode" not in cols:
            conn.execute(text("ALTER TABLE report_config ADD COLUMN layout_mode TEXT DEFAULT 'sectioned'"))
            conn.commit()
        if "chart_columns" not in cols:
            conn.execute(text("ALTER TABLE report_config ADD COLUMN chart_columns INTEGER DEFAULT 2"))
            conn.commit()
        if "chart_width" not in cols:
            conn.execute(text("ALTER TABLE report_config ADD COLUMN chart_width INTEGER DEFAULT 640"))
            conn.commit()


def get_settings_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
