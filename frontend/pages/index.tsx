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
  solar: '#f59e0b', wind: '#06b6d4', battery: '#8b5cf6', hydro: '#0ea5e9',
}
const TYPE_ICONS: Record<string, string> = {
  solar: '☀️', wind: '💨', battery: '🔋', hydro: '💧',
}

export default function DashboardPage() {
  const [selected, setSelected] = React.useState<Project | null>(null)
  const [mapLoaded, setMapLoaded] = React.useState(false)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'], queryFn: getStats, refetchInterval: 30000,
  })
  const { data: recent, isLoading: projectsLoading } = useQuery({
    queryKey: ['recent'], queryFn: () => searchProjects({ page: 1, page_size: 200 }), refetchInterval: 30000,
  })

  const typeData = stats ? Object.entries(stats.by_type)
    .filter(([k]) => ['solar','wind','battery','hydro'].includes(k))
    .map(([k, v]) => ({ name: k, value: v as number, color: TYPE_COLORS[k] || '#64748b' })) : []
  const total = typeData.reduce((a, b) => a + b.value, 0) || 1

  // Map markers
  const mapProjects = (recent?.results || []).filter(p => p.latitude && p.longitude)

  React.useEffect(() => {
    if (typeof window === 'undefined' || mapLoaded) return
    const L = require('leaflet')
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })

    const existing = document.getElementById('map-container')
    if (!existing || (existing as any)._leaflet_id) return

    const map = L.map('map-container', { zoomControl: true, scrollWheelZoom: false }).setView([39.5, -98.35], 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map)

    mapProjects.forEach(p => {
      const color = TYPE_COLORS[p.project_type] || '#64748b'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      })
      L.marker([p.latitude!, p.longitude!], { icon })
        .addTo(map)
        .bindPopup(`<b>${p.project_name}</b><br>${p.project_type} · ${p.capacity_mw || '?'} MW<br>${p.state || ''}`)
    })

    setMapLoaded(true)
  }, [mapProjects.length])

  return (
    <Layout>
      <Head><title>Dashboard · EnergyIQ</title></Head>

      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard label="Total Projects" value={stats?.total_projects ?? 0} sub="EIA verified" icon="⚡" loading={statsLoading} />
            <StatCard label="Solar" value={stats?.by_type?.solar ?? 0} sub="Photovoltaic" icon="☀️" loading={statsLoading} color="#f59e0b" />
            <StatCard label="Wind" value={stats?.by_type?.wind ?? 0} sub="Onshore" icon="💨" loading={statsLoading} color="#06b6d4" />
            <StatCard label="Battery + Hydro" value={(stats?.by_type?.battery ?? 0) + (stats?.by_type?.hydro ?? 0)} sub="Storage & water" icon="🔋" loading={statsLoading} color="#8b5cf6" />
          </div>

          {/* Map */}
          <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="card-title" style={{ margin: 0 }}>Project Map</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {['solar','wind','battery','hydro'].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t3)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[t] }} />
                    <span style={{ textTransform: 'capitalize' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              {typeof window !== 'undefined' && (
                <>
                  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
                  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" async />
                </>
              )}
              <div id="map-container" style={{ height: 340, width: '100%', background: 'var(--bg2)' }} />
            </div>
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 12, marginBottom: 20 }}>
            {/* Donut */}
            <div className="card">
              <div className="card-title">By Type</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <svg width="90" height="90" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
                  <circle cx="45" cy="45" r="35" fill="none" stroke="var(--bg3)" strokeWidth="13" />
                  {(() => {
                    let cum = 0
                    return typeData.map((d, i) => {
                      const pct = (d.value / total) * 100
                      const off = cum
                      cum += pct
                      return <circle key={i} cx="45" cy="45" r="35" fill="none" stroke={d.color} strokeWidth="13"
                        strokeDasharray={`${(pct/100)*219.9} 219.9`}
                        strokeDashoffset={`${-((off/100)*219.9)+54.975}`}
                        transform="rotate(-90 45 45)" opacity={0.9} />
                    })
                  })()}
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {typeData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ fontSize: 14 }}>{TYPE_ICONS[d.name] || '⚡'}</span>
                      <span style={{ color: 'var(--t2)', flex: 1, textTransform: 'capitalize', fontWeight: 500 }}>{d.name}</span>
                      <span style={{ color: d.color, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top states bar */}
            <div className="card">
              <div className="card-title">Top States</div>
              {statsLoading ? <div className="skeleton" style={{ height: 120 }} /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(stats?.top_states || {}).slice(0, 5).map(([k, v], i) => {
                    const max = Math.max(...Object.values(stats?.top_states || {}).slice(0,5) as number[])
                    return (
                      <div key={i} className="bar-row">
                        <div className="bar-label">{k || '?'}</div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${((v as number)/max)*100}%` }} /></div>
                        <div className="bar-count">{v as number}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Projects grid */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tw)' }}>Recent Projects</div>
            <Link href="/search" style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
          </div>

          {projectsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12 }} />)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {recent?.results.slice(0, 6).map(p => (
                <ProjectCard key={p.id} project={p} selected={selected?.id === p.id}
                  onSelect={() => setSelected(selected?.id === p.id ? null : p)} />
              ))}
            </div>
          )}
        </div>

        {selected && <DetailPanel project={selected} onClose={() => setSelected(null)} />}
      </div>
    </Layout>
  )
}

function StatCard({ label, value, sub, icon, loading, color }: any) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stat-label">{label}</div>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      {loading ? <div className="skeleton" style={{ height: 34, width: '60%' }} /> :
        <div className="stat-val" style={color ? { color } : {}}>{value.toLocaleString()}</div>}
      <div className="stat-sub">{sub}</div>
    </div>
  )
}
