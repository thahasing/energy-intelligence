"""
FastAPI API Routes
Handles ingestion, project search, detail, and comparison endpoints.
"""
import asyncio
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
import structlog

from app.models.database import get_db, Project, Document, ExtractedField, SourceReference, IngestionJob
from app.models.schemas import (
    ProjectResponse, ProjectListResponse, IngestRequest, IngestResponse,
    JobStatusResponse, CompareResponse, SearchParams, DocumentSchema
)
from app.services.ingestion_pipeline import IngestionPipeline
from app.services.project_differentiator import ProjectDifferentiationEngine

logger = structlog.get_logger(__name__)
router = APIRouter()
differentiator = ProjectDifferentiationEngine()


# ─── Health ────────────────────────────────────────────────
@router.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ─── Ingestion ─────────────────────────────────────────────
@router.post("/ingest", response_model=IngestResponse, tags=["Ingestion"])
async def trigger_ingestion(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a new ingestion job. Searches SEC EDGAR and extracts project data.
    Returns a job_id to track progress.
    """
    # Create job record
    job = IngestionJob(
        query=request.query,
        status="queued",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Run pipeline in background
    pipeline = IngestionPipeline()
    background_tasks.add_task(
        pipeline.run,
        db=db,
        job_id=job.id,
        query=request.query,
        max_documents=request.max_documents,
        filing_types=request.filing_types,
        date_from=request.date_from or "2020-01-01",
        date_to=request.date_to,
    )

    logger.info("ingestion_triggered", job_id=str(job.id), query=request.query)
    return IngestResponse(
        job_id=job.id,
        status="queued",
        message=f"Ingestion job queued. Track progress at /jobs/{job.id}",
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse, tags=["Ingestion"])
async def get_job_status(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get status of an ingestion job."""
    result = await db.execute(select(IngestionJob).where(IngestionJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        total_documents=job.total_documents,
        processed_documents=job.processed_documents,
        projects_found=job.projects_found,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
    )


@router.get("/jobs", tags=["Ingestion"])
async def list_jobs(
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List recent ingestion jobs."""
    result = await db.execute(
        select(IngestionJob).order_by(IngestionJob.created_at.desc()).limit(limit)
    )
    jobs = result.scalars().all()
    return [
        {
            "job_id": str(j.id),
            "query": j.query,
            "status": j.status,
            "projects_found": j.projects_found,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        }
        for j in jobs
    ]


# ─── Search ────────────────────────────────────────────────
@router.get("/search", tags=["Projects"])
async def search_projects(
    query: Optional[str] = Query(default=None),
    project_type: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    lifecycle_stage: Optional[str] = Query(default=None),
    environmental_approval: Optional[bool] = Query(default=None),
    financing_secured: Optional[bool] = Query(default=None),
    min_capacity_mw: Optional[float] = Query(default=None),
    max_capacity_mw: Optional[float] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Search and filter energy projects.
    Supports full-text search + multiple filters.
    """
    stmt = select(Project)
    conditions = []

    if query:
        conditions.append(
            or_(
                Project.project_name.ilike(f"%{query}%"),
                Project.owner_company.ilike(f"%{query}%"),
                Project.city.ilike(f"%{query}%"),
            )
        )
    if project_type:
        conditions.append(Project.project_type == project_type)
    if state:
        conditions.append(Project.state.ilike(f"%{state}%"))
    if lifecycle_stage:
        conditions.append(Project.lifecycle_stage == lifecycle_stage)
    if environmental_approval is not None:
        conditions.append(Project.environmental_approval == environmental_approval)
    if financing_secured is not None:
        conditions.append(Project.financing_secured == financing_secured)
    if min_capacity_mw is not None:
        conditions.append(Project.capacity_mw >= min_capacity_mw)
    if max_capacity_mw is not None:
        conditions.append(Project.capacity_mw <= max_capacity_mw)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar()

    # Paginate
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    stmt = stmt.order_by(Project.last_updated_at.desc())
    result = await db.execute(stmt)
    projects = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": [_serialize_project(p) for p in projects],
    }


# ─── Project Detail ────────────────────────────────────────
@router.get("/project/{project_id}", tags=["Projects"])
async def get_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Get full project details including extracted fields and source references.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get extracted fields
    ef_result = await db.execute(
        select(ExtractedField).where(ExtractedField.project_id == project_id)
    )
    fields = ef_result.scalars().all()

    # Get source references
    sr_result = await db.execute(
        select(SourceReference).where(SourceReference.project_id == project_id)
    )
    sources = sr_result.scalars().all()

    # Get document
    doc = None
    if project.document_id:
        doc_result = await db.execute(select(Document).where(Document.id == project.document_id))
        doc = doc_result.scalar_one_or_none()

    # Build per-field sources map
    field_sources = {}
    for source in sources:
        ef_id = str(source.extracted_field_id)
        if ef_id not in field_sources:
            field_sources[ef_id] = []
        field_sources[ef_id].append({
            "id": str(source.id),
            "source_url": source.source_url,
            "page_number": source.page_number,
            "paragraph_number": source.paragraph_number,
            "line_start": source.line_start,
            "line_end": source.line_end,
            "exact_snippet": source.exact_snippet,
            "snippet_context": source.snippet_context,
        })

    extracted_fields = []
    for ef in fields:
        extracted_fields.append({
            "id": str(ef.id),
            "field_name": ef.field_name,
            "field_value": ef.field_value,
            "confidence_score": ef.confidence_score,
            "extraction_method": ef.extraction_method,
            "sources": field_sources.get(str(ef.id), []),
        })

    return {
        **_serialize_project(project),
        "extracted_fields": extracted_fields,
        "document": {
            "id": str(doc.id) if doc else None,
            "url": doc.url if doc else None,
            "filing_type": doc.filing_type if doc else None,
            "company_name": doc.company_name if doc else None,
            "filed_date": doc.filed_date.isoformat() if doc and doc.filed_date else None,
        } if doc else None,
    }


# ─── Compare ───────────────────────────────────────────────
@router.get("/compare/{project_name}", tags=["Projects"])
async def compare_project_variants(
    project_name: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Find all projects with similar names and compare them.
    Identifies whether they are the same project (updates) or different projects.
    """
    # Find all projects matching the name
    result = await db.execute(
        select(Project).where(Project.project_name.ilike(f"%{project_name}%"))
    )
    projects = result.scalars().all()

    if not projects:
        raise HTTPException(status_code=404, detail="No projects found with that name")

    project_dicts = [_serialize_project(p) for p in projects]

    if len(project_dicts) == 1:
        return {
            "project_name": project_name,
            "total_variants": 1,
            "variants": project_dicts,
            "llm_analysis": "Only one record found — no comparison needed.",
            "similarity_score": 1.0,
            "is_same_project": True,
        }

    # Run comparison
    comparison = await differentiator.analyze_group(project_dicts)

    return {
        "project_name": project_name,
        "total_variants": len(project_dicts),
        "variants": project_dicts,
        "llm_analysis": comparison.get("explanation", ""),
        "key_differences": comparison.get("key_differences", []),
        "similarity_score": comparison.get("similarity_score", 0.0),
        "is_same_project": comparison.get("is_same_project"),
        "recommendation": comparison.get("recommendation", ""),
    }


# ─── Stats ─────────────────────────────────────────────────
@router.get("/stats", tags=["Analytics"])
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get aggregate statistics about the project database."""
    total_projects = await db.execute(select(func.count(Project.id)))
    total_docs = await db.execute(select(func.count(Document.id)))

    type_counts = await db.execute(
        select(Project.project_type, func.count(Project.id))
        .group_by(Project.project_type)
    )
    state_counts = await db.execute(
        select(Project.state, func.count(Project.id))
        .group_by(Project.state)
        .order_by(func.count(Project.id).desc())
        .limit(10)
    )
    lifecycle_counts = await db.execute(
        select(Project.lifecycle_stage, func.count(Project.id))
        .group_by(Project.lifecycle_stage)
    )

    return {
        "total_projects": total_projects.scalar(),
        "total_documents": total_docs.scalar(),
        "by_type": {row[0] or "unknown": row[1] for row in type_counts.all()},
        "top_states": {row[0] or "unknown": row[1] for row in state_counts.all()},
        "by_lifecycle": {row[0] or "unknown": row[1] for row in lifecycle_counts.all()},
    }


# ─── Documents ─────────────────────────────────────────────
@router.get("/documents", tags=["Documents"])
async def list_documents(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List ingested documents."""
    stmt = select(Document).order_by(Document.ingested_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(Document.status == status)
    result = await db.execute(stmt)
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "url": d.url,
            "company_name": d.company_name,
            "filing_type": d.filing_type,
            "filed_date": d.filed_date.isoformat() if d.filed_date else None,
            "status": d.status,
            "ingested_at": d.ingested_at.isoformat() if d.ingested_at else None,
        }
        for d in docs
    ]


# ─── Helpers ───────────────────────────────────────────────
def _serialize_project(p: Project) -> dict:
    return {
        "id": str(p.id),
        "project_name": p.project_name,
        "project_type": p.project_type,
        "owner_company": p.owner_company,
        "city": p.city,
        "state": p.state,
        "country": p.country,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "location_confidence": p.location_confidence,
        "capacity_mw": p.capacity_mw,
        "lifecycle_stage": p.lifecycle_stage,
        "environmental_approval": p.environmental_approval,
        "environmental_approval_date": p.environmental_approval_date.isoformat() if p.environmental_approval_date else None,
        "grid_connection_approval": p.grid_connection_approval,
        "financing_secured": p.financing_secured,
        "financing_amount_usd": p.financing_amount_usd,
        "financing_details": p.financing_details,
        "predicted_lifecycle_stage": p.predicted_lifecycle_stage,
        "lifecycle_prediction_confidence": p.lifecycle_prediction_confidence,
        "overall_confidence": p.overall_confidence,
        "first_seen_at": p.first_seen_at.isoformat() if p.first_seen_at else None,
        "last_updated_at": p.last_updated_at.isoformat() if p.last_updated_at else None,
        "document_id": str(p.document_id) if p.document_id else None,
    }

@router.get("/projects/{project_id}", tags=["Projects"])
async def get_project_detail(project_id: str, db: AsyncSession = Depends(get_db)):
    from uuid import UUID
    try:
        pid = UUID(project_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    result = await db.execute(select(Project).where(Project.id == pid))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    doc = None
    if project.document_id:
        doc_result = await db.execute(select(Document).where(Document.id == project.document_id))
        doc = doc_result.scalar_one_or_none()
    
    ef_result = await db.execute(select(ExtractedField).where(ExtractedField.project_id == pid))
    fields = ef_result.scalars().all()
    
    sr_result = await db.execute(select(SourceReference).where(SourceReference.project_id == pid))
    sources = sr_result.scalars().all()
    
    sources_by_field = {}
    for src in sources:
        fid = str(src.extracted_field_id)
        if fid not in sources_by_field:
            sources_by_field[fid] = []
        sources_by_field[fid].append({
            "id": str(src.id),
            "source_url": src.source_url,
            "page_number": src.page_number,
            "line_start": src.line_start,
            "line_end": src.line_end,
            "exact_snippet": src.exact_snippet,
        })
    
    extracted_fields = [{
        "id": str(ef.id),
        "field_name": ef.field_name,
        "field_value": ef.field_value,
        "confidence_score": ef.confidence_score,
        "sources": sources_by_field.get(str(ef.id), [])
    } for ef in fields]
    
    return {
        "id": str(project.id),
        "project_name": project.project_name,
        "project_type": project.project_type,
        "owner_company": project.owner_company,
        "city": project.city,
        "state": project.state,
        "country": project.country,
        "latitude": project.latitude,
        "longitude": project.longitude,
        "capacity_mw": project.capacity_mw,
        "lifecycle_stage": project.lifecycle_stage,
        "environmental_approval": project.environmental_approval,
        "grid_connection_approval": project.grid_connection_approval,
        "financing_secured": project.financing_secured,
        "financing_amount_usd": project.financing_amount_usd,
        "overall_confidence": project.overall_confidence,
        "first_seen_at": project.first_seen_at.isoformat() if project.first_seen_at else None,
        "last_updated_at": project.last_updated_at.isoformat() if project.last_updated_at else None,
        "document": {
            "id": str(doc.id),
            "url": doc.url,
            "filing_type": doc.filing_type,
            "company_name": doc.company_name,
            "filed_date": doc.filed_date.isoformat() if doc.filed_date else None,
        } if doc else None,
        "extracted_fields": extracted_fields,
    }
