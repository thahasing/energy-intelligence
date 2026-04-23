import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, GitMerge, GitFork, AlertCircle } from 'lucide-react'
import Layout from '@/components/layout/Layout'
import { Skeleton, ConfidencePill, ApprovalBadge } from '@/components/ui/components'
import { compareProjects } from '@/lib/api'
import { cn, formatMW, formatUSD, locationString, getTypeIcon, getTypeBadge, getLifecycleBadge, PROJECT_TYPE_CONFIG, LIFECYCLE_CONFIG } from '@/lib/utils'

export default function ComparePage() {
  const router = useRouter()
  const { name } = router.query as { name: string }

  const { data, isLoading, error } = useQuery({
    queryKey: ['compare', name],
    queryFn: () => compareProjects(name),
    enabled: !!name,
  })

  return (
    <Layout>
      <Head>
        <title>Compare: {name} · Energy Intelligence</title>
      </Head>

      <div className="space-y-6 animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link href="/search" className="btn-ghost text-xs py-1.5 px-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-xs text-white/50">Compare Variants</span>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-xl font-display text-white mb-1">
            Project Comparison
          </h1>
          <p className="text-sm text-white/40 font-mono">"{name}"</p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {error && (
          <div className="glass p-6 text-center">
            <p className="text-rose-400">No projects found matching "{name}"</p>
          </div>
        )}

        {data && (
          <>
            {/* AI Verdict */}
            <div className={cn(
              'glass p-5 border',
              data.is_same_project === true  ? 'border-brand-500/20 bg-brand-500/5' :
              data.is_same_project === false ? 'border-amber-500/20 bg-amber-500/5' :
              'border-white/5'
            )}>
              <div className="flex items-start gap-3">
                {data.is_same_project === true  && <GitMerge  className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />}
                {data.is_same_project === false && <GitFork   className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />}
                {data.is_same_project === null  && <AlertCircle className="w-5 h-5 text-white/30 mt-0.5 flex-shrink-0" />}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={cn(
                      'text-sm font-semibold',
                      data.is_same_project === true  ? 'text-brand-400' :
                      data.is_same_project === false ? 'text-amber-400' :
                      'text-white/50'
                    )}>
                      {data.is_same_project === true  ? 'Same Project (Multiple Filings)' :
                       data.is_same_project === false ? 'Different Projects' :
                       'Unclear — Manual Review Needed'}
                    </span>
                    <span className="badge badge-gray font-mono text-xs">
                      {Math.round((data.similarity_score || 0) * 100)}% similarity
                    </span>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">{data.llm_analysis}</p>

                  {data.key_differences.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-white/30 mb-2 uppercase tracking-wider">Key differences:</p>
                      <ul className="space-y-1">
                        {data.key_differences.map((d, i) => (
                          <li key={i} className="text-xs text-white/50 flex items-start gap-2">
                            <span className="text-amber-400/60 mt-0.5">•</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.recommendation && (
                    <p className="mt-3 text-xs text-white/40 italic">{data.recommendation}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Variant cards side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.variants.map((project, i) => (
                <Link key={project.id} href={`/project/${project.id}`}>
                  <div className="glass p-5 hover:border-brand-500/20 transition-all cursor-pointer group h-full">
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-xl">{getTypeIcon(project.project_type)}</span>
                      <div className="flex-1">
                        <p className="text-xs text-white/30 font-mono mb-1">Variant {i + 1}</p>
                        <h3 className="text-sm font-semibold text-white/90 group-hover:text-brand-300 transition-colors">
                          {project.project_name}
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {project.project_type && (
                        <span className={cn('badge text-xs', getTypeBadge(project.project_type))}>
                          {PROJECT_TYPE_CONFIG[project.project_type]?.label || project.project_type}
                        </span>
                      )}
                      {project.lifecycle_stage && (
                        <span className={cn('badge text-xs', getLifecycleBadge(project.lifecycle_stage))}>
                          {LIFECYCLE_CONFIG[project.lifecycle_stage]?.label || project.lifecycle_stage}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0">
                      <div className="data-row">
                        <span className="data-label">Owner</span>
                        <span className="data-value text-xs">{project.owner_company || '—'}</span>
                      </div>
                      <div className="data-row">
                        <span className="data-label">Location</span>
                        <span className="data-value text-xs">{locationString(project)}</span>
                      </div>
                      <div className="data-row">
                        <span className="data-label">Capacity</span>
                        <span className="data-value font-mono text-xs">{formatMW(project.capacity_mw)}</span>
                      </div>
                      <div className="data-row">
                        <span className="data-label">Financing</span>
                        <span className="data-value font-mono text-xs">{formatUSD(project.financing_amount_usd)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                      <ApprovalBadge value={project.environmental_approval} label="Env" />
                      <ApprovalBadge value={project.grid_connection_approval} label="Grid" />
                      {project.overall_confidence != null && (
                        <div className="ml-auto flex items-center gap-1">
                          <span className="text-xs text-white/25">conf.</span>
                          <ConfidencePill score={project.overall_confidence} />
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
