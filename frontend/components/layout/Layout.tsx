import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV = [
  { href: '/',        label: 'Dashboard',    icon: '⊞' },
  { href: '/search',  label: 'Search',       icon: '⌕' },
  { href: '/ingest',  label: 'Ingest',       icon: '↧' },
  { href: '/monitor', label: 'Monitor',      icon: '↻' },
  { href: '/chat',    label: 'AI Assistant', icon: '◈' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [dark, setDark] = React.useState(false)

  React.useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light'
    const isDark = saved === 'dark'
    setDark(isDark)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1.5L11 7H17L12 10.5L14 16.5L9 13L4 16.5L6 10.5L1 7H7L9 1.5Z" fill="white"/>
            </svg>
          </div>
          <div>
            <div className="logo-text">Energy<span style={{ color:'var(--blue)' }}>IQ</span></div>
            <div className="logo-sub">Intelligence Engine</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(({ href, label, icon }) => (
            <Link key={href} href={href} className={`nav-item ${router.pathname === href ? 'active' : ''}`}>
              <span style={{ fontSize:15, width:18, textAlign:'center' }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="live-pill">
            <span className="pulse-dot" />
            Live · EIA + FERC
          </div>
          <div style={{ marginTop:5, fontSize:10, color:'var(--t4)', fontFamily:'var(--font-mono)' }}>v2.0.0</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            {router.pathname === '/' ? 'Dashboard' :
             router.pathname === '/search' ? 'Search Projects' :
             router.pathname === '/ingest' ? 'Data Ingestion' :
             router.pathname === '/monitor' ? 'Job Monitor' :
             router.pathname === '/chat' ? 'AI Assistant' : 'EnergyIQ'}
          </div>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {dark ? '☀️' : '🌙'}
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
