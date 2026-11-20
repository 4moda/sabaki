import type { HeatmapDayCell, HeatmapSummary } from '../models/DashboardAnalytics'

/**
 * Daily aggregated shot count row used as input for building an activity heatmap.
 */
export interface HeatmapDailyRow {
  date: string
  count: number
  topCamera?: string
  topLens?: string
}

/**
 * Configuration options for building the shooting activity heatmap.
 */
export interface HeatmapBuildOptions {
  /**
   * When specified, generates cells for the entire calendar year (Jan 1 – Dec 31).
   * When omitted, generates a rolling 52-week (364-day) window ending on `referenceDate`.
   */
  year?: number
  /**
   * Reference date (YYYY-MM-DD or Date) for calculating `currentStreakDays`
   * and the rolling 52-week end boundary. Defaults to the current date.
   */
  referenceDate?: Date | string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const ROLLING_52_WEEK_DAYS = 52 * 7

/**
 * Formats a UTC timestamp (ms) into `YYYY-MM-DD`.
 */
function formatUtcDate(utcMs: number): string {
  const date = new Date(utcMs)
  const y = String(date.getUTCFullYear()).padStart(4, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Parses a `YYYY-MM-DD` string or `Date` into a midnight UTC timestamp (ms).
 */
function toUtcMidnightMs(input: Date | string): number {
  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim())
    if (match) {
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
    const parsed = new Date(input)
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid reference date: ${input}`)
    }
    return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  }

  if (Number.isNaN(input.getTime())) {
    throw new Error(`Invalid reference date: ${String(input)}`)
  }
  return Date.UTC(input.getFullYear(), input.getMonth(), input.getDate())
}

/**
 * Maps a daily shot count to a GitHub Contribution-style intensity level (0..4).
 *
 * When `maxCount` (> 0) is provided, scales `1..maxCount` dynamically across levels `1..4`
 * relative to the peak daily count. When `maxCount` is omitted or non-positive, falls back
 * to backward-compatible static thresholds:
 * - 0       -> 0
 * - 1..29   -> 1
 * - 30..99  -> 2
 * - 100..249 -> 3
 * - 250+    -> 4
 */
export function calculateHeatmapLevel(
  count: number,
  maxCount?: number
): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (maxCount !== undefined && Number.isFinite(maxCount) && maxCount > 0) {
    const ratio = count / maxCount
    if (ratio <= 0.25) return 1
    if (ratio <= 0.5) return 2
    if (ratio <= 0.75) return 3
    return 4
  }
  if (count <= 29) return 1
  if (count <= 99) return 2
  if (count <= 249) return 3
  return 4
}

/**
 * Builds a 52-week (or full calendar year) GitHub-style daily shooting activity heatmap
 * along with active days, longest streak, current streak, and peak daily shots.
 */
export function buildActivityHeatmap(
  rows: HeatmapDailyRow[],
  options?: HeatmapBuildOptions
): HeatmapSummary {
  const refUtcMs = toUtcMidnightMs(options?.referenceDate ?? new Date())
  const refYear = new Date(refUtcMs).getUTCFullYear()

  let startUtcMs: number
  let endUtcMs: number
  let summaryYear: number

  if (options?.year !== undefined) {
    summaryYear = options.year
    startUtcMs = Date.UTC(options.year, 0, 1)
    endUtcMs = Date.UTC(options.year, 11, 31)
  } else {
    summaryYear = refYear
    endUtcMs = refUtcMs
    startUtcMs = endUtcMs - (ROLLING_52_WEEK_DAYS - 1) * MS_PER_DAY
  }

  // Merge rows by YYYY-MM-DD in case duplicate dates exist
  const rowMap = new Map<string, HeatmapDailyRow>()
  for (const row of rows) {
    const key = row.date.trim()
    const safeCount = Math.max(0, Math.floor(row.count))
    const existing = rowMap.get(key)
    if (!existing) {
      rowMap.set(key, {
        date: key,
        count: safeCount,
        topCamera: row.topCamera,
        topLens: row.topLens
      })
    } else {
      const mergedCount = existing.count + safeCount
      const preferIncoming = safeCount > existing.count
      rowMap.set(key, {
        date: key,
        count: mergedCount,
        topCamera: preferIncoming
          ? (row.topCamera ?? existing.topCamera)
          : (existing.topCamera ?? row.topCamera),
        topLens: preferIncoming
          ? (row.topLens ?? existing.topLens)
          : (existing.topLens ?? row.topLens)
      })
    }
  }

  const cells: HeatmapDayCell[] = []
  let totalActiveDays = 0
  let longestStreakDays = 0
  let runningStreak = 0
  let maxDailyShots = { date: '', count: 0 }

  for (let cursor = startUtcMs; cursor <= endUtcMs; cursor += MS_PER_DAY) {
    const dateStr = formatUtcDate(cursor)
    const entry = rowMap.get(dateStr)
    const count = entry?.count ?? 0

    const cell: HeatmapDayCell = {
      date: dateStr,
      count,
      level: 0,
      ...(entry?.topCamera ? { topCamera: entry.topCamera } : {}),
      ...(entry?.topLens ? { topLens: entry.topLens } : {})
    }
    cells.push(cell)

    if (count > 0) {
      totalActiveDays += 1
      runningStreak += 1
      if (runningStreak > longestStreakDays) {
        longestStreakDays = runningStreak
      }
      if (count > maxDailyShots.count) {
        maxDailyShots = { date: dateStr, count }
      }
    } else {
      runningStreak = 0
    }
  }

  if (maxDailyShots.count > 0) {
    for (const cell of cells) {
      if (cell.count > 0) {
        cell.level = calculateHeatmapLevel(cell.count, maxDailyShots.count)
      }
    }
  }

  // Compute currentStreakDays anchored at min(refUtcMs, endUtcMs)
  let currentStreakDays = 0
  const anchorUtcMs = Math.min(refUtcMs, endUtcMs)
  if (anchorUtcMs >= startUtcMs) {
    const anchorIndex = Math.round((anchorUtcMs - startUtcMs) / MS_PER_DAY)
    let cursorIndex = anchorIndex

    // If today (refUtcMs) has 0 shots so far, allow an ongoing streak from yesterday
    if (
      anchorUtcMs === refUtcMs &&
      cursorIndex > 0 &&
      cells[cursorIndex]?.count === 0 &&
      cells[cursorIndex - 1]?.count > 0
    ) {
      cursorIndex -= 1
    }

    while (cursorIndex >= 0 && cells[cursorIndex].count > 0) {
      currentStreakDays += 1
      cursorIndex -= 1
    }
  }

  return {
    year: summaryYear,
    cells,
    totalActiveDays,
    longestStreakDays,
    currentStreakDays,
    maxDailyShots
  }
}
