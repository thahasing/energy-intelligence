import React from 'react'
import Head from 'next/head'
import Layout from '@/components/layout/Layout'
import { triggerIngestion, listJobs } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

const PRESETS = [
  { label: '☀️ Solar Projects', query: 'solar energy project photovoltaic utility' },
  { label: '💨 Wind Farms', query: 'wind farm offshore onshore turbine' },
  { label: '🔋 Battery Storage', query: 'battery energy storage BESS grid' },
  { label: '💧 Hydro Power', query: 'hydroelectric power plant dam water' },
  { label: '⚡ Grid Connection', query: 'grid interconnection FERC transmission' },
  { label: '💰 Project Finance', query: 'renewable energy financing tax equity' },
]

const FILING_TYPES = ['10-K', '8-K', 'S-1', '10-Q', 'DEF', '14A']

export default function IngestPage() {
  const [query, setQuery] = React.useState('')
  const [maxDocs, setMaxDocs] = React.useState(20)
  const [dateFrom, setDateFrom] = React.useState('2020-01-01')
  const [selectedTypes, setSelectedTypes] = React.useState(['10-K', '8-K'])
  const [loading, setLoading] = React.useState(false)
  const [lastJob, setLastJob] = React.useState<string | null>(null)

  const { data: jobs, refetch } = useQuery({
    queryKey: ['jobs'],
    queryFn: listJobs,
    refetchInterval: 5000,
  })

  const toggleType = (t: string) => {
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const startIngestion = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const result = await triggerIngestion({ query, max_documents: maxDocs, filing_types: selectedTypes, date_from: dateFrom })
      setLastJob(result.job_id)
      refetch()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const jobList = Array.isArray(jobs) ? jobs : []

  return (
    <Layout>
      <Head><title>Data Ingestion · EnergyIQ</title></Head>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tw)', letterSpacing: '-.02em', marginBottom: 6 }}>
            Data Ingestion
          </div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>
            Search SEC EDGAR and EIA for renewable energy project filings
          </div>
        </div>

        {/* Search Card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Search Query</div>

          {/* Query Input */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startIngestion()}
              placeholder="e.g. solar energy project photovoltaic utility..."
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                border: '1px solid var(--card-border)', background: 'var(--bg2)',
                color: 'var(--tw)', fontSize: 14, outline: 'none',
                transition: 'border .15s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--blue)'}
              onBlur={e => e.target.style.borderColor = 'var(--card-border)'}
            />
          </div>

          {/* Quick Presets */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Quick Presets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => setQuery(p.query)} style={{
                  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--card-border)',
                  background: query === p.query ? 'var(--blue5)' : 'var(--bg2)',
                  color: query === p.query ? 'var(--blue)' : 'var(--t2)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
                  borderColor: query === p.query ? 'var(--blue3)' : 'var(--card-border)',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Max Documents
              </div>
              <input
                type="number" value={maxDocs} onChange={e => setMaxDocs(Number(e.target.value))}
                min={1} max={100}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--card-border)', background: 'var(--bg2)',
                  color: 'var(--tw)', fontSize: 13, outline: 'none',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Date From
              </div>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--card-border)', background: 'var(--bg2)',
                  color: 'var(--tw)', fontSize: 13, outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Filing Types */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Filing Types
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {FILING_TYPES.map(t => (
                <button key={t} onClick={() => toggleType(t)} style={{
                  padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: '1px solid', transition: 'all .15s',
                  background: selectedTypes.includes(t) ? 'rgba(37,99,235,0.1)' : 'var(--bg2)',
                  color: selectedTypes.includes(t) ? 'var(--blue)' : 'var(--t3)',
                  borderColor: selectedTypes.includes(t) ? 'rgba(37,99,235,0.3)' : 'var(--card-border)',
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={startIngestion}
            disabled={loading || !query.trim()}
            style={{
              width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              background: loading || !query.trim() ? 'var(--t5)' : 'var(--blue)',
              color: loading || !query.trim() ? 'var(--t3)' : 'white',
              fontSize: 14, fontWeight: 700, cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              transition: 'all .15s', letterSpacing: '-.01em',
            }}
          >
            {loading ? '⏳ Starting ingestion...' : '▶ Start Ingestion'}
          </button>
        </div>

        {/* Job History */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Job History</div>
            <button onClick={() => refetch()} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>↻ Refresh</button>
          </div>

          {jobList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--t3)', fontSize: 13 }}>
              No jobs yet — start an ingestion above
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jobList.slice(0, 10).map((job: any) => (
                <div key={job.job_id} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg2)', border: '1px solid var(--card-border)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: job.status === 'completed' ? 'var(--success)' :
                                job.status === 'running' ? 'var(--blue)' :
                                job.status === 'failed' ? 'var(--danger)' : 'var(--t4)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tw)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.query || 'Ingestion job'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
                      {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: job.status === 'completed' ? 'rgba(22,163,74,.1)' :
                                  job.status === 'running' ? 'rgba(37,99,235,.1)' :
                                  job.status === 'failed' ? 'rgba(220,38,38,.1)' : 'var(--bg3)',
                      color: job.status === 'completed' ? 'var(--success)' :
                             job.status === 'running' ? 'var(--blue)' :
                             job.status === 'failed' ? 'var(--danger)' : 'var(--t3)',
                    }}>
                      {job.status}
                    </div>
                    {job.documents_found != null && (
                      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                        {job.documents_found} found
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
