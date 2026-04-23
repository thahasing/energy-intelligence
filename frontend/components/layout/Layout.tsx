import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV = [
  { href: '/',        label: 'Dashboard', icon: '⬛' },
  { href: '/search',  label: 'Search',    icon: '🔍' },
  { href: '/ingest',  label: 'Ingest',    icon: '⬇' },
  { href: '/monitor', label: 'Monitor',   icon: '◉' },
  { href: '/chat',    label: 'AI Assistant', icon: '🤖' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L10 6H15L11 9.5L12.5 14.5L8 11.5L3.5 14.5L5 9.5L1 6H6L8 1Z" fill="#22c55e" opacity=".9"/>
            </svg>
          </div>
          <div className="logo-text">
            Energy<br />
            <span className="logo-sub">Intelligence</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(({ href, label, icon }) => {
            const active = router.pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${active ? 'active' : ''}`}
              >
                <span style={{ fontSize: 13 }}>{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="live-pill">
            <span className="pulse-dot" />
            Live · SEC EDGAR
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
            v1.0.0
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{getPageTitle(router.pathname)}</div>
          <Link href="/ingest">
            <button className="btn-primary">
              + New Ingestion
            </button>
          </Link>
        </header>
        <main className="content">
          {children}
        </main>
      </div>
    </div>
  )
}

function getPageTitle(pathname: string): string {
  if (pathname === '/')         return 'Dashboard'
  if (pathname === '/search')   return 'Search Projects'
  if (pathname === '/ingest')   return 'Data Ingestion'
  if (pathname === '/monitor')  return 'Job Monitor'
  if (pathname.startsWith('/project')) return 'Project Detail'
  if (pathname.startsWith('/compare')) return 'Compare Variants'
  return 'Energy Intelligence'
}
