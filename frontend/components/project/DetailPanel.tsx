import React from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { getProject } from '@/lib/api'
import type { Project } from '@/lib/api'
import {
  formatMW, formatUSD, formatDate, locationString,
  getTypeIcon, getTypeBadge, getLifecycleBadge,
  PROJECT_TYPE_CONFIG, LIFECYCLE_CONFIG,
} from '@/lib/utils'

const ProjectMap = dynamic(() => import('./ProjectMap'), { ssr: false })

const LIFECYCLE_STEPS = ['Planned', 'Approved', 'Construction', 'Operational']
const LIFECYCLE_STEP_MAP: Record<string, number> = {
  planned: 0, approved: 1, under_construction: 2, operational: 3,
}

interface Props {
  project: Project
  onClose: () => void
}

export default function DetailPanel({ project: p, onClose }: Props) {
  const [tab, setTab] = React.useState<'overview' | 'sources'>('overview')

  const { data: full } = useQuery({
    queryKey: ['project', p.id],
    queryFn: () => getProject(p.id),
    enabled: !!p.id,
  })

  const proj = full || p
  const curStep = LIFECYCLE_STEP_MAP[proj.lifecycle_stage || 'unknown'] ?? -1

  return (
    <div className="detail-panel fade-in" style={{ marginLeft: 16 }}>
      {/* Header */}
      <div className="dp-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 28 }}>{getTypeIcon(proj.project_type)}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}
          >
            ×
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--tw)', lineHeight: 1.3, marginBottom: 4 }}>
          {proj.project_name}
        </div>
        {proj.owner_company && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 9h6M9 12h6M9 15h4"/>
            </svg>
            {proj.owner_company}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {proj.project_type && (
            <span className={`badge ${getTypeBadge(proj.project_type)}`}>
              {PROJECT_TYPE_CONFIG[proj.project_type]?.label || proj.project_type}
            </span>
          )}
          {proj.lifecycle_stage && (
            <span className={`badge ${getLifecycleBadge(proj.lifecycle_stage)}`}>
              {LIFECYCLE_CONFIG[proj.lifecycle_stage]?.label || proj.lifecycle_stage}
            </span>
          )}
        </div>
      </div>

      <div className="dp-body">
        {/* Lifecycle Timeline */}
        <div className="dp-section">
          <div className="dp-section-title">Project Lifecycle</div>
          <div className="tl-wrap">
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

          {proj.predicted_lifecycle_stage && proj.predicted_lifecycle_stage !== proj.lifecycle_stage && (
            <div style={{
              marginTop: 10, padding: '8px 10px', borderRadius: 8,
              background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
            }}>
              <span style={{ color: 'var(--a1)' }}>⏱</span>
              <span style={{ color: 'var(--t2)' }}>
                AI predicts: <span style={{ color: 'var(--a2)', fontWeight: 500 }}>
                  {LIFECYCLE_CONFIG[proj.predicted_lifecycle_stage]?.label || proj.predicted_lifecycle_stage}
                </span>
              </span>
              {proj.lifecycle_prediction_confidence != null && (
                <span style={{ marginLeft: 'auto', color: 'var(--t3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  {Math.round(proj.lifecycle_prediction_confidence * 100)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        {proj.latitude && proj.longitude ? (
          <div className="dp-section">
            <div className="dp-section-title">Location</div>
            <div style={{ height: 150, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--t5)' }}>
              <ProjectMap
                latitude={proj.latitude}
                longitude={proj.longitude}
                projectName={proj.project_name}
                projectType={proj.project_type}
              />
            </div>
            <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--t3)' }}>
              {proj.latitude.toFixed(4)}° N, {proj.longitude.toFixed(4)}° W
            </div>
          </div>
        ) : (
          <div className="dp-section">
            <div className="dp-section-title">Location</div>
            <div className="map-ph">
              <div className="map-grid" />
              <div className="map-pin">
                <div className="map-ring"><div className="map-dot" /></div>
              </div>
              <div className="coord-label">{locationString(proj)}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          <div className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</div>
          <div className={`tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>Sources</div>
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div>
            <div className="data-row">
              <span className="data-label">Capacity</span>
              <span className="data-val">{formatMW(proj.capacity_mw)}</span>
            </div>
            <div className="data-row">
              <span className="data-label">Location</span>
              <span className="data-val">{locationString(proj)}</span>
            </div>
            <div className="data-row">
              <span className="data-label">Lifecycle</span>
              <span className="data-val" style={{ textTransform: 'capitalize' }}>
                {proj.lifecycle_stage?.replace('_', ' ') || '—'}
              </span>
            </div>
            <div className="data-row">
              <span className="data-label">Financing</span>
              <span className="data-val" style={{ color: proj.financing_secured ? 'var(--g4)' : 'var(--tw)' }}>
                {proj.financing_amount_usd ? formatUSD(proj.financing_amount_usd) : proj.financing_secured ? 'Secured' : '—'}
              </span>
            </div>
            {proj.environmental_approval_date && (
              <div className="data-row">
                <span className="data-label">Env. Date</span>
                <span className="data-val">{formatDate(proj.environmental_approval_date)}</span>
              </div>
            )}
            {proj.financing_details && (
              <div className="data-row">
                <span className="data-label">Fin. Details</span>
                <span className="data-val" style={{ fontSize: 10, maxWidth: 160, textAlign: 'right' }}>{proj.financing_details}</span>
              </div>
            )}
          </div>
        )}

        {/* Sources Tab */}
        {tab === 'sources' && (
          <div>
            {/* Source document link */}
            {full?.document && (
              <div style={{ marginBottom: 12 }}>
                <div className="dp-section-title">Source Filing</div>
                <a
                  href={full.document.url && full.document.url.includes("Archives") ? full.document.url : "https://www.sec.gov/cgi-bin/browse-edgar?company=" + encodeURIComponent(full.document.company_name || "") + "&type=10-K&action=getcompany"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)',
                    textDecoration: 'none', transition: 'all .15s',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g4)" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--g4)', fontWeight: 500 }}>
                      {full.document.filing_type || 'SEC Filing'} — {full.document.company_name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {full.document.url}
                    </div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--g4)" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            )}

            {/* Evidence snippets */}
            {full?.extracted_fields && full.extracted_fields.length > 0 ? (
              <>
                <div className="dp-section-title">Evidence Snippets</div>
                {full.extracted_fields
                  .filter(ef => ef.sources && ef.sources.length > 0)
                  .slice(0, 6)
                  .map(ef => (
                    ef.sources.slice(0, 1).map(src => (
                      <div key={src.id} className="source-block">
                        <div className="source-header">
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--g5)', flexShrink: 0 }} />
                          <a
                            href={src.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="source-url"
                          >
                            {src.source_url.length > 55 ? '…' + src.source_url.slice(-50) : src.source_url}
                          </a>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        </div>
                        <div className="source-meta">
                          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t3)' }}>
                            {ef.field_name.replace(/_/g, ' ')}
                          </span>
                          {src.page_number != null && <span> · p.{src.page_number}</span>}
                          {src.line_start != null && <span> · L{src.line_start}</span>}
                          {ef.confidence_score != null && (
                            <span style={{ float: 'right', color: 'var(--g4)' }}>
                              {Math.round(ef.confidence_score * 100)}%
                            </span>
                          )}
                        </div>
                        <div className="source-snippet">
                          "{src.exact_snippet?.slice(0, 180)}{src.exact_snippet?.length > 180 ? '…' : ''}"
                        </div>
                      </div>
                    ))
                  ))}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>
                No source citations available
              </div>
            )}
          </div>
        )}

        {/* Approvals */}
        <div className="dp-section" style={{ marginTop: 16 }}>
          <div className="dp-section-title">Approvals & Status</div>
          <div className="approvals-grid">
            <div className="approval-cell">
              <span className={proj.environmental_approval === true ? 'dot-on' : proj.environmental_approval === false ? 'dot-off' : 'dot-na'} />
              <div className="approval-label">Environmental</div>
            </div>
            <div className="approval-cell">
              <span className={proj.grid_connection_approval === true ? 'dot-on' : proj.grid_connection_approval === false ? 'dot-off' : 'dot-na'} />
              <div className="approval-label">Grid</div>
            </div>
            <div className="approval-cell">
              <span className={proj.financing_secured === true ? 'dot-on' : proj.financing_secured === false ? 'dot-off' : 'dot-na'} />
              <div className="approval-label">Financing</div>
            </div>
          </div>
          {proj.overall_confidence != null && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--t5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>Overall confidence</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--g4)' }}>
                {Math.round(proj.overall_confidence * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
