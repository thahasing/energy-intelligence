import React from 'react'
import Head from 'next/head'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/layout/Layout'
import { triggerIngestion, getJobStatus, listJobs } from '@/lib/api'
import { formatRelative } from '@/lib/utils'
import toast from 'react-hot-toast'

const PRESETS = [
  { label: 'Solar Projects',    query: 'solar energy project photovoltaic' },
  { label: 'Wind Farms',        query: 'wind farm offshore onshore turbine' },
  { label: 'Battery Storage',   query: 'battery energy storage BESS grid' },
  { label: 'ERCOT Texas',       query: 'renewable energy project Texas ERCOT interconnection' },
  { label: 'MISO Region',       query: 'renewable energy project MISO interconnection Midwest' },
  { label: 'EIA Approval',      query: 'environmental impact assessment approval renewable energy' },
  { label: 'Grid Connection',   query: 'grid interconnection approval energy project' },
  { label: 'Project Finance',   query: 'renewable energy project financing secured' },
]

const FILING_TYPES = ['10-K','8-K','S-1','10-Q','DEF 14A']

export default function IngestPage() {
  const qc = useQueryClient()
  const [query, setQuery]     = React.useState('')
  const [maxDocs, setMaxDocs] = React.useState(20)
  const [dateFrom, setDate]   = React.useState('2020-01-01')
  const [types, setTypes]     = React.useState(['10-K','8-K','S-1'])
  const [activeJob, setActiveJob] = React.useState<string | null>(null)

  const { data: jobs, refetch: refetchJobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: listJobs,
    refetchInterval: activeJob ? 3000 : 10000,
  })

  const { data: jobDetail } = useQuery({
    queryKey: ['job', activeJob],
    queryFn: () => getJobStatus(activeJob!),
    enabled: !!activeJob,
    refetchInterval: 2000,
  })

  const ingestMutation = useMutation({
    mutationFn: triggerIngestion,
    onSuccess: (data) => {
      setActiveJob(data.job_id)
      toast.success('Ingestion started!')
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: () => toast.error('Failed to start ingestion'),
  })

  const toggleType = (t: string) =>
    setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const start = () => {
    if (!query.trim()) { toast.error('Enter a query first'); return }
    ingestMutation.mutate({ query: query.trim(), max_documents: maxDocs, filing_types: types, date_from: dateFrom })
  }

  const statusColor: Record<string, string> = {
    running: 'var(--a2)', done: 'var(--g4)', failed: '#fda4af', queued: 'var(--t3)'
  }
  const statusIcon: Record<string, string> = {
    running: '↻', done: '✓', failed: '✗', queued: '…'
  }

  const pct = jobDetail && jobDetail.total_documents > 0
    ? Math.round((jobDetail.processed_documents / jobDetail.total_documents) * 100) : 0

  return (
    <Layout>
      <Head><title>Ingest · Energy Intelligence</title></Head>

      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Query form */}
        <div className="ingest-card">
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tw)', marginBottom: 14 }}>
            Search SEC EDGAR
          </div>

          <textarea
            className="input"
            id="q-input"
            rows={2}
            style={{ resize: 'none', marginBottom: 12 }}
            placeholder="e.g. solar energy project photovoltaic utility scale…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          {/* Presets */}
          <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>
            Quick Presets
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {PRESETS.map(p => (
              <button
                key={p.query}
                className={`preset-chip ${query === p.query ? 'selected' : ''}`}
                onClick={() => setQuery(p.query)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Max Documents</div>
              <input type="number" className="input" min={1} max={200} value={maxDocs}
                onChange={e => setMaxDocs(Number(e.target.value))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Date From</div>
              <input type="date" className="input" value={dateFrom} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* Filing types */}
          <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>
            Filing Types
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {FILING_TYPES.map(t => (
              <button
                key={t}
                className={`preset-chip ${types.includes(t) ? 'selected' : ''}`}
                style={{ fontFamily: 'var(--font-mono)' }}
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            className="start-btn"
            onClick={start}
            disabled={ingestMutation.isPending || !query.trim()}
          >
            {ingestMutation.isPending ? (
              <>
                <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Starting…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Start Ingestion
              </>
            )}
          </button>
        </div>

        {/* Active job progress */}
        {jobDetail && (
          <div className="progress-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: jobDetail.status === 'done' ? 'var(--g4)' : jobDetail.status === 'failed' ? '#fda4af' : 'var(--tw)' }}>
                {jobDetail.status === 'running' ? 'Processing…' : jobDetail.status === 'done' ? 'Complete ✓' : jobDetail.status === 'failed' ? 'Failed ✗' : 'Queued…'}
              </span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--g4)' }}>
                {jobDetail.projects_found} found
              </span>
            </div>
            <div className="prog-track">
              <div className="prog-fill" style={{
                width: `${pct}%`,
                background: jobDetail.status === 'failed' ? 'var(--r1)' : jobDetail.status === 'done' ? 'var(--g5)' : 'var(--a1)',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
              <span>{jobDetail.processed_documents} / {jobDetail.total_documents} documents</span>
              <span>{pct}%</span>
            </div>
            {jobDetail.error_message && (
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(244,63,94,.1)', border: '1px solid rgba(244,63,94,.2)', fontSize: 11, color: '#fda4af', fontFamily: 'var(--font-mono)' }}>
                {jobDetail.error_message}
              </div>
            )}
          </div>
        )}

        {/* Job history */}
        {jobs && jobs.length > 0 && (
          <div className="ingest-card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Job History</div>
              <button onClick={() => refetchJobs()} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                ↻ Refresh
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {jobs.map((j: any) => (
                <div
                  key={j.job_id}
                  className="job-row"
                  onClick={() => setActiveJob(j.job_id)}
                  style={activeJob === j.job_id ? { background: 'var(--b2)', border: '1px solid rgba(34,197,94,.15)' } : {}}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: j.status === 'running' ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.1)',
                    display: 'grid', placeItems: 'center',
                    fontSize: 13, color: statusColor[j.status] || 'var(--t3)',
                    flexShrink: 0,
                    animation: j.status === 'running' ? 'spin .8s linear infinite' : 'none',
                  }}>
                    {statusIcon[j.status] || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--tw)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.query}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {formatRelative(j.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: statusColor[j.status], fontWeight: 500, textTransform: 'capitalize' }}>
                      {j.status}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{j.projects_found} found</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
