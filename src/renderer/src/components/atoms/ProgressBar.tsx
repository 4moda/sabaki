import type { ReactElement } from 'react'
import { clsx } from 'clsx'

export type ProgressBarColor = 'indigo' | 'emerald' | 'amber'

export interface ProgressBarProps {
  percent: number
  color?: ProgressBarColor
  label?: string
  sublabel?: string
  className?: string
}

const FILL_CLASSES: Record<ProgressBarColor, string> = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500'
}

/**
 * Smooth animated progress bar clamped to 0..100%.
 */
export function ProgressBar({
  percent,
  color = 'emerald',
  label,
  sublabel,
  className
}: ProgressBarProps): ReactElement {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))

  return (
    <div className={clsx('w-full', className)}>
      {(label || sublabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-medium text-slate-200">{label}</span>
          <span className="shrink-0 font-mono text-slate-400">
            {sublabel ?? `${Math.round(clamped)}%`}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? '進捗'}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
      >
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-300 ease-out',
            FILL_CLASSES[color]
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
