export function formatMW(mw: number | null | undefined): string {
  if (!mw) return '—'
  if (mw >= 1000) return (mw/1000).toFixed(1) + ' GW'
  return mw + ' MW'
}

export function formatUSD(usd: number | null | undefined): string {
  if (!usd) return '—'
  if (usd >= 1e9) return '$' + (usd/1e9).toFixed(1) + 'B'
  if (usd >= 1e6) return '$' + (usd/1e6).toFixed(1) + 'M'
  return '$' + usd.toLocaleString()
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'})
}

export function formatRelative(d: string | null | undefined): string {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff/60000)
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins/60)
  if (hrs < 24) return hrs + 'h ago'
  return Math.floor(hrs/24) + 'd ago'
}

export function locationString(p: any): string {
  if (p.city && p.state) return p.city + ', ' + p.state
  if (p.city) return p.city
  if (p.state) return p.state
  return '—'
}

export function getTypeIcon(type: string | null | undefined): string {
  const icons: Record<string,string> = {
    solar: '☀️', wind: '💨', battery: '🔋',
    hydro: '💧', geothermal: '🌋', hybrid: '⚡', unknown: '⚡'
  }
  return icons[type || 'unknown'] || '⚡'
}

export function getTypeBadge(type: string | null | undefined): string {
  const badges: Record<string,string> = {
    solar: 'badge-amber', wind: 'badge-cyan', battery: 'badge-violet',
    hydro: 'badge-cyan', geothermal: 'badge-green', hybrid: 'badge-green'
  }
  return badges[type || ''] || 'badge-gray'
}

export function getLifecycleBadge(stage: string | null | undefined): string {
  const badges: Record<string,string> = {
    planned: 'badge-gray', approved: 'badge-cyan',
    under_construction: 'badge-amber', operational: 'badge-green'
  }
  return badges[stage || ''] || 'badge-gray'
}

export const PROJECT_TYPE_CONFIG: Record<string,{label:string, step?:number}> = {
  solar: {label:'Solar'}, wind: {label:'Wind'}, battery: {label:'Battery'},
  hydro: {label:'Hydro'}, geothermal: {label:'Geothermal'},
  hybrid: {label:'Hybrid'}, unknown: {label:'Unknown', step:0}
}

export const LIFECYCLE_CONFIG: Record<string,{label:string, step:number}> = {
  planned: {label:'Planned', step:0}, approved: {label:'Approved', step:1},
  under_construction: {label:'Under Construction', step:2},
  operational: {label:'Operational', step:3}, unknown: {label:'Unknown', step:0}
}
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function confidenceColor(score: number | null | undefined): string {
  if (!score) return 'var(--t3)'
  if (score >= 0.8) return 'var(--g4)'
  if (score >= 0.6) return '#f59e0b'
  return '#ef4444'
}

export function confidenceLabel(score: number | null | undefined): string {
  if (!score) return 'Unknown'
  if (score >= 0.8) return 'High'
  if (score >= 0.6) return 'Medium'
  return 'Low'
}
