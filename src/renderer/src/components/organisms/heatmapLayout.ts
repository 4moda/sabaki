import type { HeatmapDayCell } from '@core/domain/models'

export type HeatmapWeekColumn = Array<HeatmapDayCell | null>

export interface HeatmapMonthMarker {
  weekIndex: number
  label: string
}

const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月'
]

function parseDayOfWeek(dateStr: string): number {
  const date = new Date(`${dateStr}T00:00:00`)
  return Number.isNaN(date.getTime()) ? 0 : date.getDay()
}

function parseMonthIndex(dateStr: string): number {
  const parts = dateStr.split('-')
  const month = Number(parts[1])
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : -1
}

/**
 * Formats `YYYY-MM-DD` as `YYYY/MM/DD` for heatmap titles and notes.
 */
export function formatHeatmapDate(dateStr: string): string {
  return dateStr.replace(/-/g, '/')
}

/**
 * Formats a Date as local `YYYY-MM-DD` (used as "today" for the period label).
 */
export function toLocalDateKey(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Splits day cells into Sunday-first week columns, padding the first and last week with `null`.
 */
export function buildHeatmapWeekColumns(cells: readonly HeatmapDayCell[]): HeatmapWeekColumn[] {
  if (cells.length === 0) return []

  const padded: HeatmapWeekColumn = []
  const leadingBlanks = parseDayOfWeek(cells[0].date)
  for (let i = 0; i < leadingBlanks; i += 1) {
    padded.push(null)
  }
  padded.push(...cells)
  while (padded.length % 7 !== 0) {
    padded.push(null)
  }

  const weeks: HeatmapWeekColumn[] = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }
  return weeks
}

/**
 * Places a month label only at the week column containing the month's 1st day.
 * A partial leading month stays unlabeled, so a rolling 52-week window never shows
 * the same month twice.
 */
export function buildHeatmapMonthMarkers(
  weeks: readonly HeatmapWeekColumn[]
): HeatmapMonthMarker[] {
  const markers: HeatmapMonthMarker[] = []
  weeks.forEach((week, weekIndex) => {
    const firstOfMonth = week.find(
      (c): c is HeatmapDayCell => c !== null && c.date.endsWith('-01')
    )
    if (!firstOfMonth) return
    const monthIdx = parseMonthIndex(firstOfMonth.date)
    if (monthIdx >= 0) {
      markers.push({ weekIndex, label: MONTH_LABELS[monthIdx] })
    }
  })
  return markers
}

/**
 * Builds the period part of the heatmap title:
 * - year mode                       -> `2026年`
 * - rolling window ending today     -> `直近52週間`
 * - rolling window ending earlier   -> `2026/11/19 までの52週間`
 */
export function formatHeatmapPeriodLabel(input: {
  isRollingWindow: boolean
  year: number
  lastDate?: string
  today: string
}): string {
  if (!input.isRollingWindow) return `${input.year}年`
  if (!input.lastDate || input.lastDate === input.today) return '直近52週間'
  return `${formatHeatmapDate(input.lastDate)} までの52週間`
}
