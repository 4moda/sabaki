import type { HeatmapDayCell } from '@core/domain/models'
import type { HeatmapWeekColumn } from './heatmapLayout'

export interface HeatmapNavigationKey {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

interface GridPosition {
  week: number
  day: number
}

function findPosition(
  weeks: readonly HeatmapWeekColumn[],
  date: string
): GridPosition | null {
  for (let week = 0; week < weeks.length; week += 1) {
    const day = weeks[week].findIndex((cell) => cell?.date === date)
    if (day >= 0) return { week, day }
  }
  return null
}

function cellAtFlatIndex(
  weeks: readonly HeatmapWeekColumn[],
  index: number
): HeatmapDayCell | null {
  if (index < 0) return null
  return weeks[Math.floor(index / 7)]?.[index % 7] ?? null
}

function firstOrLastCellInRow(
  weeks: readonly HeatmapWeekColumn[],
  day: number,
  fromEnd: boolean
): HeatmapDayCell | null {
  const order = weeks.map((_, i) => (fromEnd ? weeks.length - 1 - i : i))
  for (const week of order) {
    const cell = weeks[week][day]
    if (cell) return cell
  }
  return null
}

function firstOrLastCell(
  weeks: readonly HeatmapWeekColumn[],
  fromEnd: boolean
): HeatmapDayCell | null {
  const flat = weeks.flat().filter((c): c is HeatmapDayCell => c !== null)
  return (fromEnd ? flat[flat.length - 1] : flat[0]) ?? null
}

/**
 * Resolves the date a key press moves the roving focus to.
 * Layout: columns are weeks (Sunday-first), rows are weekdays.
 * - ArrowLeft / ArrowRight: same weekday of the previous / next week
 * - ArrowUp / ArrowDown: previous / next day (wraps across week columns)
 * - Home / End: first / last day in the same weekday row
 * - Ctrl(Cmd)+Home / Ctrl(Cmd)+End: first / last day of the whole period
 * Returns `null` (let the browser handle it) for non-navigation keys, any key with Alt / Shift,
 * and Ctrl(Cmd) combined with anything other than Home / End. At the edges of the period
 * the current date is returned (focus stays put).
 */
export function getNextHeatmapFocusDate(
  weeks: readonly HeatmapWeekColumn[],
  currentDate: string,
  input: HeatmapNavigationKey
): string | null {
  if (input.altKey || input.shiftKey) return null
  const withModifier = Boolean(input.ctrlKey || input.metaKey)
  if (withModifier && input.key !== 'Home' && input.key !== 'End') return null
  const pos = findPosition(weeks, currentDate)
  if (!pos) return null
  const flatIndex = pos.week * 7 + pos.day

  let target: HeatmapDayCell | null
  switch (input.key) {
    case 'ArrowLeft':
      target = cellAtFlatIndex(weeks, flatIndex - 7)
      break
    case 'ArrowRight':
      target = cellAtFlatIndex(weeks, flatIndex + 7)
      break
    case 'ArrowUp':
      target = cellAtFlatIndex(weeks, flatIndex - 1)
      break
    case 'ArrowDown':
      target = cellAtFlatIndex(weeks, flatIndex + 1)
      break
    case 'Home':
      target = withModifier
        ? firstOrLastCell(weeks, false)
        : firstOrLastCellInRow(weeks, pos.day, false)
      break
    case 'End':
      target = withModifier
        ? firstOrLastCell(weeks, true)
        : firstOrLastCellInRow(weeks, pos.day, true)
      break
    default:
      return null
  }
  return target?.date ?? currentDate
}

/**
 * Picks the cell that carries `tabIndex=0` in the roving tabindex:
 * the last focused date if still rendered, else the selected day, else the latest day.
 */
export function resolveHeatmapTabStopDate(
  cells: readonly HeatmapDayCell[],
  focusedDate: string | null,
  selectedDay: string | undefined
): string | null {
  if (cells.length === 0) return null
  const has = (date: string | null | undefined): date is string =>
    Boolean(date) && cells.some((c) => c.date === date)
  if (has(focusedDate)) return focusedDate
  if (has(selectedDay)) return selectedDay
  return cells[cells.length - 1].date
}
