import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import Layout from '@/components/layout/Layout'
import { getProject } from '@/lib/api'
import {
  formatMW, formatUSD, formatDate, formatRelative, locationString,
  getTypeIcon, getTypeBadge, getLifecycleBadge,
  PROJECT_TYPE_CONFIG, LIFECYCLE_CONFIG,
} from '@/lib/utils'

const ProjectMap = dynamic(() => import('@/components/project/ProjectMap'), { ssr: false })

const LIFECYCLE_STEPS = ['Planned', 'Approved', 'Construction', 'Operational']
const LIFECYCLE_STEP_MAP: Record<string, number> = {
  planned: 0, approved: 1, under_construction: 2, operational: 3,
}

export default function ProjectDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const [tab, setTab] = React.useState<'overview' | 'fields' | 'sources'>('overview')

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id as string),
    enabled: !!id,
  })

  if (error) return (
    <Layout>
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <p style={{ color: 'var(--r1)', marginBottom: 12 }}>Failed to load project</p>
        <Link href="/search"><button className="btn-ghost">← Back to search</button></Link>
      </div>
    </Layout>
  )

  const curStep = LIFECYCLE_STEP_MAP[project?.lifecycle_stage || 'unknown'] ?? -1

  return (
    <Layout>
      <Head><title>{project?.project_name ?? 'Project'} · Energy Intelligence</title></Head>

      <div style={{ display: 'flex', gap: 16, minHeight: 'calc(100vh - 56px)' }}>
        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12 }}>
            <Link href="/search" style={{ color: 'var(--t3)', textDecoration: 'none' }}>← Search</Link>
            <span style={{ color: 'var(--t5)' }}>/</span>
            <span style={{ color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isLoading ? '…' : project?.project_name}
            </span>
          </div>

          {/* Header */}
          {isLoading ? (
            <div style={{ marginBottom: 20 }}>
              <div className="skeleton" style={{ height: 32, width: '70%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 16, width: '40%' }} />
            </div>
          ) : project && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <span style={{ fontSize: 36 }}>{getTypeIcon(project.project_type)}</span>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--tw)', lineHeight: 1.3, marginBottom: 4 }}>
                    {project.project_name}
                  </h1>
                  {project.owner_company && (
                    <p style={{ fontSize: 13, color: 'var(--t3)' }}>{project.owner_company}</p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {project.project_type && (
                  <span className={`badge ${getTypeBadge(project.project_type)}`}>
                    {PROJECT_TYPE_CONFIG[project.project_type]?.label || project.project_type}
                  </span>
                )}
                {project.lifecycle_stage && (
                  <span className={`badge ${getLifecycleBadge(project.lifecycle_stage)}`}>
                    {LIFECYCLE_CONFIG[project.lifecycle_stage]?.label || project.lifecycle_stage}
                  </span>
                )}
                {project.capacity_mw && (
                  <span className="badge badge-amber">⚡ {formatMW(project.capacity_mw)}</span>
                )}
                {(project.city || project.state) && (
                  <span className="badge badge-gray">📍 {locationString(project)}</span>
                )}
              </div>
            </div>
          )}

          {/* Lifecycle Timeline */}
          {project && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Project Lifecycle</div>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                {LIFECYCLE_STEPS.map((label, i) => {
                  const state = i < curStep ? 'done' : i === curStep ? 'active' : 'future'
                  return (
                    <React.Fragment key={label}>
                      <div className="tl-step">
                        <div className={`tl-node ${state}`}>
                          {state === 'done' ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : state === 'active' ? (
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--g5)', animation: 'pulse-dot 2s infinite' }} />
                          ) : (
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
                          )}
                        </div>
                        <div className={`tl-label ${state}`}>{label}</div>
                      </div>
                      {i < LIFECYCLE_STEPS.length - 1 && (
                        <div className={`tl-connector ${i < curStep ? 'done' : 'future'}`} />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
              {project.predicted_lifecycle_stage && project.predicted_lifecycle_stage !== project.lifecycle_stage && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--a1)' }}>⏱</span>
                  <span style={{ color: 'var(--t2)' }}>
                    AI predicts: <span style={{ color: 'var(--a2)', fontWeight: 500 }}>
                      {LIFECYCLE_CONFIG[project.predicted_lifecycle_stage]?.label || project.predicted_lifecycle_stage}
                    </span>
                  </span>
                  {project.lifecycle_prediction_confidence != null && (
                    <span style={{ marginLeft: 'auto', color: 'var(--t3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {Math.round(project.lifecycle_prediction_confidence * 100)}% confidence
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="tabs">
            {(['overview', 'fields', 'sources'] as const).map(t => (
              <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </div>
            ))}
          </div>

          {/* Overview */}
          {tab === 'overview' && project && (
            <div className="card">
              <div className="data-row"><span className="data-label">Project Name</span><span className="data-val">{project.project_name}</span></div>
              <div className="data-row"><span className="data-label">Type</span><span className="data-val" style={{ textTransform: 'capitalize' }}>{project.project_type || '—'}</span></div>
              <div className="data-row"><span className="data-label">Owner</span><span className="data-val">{project.owner_company || '—'}</span></div>
              <div className="data-row"><span className="data-label">Location</span><span className="data-val">{locationString(project)}</span></div>
              <div className="data-row"><span className="data-label">Capacity</span><span className="data-val">{formatMW(project.capacity_mw)}</span></div>
              <div className="data-row"><span className="data-label">Lifecycle</span><span className="data-val" style={{ textTransform: 'capitalize' }}>{project.lifecycle_stage?.replace('_', ' ') || '—'}</span></div>
              <div className="data-row">
                <span className="data-label">Financing</span>
                <span className="data-val" style={{ color: project.financing_secured ? 'var(--g4)' : 'var(--tw)' }}>
                  {project.financing_amount_usd ? formatUSD(project.financing_amount_usd) : project.financing_secured ? 'Secured' : '—'}
                </span>
              </div>
              <div className="data-row"><span className="data-label">First Seen</span><span className="data-val">{formatDate(project.first_seen_at)}</span></div>
              <div className="data-row"><span className="data-label">Last Updated</span><span className="data-val">{formatRelative(project.last_updated_at)}</span></div>
            </div>
          )}

          {/* Fields */}
          {tab === 'fields' && project && (
            <div className="card">
              {project.extracted_fields?.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>No field details available</div>
              ) : (
                project.extracted_fields?.map(ef => (
                  <div key={ef.id} className="data-row">
                    <span className="data-label" style={{ flex: 1 }}>{ef.field_name.replace(/_/g, ' ')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="data-val">{ef.field_value || '—'}</span>
                      {ef.confidence_score != null && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--g4)' }}>
                          {Math.round(ef.confidence_score * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Sources */}
          {tab === 'sources' && project && (
            <div className="card">
              {project.document?.url && (
                <div style={{ marginBottom: 16 }}>
                  <div className="card-title">Source Filing</div>
                  <a
                    href={project.document.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', borderRadius: 10,
                      background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)',
                      textDecoration: 'none',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--g4)" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--g4)', fontWeight: 500 }}>
                        {project.document.filing_type} — {project.document.company_name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.document.url}
                      </div>
                      {project.document.filed_date && (
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                          Filed: {formatDate(project.document.filed_date)}
                        </div>
                      )}
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--g4)" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                </div>
              )}

              {/* Evidence snippets */}
              <div className="card-title">Evidence Snippets</div>
              {project.extracted_fields?.flatMap(ef =>
                (ef.sources || []).map(src => ({ ...src, fieldName: ef.field_name, confidence: ef.confidence_score }))
              ).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>
                  No source citations available
                </div>
              ) : (
                project.extracted_fields?.flatMap(ef =>
                  (ef.sources || []).slice(0, 1).map(src => (
                    <div key={src.id} className="source-block">
                      <div className="source-header">
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--g5)', flexShrink: 0 }} />
                        <a href={src.source_url} target="_blank" rel="noopener noreferrer" className="source-url">
                          {src.source_url.length > 60 ? '…' + src.source_url.slice(-55) : src.source_url}
                        </a>
                        <a href={src.source_url} target="_blank" rel="noopener noreferrer">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        </a>
                      </div>
                      <div className="source-meta">
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t3)' }}>
                          {ef.field_name.replace(/_/g, ' ')}
                        </span>
                        {src.page_number != null && <span> · p.{src.page_number}</span>}
                        {src.line_start != null && <span> · L{src.line_start}–{src.line_end || src.line_start}</span>}
                        {ef.confidence_score != null && (
                          <span style={{ float: 'right', color: 'var(--g4)' }}>
                            {Math.round(ef.confidence_score * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="source-snippet">
                        "{src.exact_snippet?.slice(0, 300)}{src.exact_snippet?.length > 300 ? '…' : ''}"
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        {project && (
          <div style={{ width: 280, flexShrink: 0 }}>
            {/* Approvals */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Approvals & Status</div>
              <div className="approvals-grid">
                <div className="approval-cell">
                  <span className={project.environmental_approval === true ? 'dot-on' : project.environmental_approval === false ? 'dot-off' : 'dot-na'} />
                  <div className="approval-label">Environmental</div>
                </div>
                <div className="approval-cell">
                  <span className={project.grid_connection_approval === true ? 'dot-on' : project.grid_connection_approval === false ? 'dot-off' : 'dot-na'} />
                  <div className="approval-label">Grid</div>
                </div>
                <div className="approval-cell">
                  <span className={project.financing_secured === true ? 'dot-on' : project.financing_secured === false ? 'dot-off' : 'dot-na'} />
                  <div className="approval-label">Financing</div>
                </div>
              </div>
              {project.overall_confidence != null && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--t5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--t3)' }}>Overall confidence</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--g4)' }}>
                    {Math.round(project.overall_confidence * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* Map */}
            {project.latitude && project.longitude ? (
              <div style={{ height: 180, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--t5)', marginBottom: 12 }}>
                <ProjectMap
                  latitude={project.latitude}
                  longitude={project.longitude}
                  projectName={project.project_name}
                  projectType={project.project_type}
                />
              </div>
            ) : (
              <div className="map-ph" style={{ marginBottom: 12 }}>
                <div className="map-grid" />
                <div className="map-pin"><div className="map-ring"><div className="map-dot" /></div></div>
                <div className="coord-label">{locationString(project)}</div>
              </div>
            )}

            {/* Coords */}
            {project.latitude && project.longitude && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="data-row"><span className="data-label">Latitude</span><span className="data-val">{project.latitude.toFixed(6)}°</span></div>
                <div className="data-row"><span className="data-label">Longitude</span><span className="data-val">{project.longitude.toFixed(6)}°</span></div>
                {project.location_confidence != null && (
                  <div className="data-row">
                    <span className="data-label">Geo Confidence</span>
                    <span className="data-val" style={{ color: 'var(--g4)' }}>{Math.round(project.location_confidence * 100)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {project.document?.url && (
                <a href={project.document.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    Open Source Filing
                  </button>
                </a>
              )}
              <Link href={`/compare/${encodeURIComponent(project.project_name)}`} style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                  Compare Variants
                </button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
