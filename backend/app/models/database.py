"""
Database connection management and SQLAlchemy async setup.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, Text, Boolean, Float, Integer, DateTime, Date, BigInteger, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
import uuid
from datetime import datetime
from typing import AsyncGenerator
from app.config import settings


# ─── Engine & Session ──────────────────────────────────────
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
    pool_recycle=1800,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ─── Base ──────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─── Models ────────────────────────────────────────────────
class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url = Column(Text, nullable=False, unique=True)
    filing_type = Column(String(50))
    company_name = Column(Text)
    cik = Column(String(20))
    accession_number = Column(String(30))
    filed_date = Column(Date)
    raw_html = Column(Text)
    raw_text = Column(Text)
    pdf_path = Column(Text)
    page_count = Column(Integer)
    ingested_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime)
    status = Column(String(20), default="pending")
    error_message = Column(Text)


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_name = Column(Text, nullable=False)
    project_name_normalized = Column(Text)
    project_type = Column(String(30))
    owner_company = Column(Text)
    city = Column(Text)
    state = Column(Text)
    country = Column(Text, default="USA")
    latitude = Column(Float)
    longitude = Column(Float)
    location_confidence = Column(Float)
    capacity_mw = Column(Float)
    lifecycle_stage = Column(String(30))
    environmental_approval = Column(Boolean)
    environmental_approval_date = Column(Date)
    grid_connection_approval = Column(Boolean)
    grid_connection_date = Column(Date)
    financing_secured = Column(Boolean)
    financing_amount_usd = Column(BigInteger)
    financing_details = Column(Text)
    predicted_lifecycle_stage = Column(String(30))
    lifecycle_prediction_confidence = Column(Float)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    last_updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"))
    overall_confidence = Column(Float, default=0.0)


class ProjectVariant(Base):
    __tablename__ = "project_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"))
    variant_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"))
    similarity_score = Column(Float)
    is_same_project = Column(Boolean)
    difference_explanation = Column(Text)
    compared_at = Column(DateTime, default=datetime.utcnow)


class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    field_name = Column(String(100), nullable=False)
    field_value = Column(Text)
    confidence_score = Column(Float)
    extraction_method = Column(String(50), default="llm")
    extracted_at = Column(DateTime, default=datetime.utcnow)


class SourceReference(Base):
    __tablename__ = "source_references"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    extracted_field_id = Column(UUID(as_uuid=True), ForeignKey("extracted_fields.id", ondelete="CASCADE"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"))
    source_url = Column(Text, nullable=False)
    page_number = Column(Integer)
    paragraph_number = Column(Integer)
    line_start = Column(Integer)
    line_end = Column(Integer)
    exact_snippet = Column(Text, nullable=False)
    snippet_context = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query = Column(Text, nullable=False)
    status = Column(String(20), default="queued")
    total_documents = Column(Integer, default=0)
    processed_documents = Column(Integer, default=0)
    projects_found = Column(Integer, default=0)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
