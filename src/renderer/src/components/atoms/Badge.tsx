import type { ReactElement, ReactNode } from 'react'
import { clsx } from 'clsx'

export type BadgeVariant = 'default' | 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky'

export interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'border-slate-700 bg-slate-800/80 text-slate-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  indigo: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300',
  amber: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  rose: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
  sky: 'border-sky-500/30 bg-sky-500/15 text-sky-300'
}

/**
 * Compact status or category pill badge.
 */
export function Badge({
  variant = 'default',
  children,
  className
}: BadgeProps): ReactElement {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-tight',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
