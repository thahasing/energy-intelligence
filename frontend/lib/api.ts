const API = "https://energy-intelligence-production.up.railway.app"

export interface Project {
  id: string
  project_name: string
  project_type: string
  owner_company: string
  city: string | null
  state: string | null
  country: string
  latitude: number | null
  longitude: number | null
  capacity_mw: number | null
  lifecycle_stage: string
  environmental_approval: boolean | null
  grid_connection_approval: boolean | null
  financing_secured: boolean | null
  financing_amount_usd: number | null
  financing_details: string | null
  overall_confidence: number | null
  first_seen_at: string
  last_updated_at: string
  document_id: string | null
  predicted_lifecycle_stage: string | null
  lifecycle_prediction_confidence: number | null
  location_confidence: number | null
  environmental_approval_date: string | null
  document?: Document
  extracted_fields?: ExtractedField[]
}

export interface Document {
  id: string
  url: string
  filing_type: string
  company_name: string
  cik: string
  accession_number: string
  filed_date: string | null
  raw_text: string | null
  status: string
}

export interface ExtractedField {
  id: string
  field_name: string
  field_value: string
  confidence_score: number | null
  sources: SourceReference[]
}

export interface SourceReference {
  id: string
  source_url: string
  page_number: number | null
  line_start: number | null
  line_end: number | null
  exact_snippet: string | null
}

export interface SearchParams {
  query?: string
  project_type?: string
  state?: string
  lifecycle_stage?: string
  environmental_approval?: boolean
  financing_secured?: boolean
  page?: number
  page_size?: number
}

export interface SearchResult {
  results: Project[]
  total: number
  page: number
  page_size: number
}

export interface Stats {
  total_projects: number
  total_documents: number
  by_type: Record<string, number>
  top_states: Record<string, number>
  by_lifecycle: Record<string, number>
}

async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(API + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers }
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getStats(): Promise<Stats> {
  return fetchAPI('/api/v1/stats')
}

export async function searchProjects(params: SearchParams = {}): Promise<SearchResult> {
  const q = new URLSearchParams()
  if (params.query) q.set('query', params.query)
  if (params.project_type) q.set('project_type', params.project_type)
  if (params.state) q.set('state', params.state)
  if (params.lifecycle_stage) q.set('lifecycle_stage', params.lifecycle_stage)
  if (params.environmental_approval !== undefined) q.set('environmental_approval', String(params.environmental_approval))
  if (params.financing_secured !== undefined) q.set('financing_secured', String(params.financing_secured))
  q.set('page', String(params.page || 1))
  q.set('page_size', String(params.page_size || 12))
  return fetchAPI('/api/v1/search?' + q.toString())
}

export async function getProject(id: string): Promise<Project> {
  return fetchAPI('/api/v1/projects/' + id)
}

export async function getDocuments(): Promise<Document[]> {
  try {
    return fetchAPI('/api/v1/documents')
  } catch {
    return []
  }
}

export async function triggerIngestion(params: {
  query: string
  max_documents?: number
  filing_types?: string[]
  date_from?: string
}): Promise<{ job_id: string }> {
  return fetchAPI('/api/v1/ingest', {
    method: 'POST',
    body: JSON.stringify({
      query: params.query,
      max_documents: params.max_documents || 20,
      filing_types: params.filing_types || ['10-K', '8-K', 'S-1'],
      date_from: params.date_from || '2020-01-01',
    })
  })
}

export async function getJobStatus(jobId: string) {
  return fetchAPI('/api/v1/jobs/' + jobId)
}

export async function listJobs() {
  return fetchAPI('/api/v1/jobs')
}