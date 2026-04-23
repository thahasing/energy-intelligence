import React from 'react'
import { cn, LIFECYCLE_CONFIG } from '@/lib/utils'
import { CheckCircle2, Circle, Clock } from 'lucide-react'

interface LifecycleTimelineProps {
  currentStage: string | null | undefined
  predictedStage?: string | null
  predictionConfidence?: number | null
}

const STAGES = [
  { key: 'planned',            label: 'Planned' },
  { key: 'approved',           label: 'Approved' },
  { key: 'under_construction', label: 'Construction' },
  { key: 'operational',        label: 'Operational' },
]

export default function LifecycleTimeline({
  currentStage,
  predictedStage,
  predictionConfidence,
}: LifecycleTimelineProps) {
  const currentStep = LIFECYCLE_CONFIG[currentStage || 'unknown']?.step ?? 0
  const predictedStep = LIFECYCLE_CONFIG[predictedStage || 'unknown']?.step ?? 0

  if (currentStage === 'decommissioned') {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="badge badge-gray">Decommissioned</span>
        <span className="text-xs text-white/30">Project lifecycle complete</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const step = i + 1
          const isPast    = step < currentStep
          const isCurrent = step === currentStep
          const isPredicted = !isCurrent && step === predictedStep && predictedStep > currentStep
          const isFuture  = step > currentStep && step !== predictedStep

          return (
            <React.Fragment key={stage.key}>
              {/* Node */}
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all',
                  isPast    && 'bg-brand-500 border-brand-500',
                  isCurrent && 'bg-brand-500/20 border-brand-500 shadow-glow-green',
                  isPredicted && 'bg-amber-500/10 border-amber-500/40 border-dashed',
                  isFuture  && 'bg-white/5 border-white/10',
                )}>
                  {isPast ? (
                    <CheckCircle2 className="w-4 h-4 text-surface-0" />
                  ) : isCurrent ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
                  ) : isPredicted ? (
                    <Clock className="w-3.5 h-3.5 text-amber-400/70" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-white/15" />
                  )}
                </div>
                <span className={cn(
                  'text-[10px] text-center leading-tight w-16',
                  isPast    && 'text-brand-400',
                  isCurrent && 'text-white font-semibold',
                  isPredicted && 'text-amber-400/70',
                  isFuture  && 'text-white/25',
                )}>
                  {stage.label}
                </span>
              </div>

              {/* Connector */}
              {i < STAGES.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 mb-5 mx-1 transition-all',
                  step < currentStep ? 'bg-brand-500' : 'bg-white/10'
                )} />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Prediction note */}
      {predictedStage && predictedStage !== currentStage && predictedStep > 0 && (
        <div className="glass-sm px-3 py-2 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-white/60">
            AI predicts:{' '}
            <span className="text-amber-400 font-medium">
              {LIFECYCLE_CONFIG[predictedStage]?.label || predictedStage}
            </span>
          </span>
          {predictionConfidence != null && (
            <span className="text-xs text-white/30 font-mono ml-auto">
              {Math.round(predictionConfidence * 100)}% conf.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
