import React from 'react'
import Head from 'next/head'
import Layout from '@/components/layout/Layout'
import { useQuery } from '@tanstack/react-query'
import { searchProjects } from '@/lib/api'

interface Result {
  id: string
  name: string
  company: string
  cap: number | null
  state: string | null
  type: string
  url: string | null
  title: string
  source: string
  snippet: string
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'error'
}

export default function ResearchPage() {
  const [results, setResults] = React.useState<Result[]>([])
  const [running, setRunning] = React.useState(false)
  const [progress, setProgress] = React.useState('')
  const [saved, setSaved] = React.useState(0)

  const { data } = useQuery({
    queryKey: ['all-projects-research'],
    queryFn: () => searchProjects({ page: 1, page_size: 100 }),
  })
  const projects = data?.results || []

  async function findSource(p: any) {
    const co = (p.owner_company || '').split(',')[0].trim()
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search the web and find the most relevant official URL for this renewable energy project:

Project: "${p.project_name}"
Owner: "${co}"
Capacity: ${p.capacity_mw || '?'} MW
State: ${p.state || '?'}
Type: ${p.project_type}

Find ONE best URL - prioritize official company project page, then press release, then news article.
Return ONLY this JSON: {"url":"https://...","title":"page title","source":"site name","snippet":"1 sentence about the project from this page"}
If nothing found: {"url":null}`
        }]
      })
    })
    const d = await r.json()
    let text = ''
    for (const b of (d.content || [])) if (b.type === 'text') text += b.text
    try {
      const m = text.match(/\{[\s\S]*?\}/)
      if (m) { const j = JSON.parse(m[0]); if (j.url) return j }
    } catch {}
    return null
  }

  async function saveToDb(projectId: string, url: string, snippet: string) {
    try {
      await fetch(`https://energy-intelligence-production.up.railway.app/api/v1/projects/${projectId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, snippet })
      })
      setSaved(s => s + 1)
    } catch {}
  }

  async function run() {
    if (running || !projects.length) return
    setRunning(true); setSaved(0)
    setResults(projects.map(p => ({ id: p.id, name: p.project_name, company: p.owner_company || '', cap: p.capacity_mw, state: p.state, type: p.project_type, url: null, title: '', source: '', snippet: '', status: 'pending' })))

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]
      setProgress(`Searching ${i + 1} / ${projects.length}: ${p.project_name}`)
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'searching' } : r))
      try {
        const found = await findSource(p)
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, url: found?.url || null, title: found?.title || '', source: found?.source || '', snippet: found?.snippet || '', status: found?.url ? 'found' : 'not_found' } : r))
        if (found?.url) await saveToDb(p.id, found.url, found.snippet || '')
      } catch {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error' } : r))
      }
      await new Promise(r => setTimeout(r, 1000))
    }

    const foundCount = results.filter(r => r.status === 'found').length
    setProgress(`Complete! Found ${foundCount} sources.`)
    setRunning(false)
  }

  const done = results.filter(r => !['pending','searching'].includes(r.status)).length
  const foundCount = results.filter(r => r.status === 'found').length

  return (
    <Layout>
      <Head><title>AI Research · EnergyIQ</title></Head>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tw)', letterSpacing: '-.02em', marginBottom: 6 }}>AI Source Research</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>Uses Claude AI + web search to find real press releases, project pages, and news articles for each project — then saves them as verified sources.</div>
        </div>

        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[['Total', results.length, 'var(--tw)'], ['Searched', done, 'var(--blue)'], ['Found', foundCount, '#16a34a'], ['Saved to DB', saved, '#7c3aed']].map(([l, v, c]: any) => (
              <div key={l} className="stat-card" style={{ padding: 14 }}>
                <div className="stat-label">{l}</div>
                <div className="stat-val" style={{ fontSize: 24, color: c }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tw)', marginBottom: 4 }}>{projects.length} projects ready</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>{progress || 'Click start to find real source documents for all projects using AI web search'}</div>
            </div>
            <button onClick={run} disabled={running || !projects.length} className="btn-primary" style={{ flexShrink: 0, padding: '10px 24px', fontSize: 13 }}>
              {running ? '⏳ Researching...' : '🔍 Start AI Research'}
            </button>
          </div>
          {running && done > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--blue)', borderRadius: 2, width: `${(done / results.length) * 100}%`, transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{Math.round((done / results.length) * 100)}% complete</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((r, i) => {
            const colors: any = {
              found:     { bg: 'rgba(22,163,74,.1)',   color: '#16a34a', border: 'rgba(22,163,74,.2)' },
              searching: { bg: 'rgba(37,99,235,.1)',   color: '#2563eb', border: 'rgba(37,99,235,.2)' },
              not_found: { bg: 'rgba(100,116,139,.1)', color: 'var(--t3)', border: 'var(--card-border)' },
              error:     { bg: 'rgba(220,38,38,.1)',   color: '#dc2626', border: 'rgba(220,38,38,.2)' },
              pending:   { bg: 'var(--bg2)',           color: 'var(--t4)', border: 'var(--card-border)' },
            }
            const sc = colors[r.status]
            return (
              <div key={i} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: r.url ? 6 : 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tw)', flex: 1 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>{r.cap}MW · {r.state}</div>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, flexShrink: 0 }}>
                        {r.status === 'searching' ? '⏳ searching' : r.status === 'found' ? '✓ found' : r.status === 'not_found' ? '✗ not found' : r.status === 'error' ? '! error' : '○ pending'}
                      </span>
                    </div>
                    {r.url && (
                      <>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', display: 'block', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</a>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}><span style={{ fontWeight: 600 }}>{r.source}</span>{r.title ? ` — ${r.title}` : ''}</div>
                        {r.snippet && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, fontStyle: 'italic' }}>"{r.snippet.slice(0, 200)}"</div>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
