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
  /**
   * Day (YYYY-MM-DD) selected on the heatmap. When specified, `cells` still cover the
   * whole window built from all `rows` (so the calendar and other active days stay
   * visible), while the summary values (active days, streaks, peak) are computed from
   * the selected day's row only, consistent with the day-filtered KPIs.
   */
  selectedDay?: string
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
 * Relative intensity scale derived from the daily shot counts inside the displayed window.
 * - `thresholds`: upper bounds (inclusive) of Level 1..3 for non-peak days,
 *   or `null` when every active day has the same count (no contrast to show)
 * - `max`: the peak daily count (only the peak reaches Level 4)
 */
export interface HeatmapLevelScale {
  thresholds: readonly [number, number, number] | null
  max: number
}

/** Level used when all active days share the same count (or there is only one). */
const UNIFORM_ACTIVE_LEVEL = 2

/**
 * Builds a relative level scale from daily shot counts.
 *
 * Counts are de-duplicated first so that many days with the same count (e.g. ninety
 * 1-shot days) cannot collapse the percentiles. The peak value gets Level 4, and the
 * remaining distinct values are split by rank into Level 1..3 without skipping levels.
 */
export function buildHeatmapLevelScale(counts: readonly number[]): HeatmapLevelScale {
  const distinct = Array.from(
    new Set(counts.filter((c) => Number.isFinite(c) && c > 0).map((c) => Math.floor(c)))
  ).sort((a, b) => a - b)

  if (distinct.length === 0) {
    return { thresholds: null, max: 0 }
  }

  const max = distinct[distinct.length - 1]
  const belowPeak = distinct.slice(0, -1)
  if (belowPeak.length === 0) {
    return { thresholds: null, max }
  }

  // Rank r (0-based) among the m non-peak values maps to level 1 + floor(3r / m)
  const m = belowPeak.length
  const upperBound = (level: number): number => {
    let bound = belowPeak[0]
    belowPeak.forEach((value, rank) => {
      if (1 + Math.floor((3 * rank) / m) <= level) bound = value
    })
    return bound
  }

  return { thresholds: [upperBound(1), upperBound(2), upperBound(3)], max }
}

/**
 * Maps a daily shot count to a GitHub Contribution-style intensity level (0..4)
 * relative to the given scale:
 * - 0 shots                         -> 0
 * - all active days share one count -> 2 (avoids painting everything in the peak color)
 * - peak day (count >= max)         -> 4
 * - otherwise                       -> 1..3 by distinct-value rank thresholds
 */
export function calculateHeatmapLevel(
  count: number,
  scale: HeatmapLevelScale
): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(count) || count <= 0) return 0
  if (scale.thresholds === null) return UNIFORM_ACTIVE_LEVEL
  if (count >= scale.max) return 4
  const [t1, t2] = scale.thresholds
  if (count <= t1) return 1
  if (count <= t2) return 2
  return 3
}

/**
 * Builds a 52-week (or full calendar year) GitHub-style daily shooting activity heatmap
 * along with active days, longest streak, current streak, and peak daily shots.
 */
export function buildActivityHeatmap(
  rows: HeatmapDailyRow[],
  options?: HeatmapBuildOptions
): HeatmapSummary {
  const selectedDay = options?.selectedDay?.trim()
  if (selectedDay) {
    const calendar = buildActivityHeatmap(rows, { ...options, selectedDay: undefined })
    const daySummary = buildActivityHeatmap(
      rows.filter((row) => row.date.trim() === selectedDay),
      { ...options, selectedDay: undefined }
    )
    return { ...daySummary, cells: calendar.cells }
  }

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

  const windowDates: string[] = []
  for (let cursor = startUtcMs; cursor <= endUtcMs; cursor += MS_PER_DAY) {
    windowDates.push(formatUtcDate(cursor))
  }
  // Intensity levels are relative to the shot counts inside the displayed window only
  const levelScale = buildHeatmapLevelScale(
    windowDates.map((date) => rowMap.get(date)?.count ?? 0)
  )

  const cells: HeatmapDayCell[] = []
  let totalActiveDays = 0
  let longestStreakDays = 0
  let runningStreak = 0
  let maxDailyShots = { date: '', count: 0 }

  for (const dateStr of windowDates) {
    const entry = rowMap.get(dateStr)
    const count = entry?.count ?? 0

    const cell: HeatmapDayCell = {
      date: dateStr,
      count,
      level: calculateHeatmapLevel(count, levelScale),
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
