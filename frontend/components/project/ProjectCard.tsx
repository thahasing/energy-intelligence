import React from 'react'
import type { Project } from '@/lib/api'
import { formatMW, formatUSD, locationString, getTypeIcon, getTypeBadge, getLifecycleBadge, LIFECYCLE_CONFIG, PROJECT_TYPE_CONFIG } from '@/lib/utils'

interface Props {
  project: Project
  selected?: boolean
  onSelect?: () => void
}

export default function ProjectCard({ project: p, selected, onSelect }: Props) {
  const typeBadge = getTypeBadge(p.project_type)
  const lcBadge   = getLifecycleBadge(p.lifecycle_stage)
  const lcLabel   = LIFECYCLE_CONFIG[p.lifecycle_stage || 'unknown']?.label || p.lifecycle_stage
  const typeLabel = PROJECT_TYPE_CONFIG[p.project_type || 'unknown']?.label || p.project_type

  return (
    <div
      className="proj-card"
      onClick={onSelect}
      style={selected ? {
        borderColor: 'rgba(34,197,94,0.4)',
        background: 'rgba(34,197,94,0.05)',
        boxShadow: '0 0 20px rgba(34,197,94,0.1)',
      } : {}}
    >
      {/* Header */}
      <div className="proj-header">
        <div className="proj-icon">{getTypeIcon(p.project_type)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="proj-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.project_name}
          </div>
          <div className="proj-owner" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.owner_company || '—'}
          </div>
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {p.project_type && <span className={`badge ${typeBadge}`}>{typeLabel}</span>}
        {p.lifecycle_stage && <span className={`badge ${lcBadge}`}>{lcLabel}</span>}
      </div>

      {/* Meta */}
      <div className="meta-row">
        {p.capacity_mw && (
          <div className="meta-item">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            {formatMW(p.capacity_mw)}
          </div>
        )}
        {(p.city || p.state) && (
          <div className="meta-item">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            {locationString(p)}
          </div>
        )}
        {p.financing_amount_usd && (
          <div className="meta-item">
            <span style={{ fontSize: 10 }}>$</span>
            {formatUSD(p.financing_amount_usd)}
          </div>
        )}
      </div>

      {/* Status row */}
      <div className="status-row">
        <div className="status-pill">
          <span className={p.environmental_approval === true ? 'dot-on' : p.environmental_approval === false ? 'dot-off' : 'dot-na'} />
          <span>Env</span>
        </div>
        <div className="status-pill">
          <span className={p.grid_connection_approval === true ? 'dot-on' : p.grid_connection_approval === false ? 'dot-off' : 'dot-na'} />
          <span>Grid</span>
        </div>
        <div className="status-pill">
          <span className={p.financing_secured === true ? 'dot-on' : p.financing_secured === false ? 'dot-off' : 'dot-na'} />
          <span>Fin</span>
        </div>
        {p.overall_confidence != null && (
          <div className="conf-tag">{Math.round(p.overall_confidence * 100)}%</div>
        )}
      </div>
    </div>
  )
}
