from sqlalchemy import create_engine, Column, Integer, String, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone
import os

# Ensure data directory exists
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
os.makedirs(DB_DIR, exist_ok=True)

DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'app.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    file_path = Column(String)
    pratica_name = Column(String, index=True, nullable=True)
    label = Column(String, default="UNKNOWN")
    category = Column(String, default="Generale")
    status = Column(String, default="completed") # pending, processing, completed, failed
    extracted_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class CrossAnalysis(Base):
    __tablename__ = "cross_analyses"

    id = Column(Integer, primary_key=True, index=True)
    pratica_name = Column(String, index=True)
    rules_prompt = Column(String)
    analysis_result = Column(String) # Markdown text
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class AnalysisPreset(Base):
    __tablename__ = "analysis_presets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    rules_json = Column(JSON) # List of {name: "", logic: ""}
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# Create tables
Base.metadata.create_all(bind=engine)
