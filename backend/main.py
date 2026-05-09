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

@app.post("/api/v1/research/find-source")
async def find_source(request: dict):
    """Use Groq to find real source URL for a project"""
    import httpx
    name = request.get('project_name', '')
    company = (request.get('owner_company') or '').split(',')[0].strip()
    state = request.get('state', '')
    cap = request.get('capacity_mw', '')
    ptype = request.get('project_type', '')
    
    groq_key = os.environ.get('GROQ_API_KEY', '')
    
    prompt = f"""Search the web and find the most relevant official URL for this renewable energy project:

Project: "{name}"
Owner: "{company}"
Capacity: {cap} MW
State: {state}
Type: {ptype}

Based on your knowledge, what is the most likely URL for the official project page, press release, or news article about this specific project?

Return ONLY this JSON object:
{{"url": "https://...", "title": "page title", "source": "website name", "snippet": "1 sentence about this project from that page"}}

If you don't know a specific URL, return: {{"url": null}}"""

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": prompt}], "temperature": 0.1, "max_tokens": 500},
                timeout=15
            )
            data = r.json()
            text = data["choices"][0]["message"]["content"].strip()
            import re, json
            m = re.search(r'\{.*?\}', text, re.DOTALL)
            if m:
                result = json.loads(m.group())
                return result
    except Exception as e:
        pass
    return {"url": None}
