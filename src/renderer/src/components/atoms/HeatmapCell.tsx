import type { FocusEventHandler, KeyboardEventHandler, ReactElement, Ref } from 'react'
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
  /** Roving tabindex: 0 for the single tab stop of the grid, -1 for the rest */
  tabIndex?: number
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  onFocus?: FocusEventHandler<HTMLButtonElement>
  onBlur?: FocusEventHandler<HTMLButtonElement>
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  ref?: Ref<HTMLButtonElement>
  /** 1-based column (week) position, exposed as `aria-colindex` */
  columnIndex?: number
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
 * Rendered as a `gridcell` (inside `role="row"`); the selected day is exposed via `aria-selected`.
 * Enter / Space trigger `onClick` through the native button behavior. Without `onClick` the cell
 * is `aria-disabled` but still focusable (arrow-key navigation and the detail bar keep working).
 */
export function HeatmapCell({
  level,
  date,
  count,
  topCamera,
  topLens,
  selected = false,
  onClick,
  tabIndex,
  onKeyDown,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  ref,
  columnIndex,
  className
}: HeatmapCellProps): ReactElement {
  const gearSummary = [topCamera, topLens].filter(Boolean).join(' / ')
  const title = gearSummary
    ? `${date}: ${count}枚 (${gearSummary})`
    : `${date}: ${count}枚`

  return (
    <button
      ref={ref}
      type="button"
      role="gridcell"
      tabIndex={tabIndex}
      onClick={onClick ? () => onClick(date) : undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
      aria-label={title}
      aria-selected={selected}
      aria-colindex={columnIndex}
      data-date={date}
      data-level={level}
      // aria-disabled (not disabled) keeps the cell focusable so the grid stays navigable
      aria-disabled={onClick ? undefined : true}
      className={clsx(
        'block h-3 w-3 shrink-0 rounded-[2px] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
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
