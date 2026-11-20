import { forwardRef, type KeyboardEvent, type ReactElement } from 'react'
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
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  tabIndex?: number
  role?: 'gridcell' | 'button'
  className?: string
}

export const HEATMAP_LEVEL_CLASSES: Record<HeatmapLevel, string> = {
  0: 'bg-slate-800/70',
  1: 'bg-emerald-900/80',
  2: 'bg-emerald-700/85',
  3: 'bg-emerald-500',
  4: 'bg-emerald-300'
}

/**
 * Single day square for the GitHub-style 52-week shooting activity heatmap.
 */
export const HeatmapCell = forwardRef<HTMLButtonElement, HeatmapCellProps>(
  function HeatmapCell(
    {
      level,
      date,
      count,
      topCamera,
      topLens,
      selected = false,
      onClick,
      onKeyDown,
      onFocus,
      onBlur,
      onMouseEnter,
      onMouseLeave,
      tabIndex,
      role = 'gridcell',
      className
    },
    ref
  ): ReactElement {
    const gearSummary = [topCamera, topLens].filter(Boolean).join(' / ')
    const title = gearSummary
      ? `${date}: ${count}枚 (${gearSummary})`
      : `${date}: ${count}枚`

    return (
      <button
        ref={ref}
        type="button"
        role={role}
        tabIndex={tabIndex}
        data-date={date}
        data-level={level}
        onClick={onClick ? () => onClick(date) : undefined}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        title={title}
        aria-label={title}
        aria-pressed={selected}
        className={clsx(
          'block h-3 w-3 shrink-0 rounded-[2px] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
          HEATMAP_LEVEL_CLASSES[level],
          onClick && 'cursor-pointer hover:scale-125',
          !onClick && 'cursor-default',
          selected && 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-950',
          className
        )}
      />
    )
  }
)
