import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Layout from '@/components/layout/Layout'
import ProjectCard from '@/components/project/ProjectCard'
import DetailPanel from '@/components/project/DetailPanel'
import { getStats, searchProjects } from '@/lib/api'
import type { Project } from '@/lib/api'

const TYPE_COLORS: Record<string, string> = {
  solar: '#f59e0b', wind: '#06b6d4', battery: '#8b5cf6',
  hydro: '#06b6d4', hybrid: '#22c55e', unknown: '#374151',
}

export default function DashboardPage() {
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    refetchInterval: 30000,
  })

  const { data: recentProjects, isLoading: projectsLoading } = useQuery({
    queryKey: ['recent-projects'],
    queryFn: () => searchProjects({ page: 1, page_size: 6 }),
    refetchInterval: 30000,
  })

  const typeData = stats ? Object.entries(stats.by_type).map(([k, v]) => ({
    name: k, value: v, color: TYPE_COLORS[k] || '#374151',
  })) : []

  const stateData = stats ? Object.entries(stats.top_states).slice(0, 5).map(([k, v]) => ({
    name: k || '?', value: v,
  })) : []

  const maxState = stateData.length ? Math.max(...stateData.map(d => d.value)) : 1

  const total = typeData.reduce((a, b) => a + b.value, 0) || 1
  let cumulative = 0
  const donutSegments = typeData.map(d => {
    const pct = (d.value / total) * 100
    const offset = cumulative
    cumulative += pct
    return { ...d, pct, offset }
  })

  return (
    <Layout>
      <Head><title>Dashboard · Energy Intelligence</title></Head>

      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard label="Total Projects" value={stats?.total_projects ?? 0} sub="Extracted from filings" icon="⚡" loading={statsLoading} />
            <StatCard label="Documents"      value={stats?.total_documents ?? 0} sub="EDGAR filings processed" icon="📄" loading={statsLoading} />
            <StatCard label="Solar Projects" value={stats?.by_type?.solar ?? 0} sub="Photovoltaic & utility-scale" icon="☀️" loading={statsLoading} />
            <StatCard label="Wind Projects"  value={stats?.by_type?.wind ?? 0} sub="Onshore & offshore" icon="💨" loading={statsLoading} />
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 20 }}>
            {/* Donut */}
            <div className="card">
              <div className="card-title">By Type</div>
              {statsLoading ? (
                <div className="skeleton" style={{ height: 120 }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <svg width="90" height="90" viewBox="0 0 90 90">
                    <circle cx="45" cy="45" r="35" fill="none" stroke="var(--bg3)" strokeWidth="14" />
                    {donutSegments.map((seg, i) => (
                      <circle
                        key={i} cx="45" cy="45" r="35" fill="none"
                        stroke={seg.color} strokeWidth="14"
                        strokeDasharray={`${(seg.pct / 100) * 219.9} 219.9`}
                        strokeDashoffset={`${-((seg.offset / 100) * 219.9) + 54.975}`}
                        transform="rotate(-90 45 45)"
                        opacity={0.85}
                      />
                    ))}
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    {donutSegments.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--t2)', flex: 1, textTransform: 'capitalize' }}>{d.name}</span>
                        <span style={{ color: 'var(--tw)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {Math.round((d.value / total) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bar chart */}
            <div className="card">
              <div className="card-title">Top States</div>
              {statsLoading ? (
                <div className="skeleton" style={{ height: 120 }} />
              ) : stateData.length === 0 ? (
                <NoData />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {stateData.map((d, i) => (
                    <div key={i} className="bar-row">
                      <div className="bar-label">{d.name}</div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{
                          width: `${(d.value / maxState) * 100}%`,
                          background: `hsl(${142 - i * 10}, 70%, ${55 - i * 4}%)`,
                        }} />
                      </div>
                      <div className="bar-count">{d.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Projects */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t2)' }}>Recent Projects</div>
            <Link href="/search" style={{ fontSize: 11, color: 'var(--g4)', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {projectsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 160, borderRadius: 14 }} />
              ))}
            </div>
          ) : recentProjects?.results.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {recentProjects?.results.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  selected={selectedProject?.id === p.id}
                  onSelect={() => setSelectedProject(selectedProject?.id === p.id ? null : p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedProject && (
          <DetailPanel
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
          />
        )}
      </div>
    </Layout>
  )
}

function StatCard({ label, value, sub, icon, loading }: any) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stat-label">{label}</div>
        <span style={{ fontSize: 18, opacity: .5 }}>{icon}</span>
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 32, width: '60%' }} />
      ) : (
        <div className="stat-val">{value.toLocaleString()}</div>
      )}
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function NoData() {
  return <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>No data yet — run an ingestion first</div>
}

function EmptyState() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: .3 }}>⚡</div>
      <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>No projects yet</p>
      <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>Run an ingestion to extract projects from SEC EDGAR</p>
      <Link href="/ingest">
        <button className="btn-primary">Start Ingestion</button>
      </Link>
    </div>
  )
}
