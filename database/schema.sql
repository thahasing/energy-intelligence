-- ============================================================
-- Energy Project Intelligence Engine - PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- DOCUMENTS TABLE
-- ============================================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL UNIQUE,
    filing_type VARCHAR(50),
    company_name TEXT,
    cik VARCHAR(20),
    accession_number VARCHAR(30),
    filed_date DATE,
    raw_html TEXT,
    raw_text TEXT,
    pdf_path TEXT,
    page_count INTEGER,
    ingested_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
    error_message TEXT
);

CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_company ON documents USING gin(company_name gin_trgm_ops);
CREATE INDEX idx_documents_cik ON documents(cik);

-- ============================================================
-- PROJECTS TABLE
-- ============================================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_name TEXT NOT NULL,
    project_name_normalized TEXT,
    project_type VARCHAR(30) CHECK (project_type IN ('solar','wind','battery','hydro','geothermal','hybrid','unknown')),
    owner_company TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'USA',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location_confidence FLOAT,
    capacity_mw FLOAT,
    lifecycle_stage VARCHAR(30) CHECK (lifecycle_stage IN ('planned','approved','under_construction','operational','decommissioned','unknown')),
    environmental_approval BOOLEAN,
    environmental_approval_date DATE,
    grid_connection_approval BOOLEAN,
    grid_connection_date DATE,
    financing_secured BOOLEAN,
    financing_amount_usd BIGINT,
    financing_details TEXT,
    predicted_lifecycle_stage VARCHAR(30),
    lifecycle_prediction_confidence FLOAT,
    first_seen_at TIMESTAMP DEFAULT NOW(),
    last_updated_at TIMESTAMP DEFAULT NOW(),
    document_id UUID REFERENCES documents(id),
    overall_confidence FLOAT DEFAULT 0.0
);

CREATE INDEX idx_projects_name ON projects USING gin(project_name gin_trgm_ops);
CREATE INDEX idx_projects_type ON projects(project_type);
CREATE INDEX idx_projects_state ON projects(state);
CREATE INDEX idx_projects_lifecycle ON projects(lifecycle_stage);
CREATE INDEX idx_projects_location ON projects(latitude, longitude);

-- ============================================================
-- PROJECT VARIANTS TABLE
-- ============================================================
CREATE TABLE project_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_project_id UUID REFERENCES projects(id),
    variant_project_id UUID REFERENCES projects(id),
    similarity_score FLOAT,
    is_same_project BOOLEAN,
    difference_explanation TEXT,
    compared_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- EXTRACTED FIELDS TABLE (Source Traceability)
-- ============================================================
CREATE TABLE extracted_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    field_value TEXT,
    confidence_score FLOAT,
    extraction_method VARCHAR(50) DEFAULT 'llm',
    extracted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_extracted_fields_project ON extracted_fields(project_id);
CREATE INDEX idx_extracted_fields_name ON extracted_fields(field_name);

-- ============================================================
-- SOURCE REFERENCES TABLE (Per-field provenance)
-- ============================================================
CREATE TABLE source_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extracted_field_id UUID REFERENCES extracted_fields(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id),
    source_url TEXT NOT NULL,
    page_number INTEGER,
    paragraph_number INTEGER,
    line_start INTEGER,
    line_end INTEGER,
    exact_snippet TEXT NOT NULL,
    snippet_context TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_source_refs_field ON source_references(extracted_field_id);
CREATE INDEX idx_source_refs_project ON source_references(project_id);
CREATE INDEX idx_source_refs_document ON source_references(document_id);

-- ============================================================
-- INGESTION JOBS TABLE
-- ============================================================
CREATE TABLE ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    total_documents INTEGER DEFAULT 0,
    processed_documents INTEGER DEFAULT 0,
    projects_found INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- EMBEDDING CACHE TABLE
-- ============================================================
CREATE TABLE embedding_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    text_hash VARCHAR(64) UNIQUE NOT NULL,
    embedding FLOAT[],
    model_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- VIEWS
-- ============================================================
CREATE VIEW project_full_details AS
SELECT
    p.*,
    d.url as document_url,
    d.company_name as filing_company,
    d.filed_date,
    d.filing_type,
    COUNT(DISTINCT ef.id) as field_count,
    COUNT(DISTINCT sr.id) as source_count
FROM projects p
LEFT JOIN documents d ON p.document_id = d.id
LEFT JOIN extracted_fields ef ON ef.project_id = p.id
LEFT JOIN source_references sr ON sr.project_id = p.id
GROUP BY p.id, d.url, d.company_name, d.filed_date, d.filing_type;

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_last_updated();
