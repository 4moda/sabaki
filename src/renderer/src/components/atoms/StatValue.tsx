import type { ReactElement, ReactNode } from 'react'
import { clsx } from 'clsx'

export type StatAccent = 'indigo' | 'emerald' | 'amber' | 'sky'

export interface StatValueProps {
  label: string
  value: string | number
  subValue?: string
  icon?: ReactNode
  accent?: StatAccent
  className?: string
}

const ACCENT_ICON_CLASSES: Record<StatAccent, string> = {
  indigo: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  sky: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
}

/**
 * KPI metric value display with label, optional sub-value, and accented icon.
 */
export function StatValue({
  label,
  value,
  subValue,
  icon,
  accent = 'emerald',
  className
}: StatValueProps): ReactElement {
  return (
    <div className={clsx('flex flex-col', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-slate-400" title={label}>
          {label}
        </p>
        {icon && (
          <div
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
              ACCENT_ICON_CLASSES[accent]
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </div>
      <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-slate-100">
        {value}
      </p>
      {subValue && (
        <p className="mt-1 truncate text-xs text-slate-400" title={subValue}>
          {subValue}
        </p>
      )}
    </div>
  )
}
