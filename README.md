# ⚡ Energy Project Intelligence Engine

> Extract, analyze, and track renewable energy projects from SEC EDGAR filings with full source traceability.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    INGESTION PIPELINE                    │
│                                                          │
│  SEC EDGAR ──► Scraper ──► Doc Processor ──► LLM        │
│                                  │              │        │
│                               Chunks        Extracts    │
│                                  │              │        │
│                              FAISS RAG    Structured JSON│
│                                  └──────────────┘        │
│                                        │                 │
│                                   PostgreSQL             │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                     API LAYER (FastAPI)                  │
│  /search  /project/:id  /compare/:name  /ingest  /jobs  │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                     │
│  Dashboard │ Search │ Project Detail │ Compare │ Monitor │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- OpenAI API key

### 1. Clone & Configure
```bash
git clone https://github.com/yourorg/energy-intelligence
cd energy-intelligence

# Copy env file and fill in your keys
cp .env.example .env
# Edit .env:
#   OPENAI_API_KEY=sk-...
#   OPENCAGE_API_KEY=...   (optional, for precise geocoding)
```

### 2. Database Setup
```bash
# Create database
psql -U postgres -c "CREATE DATABASE energy_intelligence;"

# Run schema
psql -U postgres -d energy_intelligence -f database/schema.sql
```

### 3. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Start server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 5. Docker (Alternative)
```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

---

## CLI Ingestion

Run directly without the API server:

```bash
cd backend

# Single query
python ../scripts/ingestion.py --query "solar energy project California" --max 20

# Multiple filing types
python ../scripts/ingestion.py \
  --query "wind farm project" \
  --max 50 \
  --types 10-K 8-K S-1 \
  --date-from 2021-01-01 \
  --verbose

# Sweep all keyword presets
python ../scripts/ingestion.py --all-keywords --max 10
```

---

## API Reference

Base URL: `http://localhost:8000/api/v1`

### Trigger Ingestion
```http
POST /ingest
{
  "query": "solar energy project",
  "max_documents": 20,
  "filing_types": ["10-K", "8-K", "S-1"],
  "date_from": "2020-01-01"
}
```
→ Returns `{ "job_id": "uuid", "status": "queued" }`

### Check Job Status
```http
GET /jobs/{job_id}
```
→ Returns progress: documents processed, projects found, status.

### Search Projects
```http
GET /search?query=solar&project_type=solar&state=CA&environmental_approval=true&page=1
```
Filters: `query`, `project_type`, `state`, `lifecycle_stage`, `environmental_approval`, `financing_secured`, `min_capacity_mw`, `max_capacity_mw`

### Project Detail (with sources)
```http
GET /project/{id}
```
Returns full project record + all extracted fields + per-field source citations.

Each field includes:
- `exact_snippet` — verbatim text from the filing
- `source_url` — link to the SEC EDGAR document
- `page_number` — page in PDF (if applicable)
- `line_start` / `line_end` — line numbers
- `confidence_score` — LLM confidence 0–1

### Compare Variants
```http
GET /compare/{project_name}
```
Returns AI analysis of whether multiple same-named projects are:
- The same project with updates
- Different distinct projects
- Includes similarity score + key differences

### Statistics
```http
GET /stats
```
Returns counts by type, state, lifecycle stage.

---

## Data Model

### Per-field source traceability
Every extracted field stores:
```json
{
  "field_name": "environmental_approval",
  "field_value": "true",
  "confidence_score": 0.92,
  "sources": [
    {
      "source_url": "https://www.sec.gov/Archives/edgar/.../0001234-23-000001.htm",
      "page_number": 47,
      "line_start": 1823,
      "line_end": 1825,
      "exact_snippet": "The project received environmental approval from the Bureau of Land Management on February 14, 2023.",
      "snippet_context": "...regulatory milestones. The project received environmental approval from the Bureau of Land Management on February 14, 2023. Following this, the company executed a grid interconnection agreement..."
    }
  ]
}
```

### Extracted Fields
| Field | Description |
|-------|-------------|
| `project_name` | Official project name |
| `project_type` | solar / wind / battery / hydro / geothermal / hybrid |
| `owner_company` | Legal entity owning/developing the project |
| `city`, `state`, `country` | Location |
| `latitude`, `longitude` | Coordinates (extracted or geocoded) |
| `capacity_mw` | Installed capacity in megawatts |
| `lifecycle_stage` | planned / approved / under_construction / operational |
| `environmental_approval` | Boolean + date |
| `grid_connection_approval` | Boolean + date |
| `financing_secured` | Boolean + amount + details |
| `predicted_lifecycle_stage` | AI prediction with confidence |

---

## Project Differentiation

When multiple records share the same project name, the engine:
1. Groups by normalized name
2. Computes feature similarity (location, owner, capacity, type)
3. Calls LLM for semantic comparison
4. Returns:
   - `similarity_score` (0–1)
   - `is_same_project` (true = same physical project, different filing dates)
   - `key_differences` (list of what changed)
   - `recommendation` (how to handle the records)

**Threshold**: similarity ≥ 0.9 → treated as same project (update), else → different projects.

---

## Running Tests

```bash
cd backend
pip install pytest pytest-asyncio
pytest ../tests/test_suite.py -v
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL async URL | ✓ |
| `OPENAI_API_KEY` | OpenAI API key | ✓ |
| `OPENCAGE_API_KEY` | Geocoding API key | Optional |
| `REDIS_URL` | Redis connection URL | Optional |
| `SEC_USER_AGENT` | SEC EDGAR user agent | ✓ |
| `OPENAI_MODEL` | Default: `gpt-4o` | Optional |

---

## Performance Notes

- **Concurrency**: 5 concurrent EDGAR requests (respects SEC's 10 req/sec limit)
- **LLM batching**: Chunks processed in batches of 5 with semaphore control
- **Embedding cache**: In-memory cache with pickle persistence between restarts
- **Text limits**: HTML truncated at 500K chars; LLM context limited to 4K chars/chunk
- **Pagination**: EDGAR results paginated at 10/page with auto-continuation

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Scraping | `httpx`, `BeautifulSoup4`, `lxml` |
| PDF | `PyMuPDF`, `pdfplumber` |
| AI | `OpenAI GPT-4o`, `LangChain` |
| Vector search | `FAISS` |
| Geocoding | `OpenCage API` + state centroid fallback |
| Database | `PostgreSQL 16` + `SQLAlchemy async` |
| API | `FastAPI` + `Uvicorn` |
| Frontend | `Next.js 14` + `Tailwind CSS` + `React Query` |
| Maps | `Leaflet.js` |
| Charts | `Recharts` |
| Logging | `structlog` |
