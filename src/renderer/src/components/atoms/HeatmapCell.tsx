import type { ReactElement } from 'react'
import { clsx } from 'clsx'

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4

export interface HeatmapCellProps {
  level: HeatmapLevel
  date: string
  count: number
  topCamera?: string
  topLens?: string
  selected?: boolean
  onClick?: (date: string) => void
  className?: string
}

const LEVEL_CLASSES: Record<HeatmapLevel, string> = {
  0: 'bg-slate-800/70',
  1: 'bg-emerald-900/80',
  2: 'bg-emerald-700/85',
  3: 'bg-emerald-500',
  4: 'bg-emerald-300'
}

/**
 * Single day square for the GitHub-style 52-week shooting activity heatmap.
 */
export function HeatmapCell({
  level,
  date,
  count,
  topCamera,
  topLens,
  selected = false,
  onClick,
  className
}: HeatmapCellProps): ReactElement {
  const gearSummary = [topCamera, topLens].filter(Boolean).join(' / ')
  const title = gearSummary
    ? `${date}: ${count}枚 (${gearSummary})`
    : `${date}: ${count}枚`

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(date) : undefined}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      data-date={date}
      data-level={level}
      disabled={!onClick}
      className={clsx(
        'h-3 w-3 rounded-[2px] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        LEVEL_CLASSES[level],
        onClick && 'cursor-pointer hover:scale-125',
        !onClick && 'cursor-default',
        selected && 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-950',
        className
      )}
    />
  )
}

export interface HeatmapLegendSwatchProps {
  level: HeatmapLevel
  className?: string
}

/**
 * Purely decorative color swatch for the heatmap legend (not focusable, hidden from AT).
 */
export function HeatmapLegendSwatch({
  level,
  className
}: HeatmapLegendSwatchProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-block h-3 w-3 rounded-[2px]', LEVEL_CLASSES[level], className)}
    />
  )
}
