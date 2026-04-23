import React from 'react'
import { cn, confidenceColor, confidenceLabel } from '@/lib/utils'
import { ExternalLink, Copy, CheckCheck } from 'lucide-react'
import type { SourceReference } from '@/lib/api'

// ── Confidence Pill ──────────────────────────
export function ConfidencePill({ score }: { score: number | null | undefined }) {
  const pct = score != null ? Math.round(score * 100) : null
  return (
    <span className={cn('font-mono text-xs', confidenceColor(score))}>
      {pct != null ? `${pct}%` : '—'}
    </span>
  )
}

// ── Status Dot ───────────────────────────────
export function StatusDot({ active, size = 'sm' }: { active: boolean | null; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
  if (active === null) return <span className={cn(s, 'rounded-full bg-white/20')} />
  if (active)          return <span className={cn(s, 'rounded-full bg-brand-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]')} />
  return               <span className={cn(s, 'rounded-full bg-rose-500/60')} />
}

// ── Approval Badge ───────────────────────────
export function ApprovalBadge({ value, label }: { value: boolean | null; label: string }) {
  if (value === null) return <span className="badge badge-gray">{label}: Unknown</span>
  if (value)          return <span className="badge badge-green">✓ {label}</span>
  return              <span className="badge badge-red">✗ {label}</span>
}

// ── Source Citation ──────────────────────────
export function SourceCitation({
  source,
  fieldName,
}: {
  source: SourceReference
  fieldName?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  const copySnippet = async () => {
    await navigator.clipboard.writeText(source.exact_snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-brand-500/15 bg-brand-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-500/10">
        <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
        <a
          href={source.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-400 text-xs font-mono hover:underline truncate flex-1"
        >
          {source.source_url.length > 60
            ? '…' + source.source_url.slice(-55)
            : source.source_url}
        </a>
        <a href={source.source_url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="w-3 h-3 text-white/30 hover:text-white/60" />
        </a>
      </div>

      {/* Location meta */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-brand-500/10">
        {source.page_number != null && (
          <span className="text-xs font-mono text-white/40">
            p.{source.page_number}
          </span>
        )}
        {source.line_start != null && (
          <span className="text-xs font-mono text-white/40">
            L{source.line_start}–{source.line_end ?? source.line_start}
          </span>
        )}
        {source.paragraph_number != null && (
          <span className="text-xs font-mono text-white/40">
            ¶{source.paragraph_number}
          </span>
        )}
        <button
          onClick={copySnippet}
          className="ml-auto text-white/30 hover:text-white/60 transition-colors"
        >
          {copied
            ? <CheckCheck className="w-3 h-3 text-brand-400" />
            : <Copy className="w-3 h-3" />}
        </button>
      </div>

      {/* Snippet */}
      <div
        className={cn(
          'px-3 py-2 text-xs text-white/70 font-mono leading-relaxed cursor-pointer',
          !expanded && 'line-clamp-3'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-brand-400/60 select-none">"</span>
        {source.exact_snippet}
        <span className="text-brand-400/60 select-none">"</span>
      </div>

      {source.exact_snippet.length > 200 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center py-1 text-xs text-white/30 hover:text-white/50 border-t border-brand-500/10"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// ── Field Row with Source ─────────────────────
export function FieldRow({
  label,
  value,
  sources,
  confidence,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  sources?: SourceReference[]
  confidence?: number | null
  mono?: boolean
}) {
  const [showSources, setShowSources] = React.useState(false)
  const hasSources = sources && sources.length > 0

  return (
    <div className="py-3 border-b border-white/5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <span className="data-label">{label}</span>
        <div className="flex items-center gap-2 text-right">
          <span className={cn('text-sm text-white/90', mono && 'font-mono')}>
            {value ?? <span className="text-white/25">—</span>}
          </span>
          {confidence != null && <ConfidencePill score={confidence} />}
          {hasSources && (
            <button
              onClick={() => setShowSources(!showSources)}
              className="source-chip ml-1"
            >
              {showSources ? '▼' : '▶'} src
            </button>
          )}
        </div>
      </div>

      {showSources && hasSources && (
        <div className="mt-2 space-y-2">
          {sources!.map(s => (
            <SourceCitation key={s.id} source={s} fieldName={label} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Skeleton Loader ───────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function CardSkeleton() {
  return (
    <div className="glass p-5 space-y-3">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-3/4 mt-2" />
    </div>
  )
}

// ── Empty State ───────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      {icon && <div className="text-4xl opacity-30">{icon}</div>}
      <p className="text-white/50 font-medium">{title}</p>
      {description && <p className="text-white/25 text-sm max-w-sm">{description}</p>}
      {action}
    </div>
  )
}

// ── Progress Bar ──────────────────────────────
export function ProgressBar({ value, max, color = 'green' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const colorMap: Record<string, string> = {
    green: 'bg-brand-500',
    amber: 'bg-amber-500',
    cyan:  'bg-cyan-500',
    rose:  'bg-rose-500',
  }
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', colorMap[color] || 'bg-brand-500')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Stat Card ─────────────────────────────────
export function StatCard({
  label, value, sub, icon, trend,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'flat'
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <span className="section-heading">{label}</span>
        {icon && <span className="text-lg opacity-60">{icon}</span>}
      </div>
      <p className="text-2xl font-display text-white">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  )
}
