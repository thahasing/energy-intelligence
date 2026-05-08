import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV = [
  { href: '/',        label: 'Dashboard',    icon: '▦' },
  { href: '/search',  label: 'Search',       icon: '⌕' },
  { href: '/chat',    label: 'AI Assistant', icon: '◈' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [dark, setDark] = React.useState(true)

  React.useEffect(() => {
    const saved = localStorage.getItem('theme')
    const isDark = saved ? saved === 'dark' : true
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
              <path d="M9 2L11.5 7H17L12.5 10.5L14.5 16L9 12.5L3.5 16L5.5 10.5L1 7H6.5L9 2Z" fill="white"/>
            </svg>
          </div>
          <div>
            <div className="logo-text">Energy<span style={{color:'var(--blue)'}}>IQ</span></div>
            <div className="logo-sub">Intelligence Engine</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(({ href, label, icon }) => {
            const active = router.pathname === href
            return (
              <Link key={href} href={href} className={`nav-item ${active ? 'active' : ''}`}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="live-pill">
            <span className="pulse-dot" />
            Live · EIA + FERC
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>v2.0.0</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{getPageTitle(router.pathname)}</div>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {dark ? '☀️' : '🌙'}
          </button>
        </header>
        <main className="content">
          {children}
        </main>
      </div>
    </div>
  )
}

function getPageTitle(pathname: string): string {
  if (pathname === '/')       return 'Dashboard'
  if (pathname === '/search') return 'Search Projects'
  if (pathname === '/chat')   return 'AI Assistant'
  if (pathname.startsWith('/project')) return 'Project Detail'
  return 'Energy Intelligence'
}
