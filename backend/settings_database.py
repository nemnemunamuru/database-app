from sqlalchemy import Column, String, Text, create_engine
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


def init_settings_db():
    SettingsBase.metadata.create_all(bind=engine)


def get_settings_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
