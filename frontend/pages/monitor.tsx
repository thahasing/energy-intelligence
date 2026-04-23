import React from 'react'
import Head from 'next/head'
import { useQuery } from '@tanstack/react-query'
import Layout from '@/components/layout/Layout'
import { listJobs, getJobStatus } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/utils'

export default function MonitorPage() {
  const [selected, setSelected] = React.useState<string | null>(null)

  const { data: jobs, refetch, isLoading } = useQuery({
    queryKey: ['all-jobs'],
    queryFn: listJobs,
    refetchInterval: 5000,
  })

  const { data: detail } = useQuery({
    queryKey: ['job-detail', selected],
    queryFn: () => getJobStatus(selected!),
    enabled: !!selected,
    refetchInterval: (d) => d && ['done','failed'].includes(d.status) ? false : 2000,
  })

  const running = jobs?.filter((j: any) => j.status === 'running').length || 0
  const done    = jobs?.filter((j: any) => j.status === 'done').length || 0
  const failed  = jobs?.filter((j: any) => j.status === 'failed').length || 0

  const pct = detail && detail.total_documents > 0
    ? Math.round((detail.processed_documents / detail.total_documents) * 100) : 0

  const statusColor: Record<string, string> = {
    running:'var(--a2)', done:'var(--g4)', failed:'#fda4af', queued:'var(--t3)'
  }

  return (
    <Layout>
      <Head><title>Monitor · Energy Intelligence</title></Head>

      <div>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Running</div>
            <div className="stat-val" style={{ color: 'var(--a2)' }}>{running}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Completed</div>
            <div className="stat-val" style={{ color: 'var(--g4)' }}>{done}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Failed</div>
            <div className="stat-val" style={{ color: '#fda4af' }}>{failed}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Job list */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="card-title" style={{ margin: 0 }}>All Jobs</div>
              <button onClick={() => refetch()} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                ↻
              </button>
            </div>
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
                ))}
              </div>
            )}
            {!isLoading && (!jobs || jobs.length === 0) && (
              <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>
                No jobs yet — start an ingestion
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {jobs?.map((j: any) => (
                <div
                  key={j.job_id}
                  className="job-row"
                  onClick={() => setSelected(selected === j.job_id ? null : j.job_id)}
                  style={selected === j.job_id ? { background: 'var(--b2)', border: '1px solid rgba(34,197,94,.15)' } : {}}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: j.status === 'running' ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.1)',
                    display: 'grid', placeItems: 'center',
                    fontSize: 12, color: statusColor[j.status],
                    flexShrink: 0,
                  }}>
                    {j.status === 'running' ? '↻' : j.status === 'done' ? '✓' : j.status === 'failed' ? '✗' : '…'}
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

          {/* Job detail */}
          <div className="card">
            <div className="card-title">Job Detail</div>
            {!selected && (
              <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>
                Select a job to see details
              </div>
            )}
            {detail && (
              <div>
                <div className="data-row">
                  <span className="data-label">Status</span>
                  <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize', color: statusColor[detail.status] }}>
                    {detail.status}
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Documents</span>
                  <span className="data-val">{detail.processed_documents} / {detail.total_documents}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">Projects Found</span>
                  <span className="data-val" style={{ color: 'var(--g4)' }}>{detail.projects_found}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">Started</span>
                  <span className="data-val">{formatDate(detail.started_at)}</span>
                </div>
                {detail.completed_at && (
                  <div className="data-row">
                    <span className="data-label">Completed</span>
                    <span className="data-val">{formatDate(detail.completed_at)}</span>
                  </div>
                )}

                {detail.total_documents > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                      <span>Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="prog-track">
                      <div className="prog-fill" style={{
                        width: `${pct}%`,
                        background: detail.status === 'failed' ? 'var(--r1)' : detail.status === 'done' ? 'var(--g5)' : 'var(--a1)',
                      }} />
                    </div>
                  </div>
                )}

                {detail.error_message && (
                  <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(244,63,94,.1)', border: '1px solid rgba(244,63,94,.2)', fontSize: 11, color: '#fda4af', fontFamily: 'var(--font-mono)' }}>
                    {detail.error_message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
