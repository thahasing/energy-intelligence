"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from uuid import UUID
from enum import Enum


class ProjectType(str, Enum):
    solar = "solar"
    wind = "wind"
    battery = "battery"
    hydro = "hydro"
    geothermal = "geothermal"
    hybrid = "hybrid"
    unknown = "unknown"


class LifecycleStage(str, Enum):
    planned = "planned"
    approved = "approved"
    under_construction = "under_construction"
    operational = "operational"
    decommissioned = "decommissioned"
    unknown = "unknown"


# ─── Source Reference ──────────────────────────────────────
class SourceReferenceSchema(BaseModel):
    id: UUID
    source_url: str
    page_number: Optional[int] = None
    paragraph_number: Optional[int] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    exact_snippet: str
    snippet_context: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Extracted Field ───────────────────────────────────────
class ExtractedFieldSchema(BaseModel):
    id: UUID
    field_name: str
    field_value: Optional[str]
    confidence_score: Optional[float]
    extraction_method: str
    sources: List[SourceReferenceSchema] = []

    class Config:
        from_attributes = True


# ─── Project Schemas ───────────────────────────────────────
class ProjectBase(BaseModel):
    project_name: str
    project_type: Optional[ProjectType] = None
    owner_company: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = "USA"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capacity_mw: Optional[float] = None
    lifecycle_stage: Optional[LifecycleStage] = None
    environmental_approval: Optional[bool] = None
    environmental_approval_date: Optional[date] = None
    grid_connection_approval: Optional[bool] = None
    financing_secured: Optional[bool] = None
    financing_amount_usd: Optional[int] = None
    financing_details: Optional[str] = None
    overall_confidence: Optional[float] = None


class ProjectCreate(ProjectBase):
    document_id: Optional[UUID] = None


class ProjectResponse(ProjectBase):
    id: UUID
    first_seen_at: datetime
    last_updated_at: datetime
    predicted_lifecycle_stage: Optional[str] = None
    lifecycle_prediction_confidence: Optional[float] = None
    extracted_fields: List[ExtractedFieldSchema] = []
    document_url: Optional[str] = None
    filed_date: Optional[date] = None

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: List[ProjectResponse]


# ─── Project Variant / Comparison ──────────────────────────
class ProjectVariantSchema(BaseModel):
    id: UUID
    canonical_project: ProjectResponse
    variant_project: ProjectResponse
    similarity_score: float
    is_same_project: bool
    difference_explanation: str

    class Config:
        from_attributes = True


class CompareResponse(BaseModel):
    project_name: str
    total_variants: int
    variants: List[Dict[str, Any]]
    llm_analysis: str


# ─── Document ──────────────────────────────────────────────
class DocumentSchema(BaseModel):
    id: UUID
    url: str
    filing_type: Optional[str]
    company_name: Optional[str]
    cik: Optional[str]
    filed_date: Optional[date]
    status: str
    page_count: Optional[int]

    class Config:
        from_attributes = True


# ─── Ingestion ─────────────────────────────────────────────
class IngestRequest(BaseModel):
    query: str = Field(..., description="Search query for SEC EDGAR", example="solar energy project")
    max_documents: int = Field(default=20, ge=1, le=200)
    filing_types: List[str] = Field(default=["10-K", "8-K", "S-1", "DEF 14A"])
    date_from: Optional[str] = Field(default="2020-01-01")
    date_to: Optional[str] = None


class IngestResponse(BaseModel):
    job_id: UUID
    status: str
    message: str


class JobStatusResponse(BaseModel):
    job_id: UUID
    status: str
    total_documents: int
    processed_documents: int
    projects_found: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]


# ─── Search ────────────────────────────────────────────────
class SearchParams(BaseModel):
    query: str
    project_type: Optional[ProjectType] = None
    state: Optional[str] = None
    lifecycle_stage: Optional[LifecycleStage] = None
    environmental_approval: Optional[bool] = None
    financing_secured: Optional[bool] = None
    min_capacity_mw: Optional[float] = None
    max_capacity_mw: Optional[float] = None
    page: int = 1
    page_size: int = 20


# ─── LLM Extraction Result ─────────────────────────────────
class LLMExtractionResult(BaseModel):
    project_name: Optional[str] = None
    project_type: Optional[str] = None
    owner_company: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capacity_mw: Optional[float] = None
    lifecycle_stage: Optional[str] = None
    environmental_approval: Optional[bool] = None
    environmental_approval_date: Optional[str] = None
    grid_connection_approval: Optional[bool] = None
    financing_secured: Optional[bool] = None
    financing_amount_usd: Optional[int] = None
    financing_details: Optional[str] = None
    confidence_scores: Dict[str, float] = {}
    source_snippets: Dict[str, str] = {}
    raw_text_used: Optional[str] = None
