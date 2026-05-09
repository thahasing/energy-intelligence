import React from 'react'
import type { Project } from '@/lib/api'
import { formatMW, locationString, getTypeIcon, getTypeBadge, getLifecycleBadge, LIFECYCLE_CONFIG, PROJECT_TYPE_CONFIG } from '@/lib/utils'

interface Props { project: Project; selected?: boolean; onSelect?: () => void }

export default function ProjectCard({ project: p, selected, onSelect }: Props) {
  return (
    <div className={`proj-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="proj-header">
        <div className="proj-icon">{getTypeIcon(p.project_type)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="proj-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.project_name}</div>
          <div className="proj-owner" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.owner_company || '—'}</div>
        </div>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10 }}>
        {p.project_type && <span className={`badge ${getTypeBadge(p.project_type)}`}>{PROJECT_TYPE_CONFIG[p.project_type]?.label || p.project_type}</span>}
        {p.lifecycle_stage && <span className={`badge ${getLifecycleBadge(p.lifecycle_stage)}`}>{LIFECYCLE_CONFIG[p.lifecycle_stage]?.label || p.lifecycle_stage}</span>}
      </div>
      <div className="meta-row">
        {p.capacity_mw && <div className="meta-item"><span>⚡</span>{formatMW(p.capacity_mw)}</div>}
        {(p.city || p.state) && <div className="meta-item"><span>📍</span>{locationString(p)}</div>}
      </div>
      <div className="status-row">
        <div className="status-pill"><span className={p.environmental_approval ? 'dot-on' : 'dot-na'} /><span>Env</span></div>
        <div className="status-pill"><span className={p.grid_connection_approval ? 'dot-on' : 'dot-na'} /><span>Grid</span></div>
        <div className="status-pill"><span className={p.financing_secured ? 'dot-on' : 'dot-na'} /><span>Fin</span></div>
        {p.overall_confidence != null && <div className="conf-tag">{Math.round(p.overall_confidence * 100)}%</div>}
      </div>
    </div>
  )
}
