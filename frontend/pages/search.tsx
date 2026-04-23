import React from 'react'
import Head from 'next/head'
import { useQuery } from '@tanstack/react-query'
import Layout from '@/components/layout/Layout'
import ProjectCard from '@/components/project/ProjectCard'
import DetailPanel from '@/components/project/DetailPanel'
import { searchProjects } from '@/lib/api'
import type { Project } from '@/lib/api'

const TYPES = ['solar','wind','battery','hydro','geothermal','hybrid']
const STAGES = ['planned','approved','under_construction','operational']
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

// ERCOT states (Texas) and MISO states
const ERCOT_STATES = ['TX']
const MISO_STATES = ['IL','IN','MI','MN','WI','ND','SD','MO','KY','AR','LA','MS','MT','IA']

export default function SearchPage() {
  const [query, setQuery]         = React.useState('')
  const [projectType, setType]    = React.useState('')
  const [state, setState]         = React.useState('')
  const [lifecycle, setLifecycle] = React.useState('')
  const [envApproval, setEnv]     = React.useState('')
  const [financing, setFin]       = React.useState('')
  const [region, setRegion]       = React.useState('')
  const [showFilters, setFilters] = React.useState(false)
  const [page, setPage]           = React.useState(1)
  const [selected, setSelected]   = React.useState<Project | null>(null)

  // Region filter maps to states
  const regionStates = region === 'ERCOT' ? ERCOT_STATES
    : region === 'MISO' ? MISO_STATES : []

  const activeState = regionStates.length > 0 ? regionStates[0] : state

  const params = {
    ...(query        && { query }),
    ...(projectType  && { project_type: projectType }),
    ...(activeState  && { state: activeState }),
    ...(lifecycle    && { lifecycle_stage: lifecycle }),
    ...(envApproval !== '' && { environmental_approval: envApproval === 'true' }),
    ...(financing   !== '' && { financing_secured: financing === 'true' }),
    page, page_size: 12,
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', params],
    queryFn: () => searchProjects(params),
    keepPreviousData: true,
  })

  const totalPages = data ? Math.ceil(data.total / 12) : 1
  const hasFilters = projectType || state || lifecycle || envApproval || financing || region

  const clearAll = () => {
    setType(''); setState(''); setLifecycle(''); setEnv(''); setFin(''); setRegion('')
    setPage(1)
  }

  return (
    <Layout>
      <Head><title>Search · Energy Intelligence</title></Head>

      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Search bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: .35 }}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                className="input"
                style={{ paddingLeft: 36 }}
                placeholder="Search projects, companies, locations…"
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(1) }}
              />
            </div>
            <button
              className={`btn-ghost ${showFilters || hasFilters ? '' : ''}`}
              style={showFilters || hasFilters ? { borderColor: 'rgba(34,197,94,.3)', color: 'var(--g4)' } : {}}
              onClick={() => setFilters(!showFilters)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              Filters
              {hasFilters && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--g5)' }} />}
            </button>
          </div>

          {/* Region quick filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)', alignSelf: 'center' }}>Region:</span>
            {['All', 'ERCOT', 'MISO'].map(r => (
              <button
                key={r}
                onClick={() => { setRegion(r === 'All' ? '' : r); setPage(1) }}
                className="preset-chip"
                style={(r === 'All' ? region === '' : region === r) ? {
                  borderColor: 'rgba(34,197,94,.3)', color: 'var(--g4)', background: 'rgba(34,197,94,.06)'
                } : {}}
              >
                {r}
              </button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--t3)', alignSelf: 'center', marginLeft: 8 }}>Approval:</span>
            {[['Any', ''], ['EIA ✓', 'true'], ['No EIA', 'false']].map(([label, val]) => (
              <button
                key={label}
                onClick={() => { setEnv(val); setPage(1) }}
                className="preset-chip"
                style={envApproval === val ? {
                  borderColor: 'rgba(34,197,94,.3)', color: 'var(--g4)', background: 'rgba(34,197,94,.06)'
                } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="card" style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Type</div>
                <select className="input" style={{ fontSize: 12 }} value={projectType} onChange={e => { setType(e.target.value); setPage(1) }}>
                  <option value="">All types</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>State</div>
                <select className="input" style={{ fontSize: 12 }} value={state} onChange={e => { setState(e.target.value); setRegion(''); setPage(1) }}>
                  <option value="">All states</option>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Lifecycle</div>
                <select className="input" style={{ fontSize: 12 }} value={lifecycle} onChange={e => { setLifecycle(e.target.value); setPage(1) }}>
                  <option value="">All stages</option>
                  {STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Financing</div>
                <select className="input" style={{ fontSize: 12 }} value={financing} onChange={e => { setFin(e.target.value); setPage(1) }}>
                  <option value="">Any</option>
                  <option value="true">Secured</option>
                  <option value="false">Not secured</option>
                </select>
              </div>
              {hasFilters && (
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={clearAll} className="btn-ghost" style={{ color: 'var(--r1)', borderColor: 'rgba(244,63,94,.2)' }}>
                    × Clear all
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Results count */}
          {!isLoading && data && (
            <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
              {data.total.toLocaleString()} project{data.total !== 1 ? 's' : ''}
              {region && <span style={{ color: 'var(--g4)', marginLeft: 6 }}>· {region} region</span>}
              {isFetching && <span style={{ marginLeft: 6, opacity: .5 }}>· refreshing…</span>}
            </div>
          )}

          {/* Results grid */}
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 160, borderRadius: 14 }} />
              ))}
            </div>
          ) : data?.results.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 28, opacity: .3, marginBottom: 10 }}>🔍</div>
              <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>No projects found</p>
              <p style={{ fontSize: 12, color: 'var(--t3)' }}>Try adjusting your search or filters</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {data?.results.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  selected={selected?.id === p.id}
                  onSelect={() => setSelected(selected?.id === p.id ? null : p)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20 }}>
              <button
                className="btn-ghost"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ opacity: page === 1 ? .3 : 1 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
                {page} / {totalPages}
              </span>
              <button
                className="btn-ghost"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ opacity: page === totalPages ? .3 : 1 }}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <DetailPanel project={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </Layout>
  )
}
