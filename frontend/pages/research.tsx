import React from 'react'
import Head from 'next/head'
import Layout from '@/components/layout/Layout'
import { useQuery } from '@tanstack/react-query'
import { searchProjects } from '@/lib/api'

const API = "https://energy-intelligence-production.up.railway.app"

interface SourceResult {
  project_id: string
  project_name: string
  url: string | null
  title: string
  source: string
  snippet: string
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'error'
}

export default function ResearchPage() {
  const [results, setResults] = React.useState<SourceResult[]>([])
  const [running, setRunning] = React.useState(false)
  const [progress, setProgress] = React.useState('')
  const [saved, setSaved] = React.useState(0)

  const { data: projectsData } = useQuery({
    queryKey: ['all-projects'],
    queryFn: () => searchProjects({ page: 1, page_size: 100 }),
  })

  const projects = projectsData?.results || []

  async function findSource(project: any): Promise<{ url: string | null; title: string; source: string; snippet: string }> {
    const co = (project.owner_company || '').split(',')[0].trim()
    const prompt = `Search for the official project page, press release, or news article about this renewable energy project:

Project: "${project.project_name}"
Owner: "${co}"
Capacity: ${project.capacity_mw || '?'} MW
State: ${project.state || '?'}
Type: ${project.project_type}

Find the single most relevant URL that directly covers this specific project. Prioritize:
1. Official company project page
2. Press release from PR Newswire, Business Wire, Globe Newswire
3. News article from energy publication (utilitydive, rechargenews, pv-magazine, windpower-monthly)

Return ONLY a JSON object:
{"url": "https://...", "title": "page title", "source": "website name", "snippet": "1-2 sentences about what the page says about this project"}

If nothing specific found, return: {"url": null}`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await r.json()
    let text = ''
    for (const block of (data.content || [])) {
      if (block.type === 'text') text += block.text
    }

    try {
      const m = text.match(/\{[\s\S]*?\}/)
      if (m) {
        const parsed = JSON.parse(m[0])
        if (parsed.url) return parsed
      }
    } catch {}
    return { url: null, title: '', source: '', snippet: '' }
  }

  async function saveSource(projectId: string, url: string, title: string, snippet: string) {
    try {
      await fetch(`${API}/api/v1/projects/${projectId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, snippet })
      })
      setSaved(s => s + 1)
    } catch {}
  }

  async function runResearch() {
    if (running || !projects.length) return
    setRunning(true)
    setSaved(0)

    const initial: SourceResult[] = projects.map(p => ({
      project_id: p.id,
      project_name: p.project_name,
      url: null, title: '', source: '', snippet: '',
      status: 'pending'
    }))
    setResults(initial)

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]
      setProgress(`Searching ${i + 1} of ${projects.length}: ${p.project_name}`)

      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'searching' } : r
      ))

      try {
        const found = await findSource(p)
        setResults(prev => prev.map((r, idx) =>
          idx === i ? {
            ...r,
            url: found.url,
            title: found.title,
            source: found.source,
            snippet: found.snippet,
            status: found.url ? 'found' : 'not_found'
          } : r
        ))
        if (found.url) {
          await saveSource(p.id, found.url, found.title, found.snippet)
        }
      } catch {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'error' } : r
        ))
      }

      await new Promise(r => setTimeout(r, 800))
    }

    setProgress(`Done! Found sources for ${results.filter(r => r.status === 'found').length} projects.`)
    setRunning(false)
  }

  const statusColor = (s: string) => {
    if (s === 'found') return { bg: 'rgba(22,163,74,.1)', color: '#16a34a', border: 'rgba(22,163,74,.2)' }
    if (s === 'searching') return { bg: 'rgba(37,99,235,.1)', color: '#2563eb', border: 'rgba(37,99,235,.2)' }
    if (s === 'not_found') return { bg: 'rgba(220,38,38,.1)', color: '#dc2626', border: 'rgba(220,38,38,.2)' }
    if (s === 'error') return { bg: 'rgba(220,38,38,.1)', color: '#dc2626', border: 'rgba(220,38,38,.2)' }
    return { bg: 'var(--bg2)', color: 'var(--t3)', border: 'var(--card-border)' }
  }

  const found = results.filter(r => r.status === 'found').length
  const done = results.filter(r => !['pending','searching'].includes(r.status)).length

  return (
    <Layout>
      <Head><title>Source Research · EnergyIQ</title></Head>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tw)', letterSpacing: '-.02em', marginBottom: 6 }}>
            AI Source Research
          </div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>
            Uses Claude AI with web search to find real press releases, project pages, and news articles for each project
          </div>
        </div>

        {/* Stats */}
        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total', value: results.length, color: 'var(--tw)' },
              { label: 'Searched', value: done, color: 'var(--blue)' },
              { label: 'Found', value: found, color: '#16a34a' },
              { label: 'Saved', value: saved, color: '#7c3aed' },
            ].map(({ label, value, color }) => (
              <div key={label} className="stat-card" style={{ padding: 14 }}>
                <div className="stat-label">{label}</div>
                <div className="stat-val" style={{ fontSize: 24, color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Control */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tw)', marginBottom: 4 }}>
                {projects.length} projects loaded
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                {progress || 'Click start to begin AI-powered source research for all projects'}
              </div>
            </div>
            <button
              onClick={runResearch}
              disabled={running || !projects.length}
              className="btn-primary"
              style={{ flexShrink: 0, padding: '10px 24px', fontSize: 13, opacity: running ? 0.7 : 1 }}
            >
              {running ? '⏳ Researching...' : '🔍 Start Research'}
            </button>
          </div>

          {running && done > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: 'var(--blue)', borderRadius: 2,
                  width: `${(done / results.length) * 100}%`,
                  transition: 'width .3s ease'
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                {Math.round((done / results.length) * 100)}% complete
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => {
              const sc = statusColor(r.status)
              return (
                <div key={i} className="card" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: r.url ? 6 : 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tw)' }}>{r.project_name}</div>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                          background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, flexShrink: 0
                        }}>
                          {r.status === 'searching' ? '⏳ searching' :
                           r.status === 'found' ? '✓ found' :
                           r.status === 'not_found' ? '✗ not found' :
                           r.status === 'error' ? '! error' : '○ pending'}
                        </span>
                      </div>
                      {r.url && (
                        <>
                          <a href={r.url} target="_blank" rel="noopener noreferrer" style={{
                            fontSize: 12, color: 'var(--blue)', textDecoration: 'none',
                            display: 'block', marginBottom: 3, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {r.url}
                          </a>
                          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5 }}>
                            <span style={{ fontWeight: 600, color: 'var(--t3)' }}>{r.source}</span>
                            {r.title && ` — ${r.title}`}
                          </div>
                          {r.snippet && (
                            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, fontStyle: 'italic' }}>
                              "{r.snippet.slice(0, 180)}{r.snippet.length > 180 ? '…' : ''}"
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
