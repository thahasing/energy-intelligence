"""
Energy Project Intelligence Engine - FastAPI Application
"""
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.api.routes import router
from app.api.chatbot import chatbot_router
from app.models.database import engine, Base

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("startup", env=settings.APP_ENV)
    # Create tables if not exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("database_ready")

    # Load RAG index if it exists
    try:
        from app.services.rag_service import rag_service
        rag_service.load_index()
    except Exception as e:
        logger.warning("rag_load_skipped", error=str(e))

    yield

    # Save RAG index on shutdown
    try:
        from app.services.rag_service import rag_service
        rag_service.save_index()
    except Exception as e:
        logger.warning("rag_save_failed", error=str(e))

    logger.info("shutdown")


app = FastAPI(
    title="Energy Project Intelligence Engine",
    description="Extract, analyze, and track renewable energy projects from SEC EDGAR filings",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Middleware ────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ─── Routes ────────────────────────────────────────────────
app.include_router(router, prefix="/api/v1")
app.include_router(chatbot_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "name": "Energy Project Intelligence Engine",
        "version": "1.0.0",
        "docs": "/docs",
        "api": "/api/v1",
    }
