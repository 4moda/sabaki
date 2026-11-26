import { describe, expect, it } from 'vitest'
import {
  buildActivityHeatmap,
  buildHeatmapLevelScale,
  calculateHeatmapLevel,
  type HeatmapDailyRow
} from '@core/domain/services'

describe('HeatmapDomainService', () => {
  describe('buildHeatmapLevelScale', () => {
    it('ranks de-duplicated non-zero counts: peak -> max, the rest split into Level 1..3', () => {
      const scale = buildHeatmapLevelScale([0, 0, 8, 1, 2, 4, 0, 3, 5, 6, 7, 7, 1])
      // distinct: 1..8 -> peak 8, below-peak 1..7 split by rank into 3 groups
      expect(scale).toEqual({ thresholds: [3, 5, 7], max: 8 })
    })

    it('returns a scale without thresholds when there are no active days or only one distinct count', () => {
      expect(buildHeatmapLevelScale([])).toEqual({ thresholds: null, max: 0 })
      expect(buildHeatmapLevelScale([0, 0, -3])).toEqual({ thresholds: null, max: 0 })
      expect(buildHeatmapLevelScale([5, 5, 5])).toEqual({ thresholds: null, max: 5 })
    })
  })

  describe('calculateHeatmapLevel', () => {
    const levelsFor = (counts: number[]) => {
      const scale = buildHeatmapLevelScale(counts)
      return counts.map((c) => calculateHeatmapLevel(c, scale))
    }

    it('maps counts to levels 0..4 relative to the scale (0 shots -> 0, only the peak -> 4)', () => {
      const scale = buildHeatmapLevelScale([1, 2, 3, 4, 5, 6, 7, 8])
      expect(calculateHeatmapLevel(-5, scale)).toBe(0)
      expect(calculateHeatmapLevel(0, scale)).toBe(0)
      expect([1, 2, 3, 4, 5, 6, 7, 8].map((c) => calculateHeatmapLevel(c, scale))).toEqual([
        1, 1, 1, 2, 2, 3, 3, 4
      ])
    })

    it('does not let many identical small counts push a slightly larger day to Level 4', () => {
      const counts = [...Array<number>(90).fill(1), ...Array<number>(5).fill(2), 50]
      const scale = buildHeatmapLevelScale(counts)
      expect(calculateHeatmapLevel(1, scale)).toBe(1)
      expect(calculateHeatmapLevel(2, scale)).toBe(2)
      expect(calculateHeatmapLevel(50, scale)).toBe(4)
    })

    it('keeps consecutive levels for few distinct counts', () => {
      expect(levelsFor([1, 1, 1, 1, 2, 3])).toEqual([1, 1, 1, 1, 2, 4])
      expect(levelsFor([1, 1, 1, 2, 3, 1200])).toEqual([1, 1, 1, 2, 3, 4])
    })

    it('uses the middle Level 2 (not the peak color) when all active days share one count', () => {
      expect(levelsFor([7, 7, 7, 0])).toEqual([2, 2, 2, 0])
      // a single active day
      expect(levelsFor([0, 42, 0])).toEqual([0, 2, 0])
    })

    it('distinguishes small daily counts that the old fixed thresholds lumped into Level 1', () => {
      expect(levelsFor([2, 5, 10, 20, 29])).toEqual([1, 1, 2, 3, 4])
    })
  })

  describe('buildActivityHeatmap', () => {
    it('builds a full calendar year grid (365 days for 2026, 366 days for leap year 2024)', () => {
      const heatmap2026 = buildActivityHeatmap([], {
        year: 2026,
        referenceDate: '2026-11-19'
      })
      expect(heatmap2026.year).toBe(2026)
      expect(heatmap2026.cells).toHaveLength(365)
      expect(heatmap2026.cells[0].date).toBe('2026-01-01')
      expect(heatmap2026.cells[364].date).toBe('2026-12-31')
      expect(heatmap2026.totalActiveDays).toBe(0)
      expect(heatmap2026.longestStreakDays).toBe(0)
      expect(heatmap2026.currentStreakDays).toBe(0)
      expect(heatmap2026.maxDailyShots).toEqual({ date: '', count: 0 })

      const heatmap2024 = buildActivityHeatmap([], {
        year: 2024,
        referenceDate: '2024-12-31'
      })
      expect(heatmap2024.cells).toHaveLength(366)
      expect(heatmap2024.cells.find((c) => c.date === '2024-02-29')).toBeDefined()
    })

    it('builds a rolling 52-week (364-day) heatmap when year is omitted', () => {
      const heatmap = buildActivityHeatmap(
        [{ date: '2026-11-19', count: 42, topCamera: 'ILCE-7M4', topLens: 'FE 35mm F1.4 GM' }],
        { referenceDate: '2026-11-19' }
      )
      expect(heatmap.year).toBe(2026)
      expect(heatmap.cells).toHaveLength(364)
      expect(heatmap.cells[heatmap.cells.length - 1]).toEqual({
        date: '2026-11-19',
        count: 42,
        level: 2,
        topCamera: 'ILCE-7M4',
        topLens: 'FE 35mm F1.4 GM'
      })
      expect(heatmap.totalActiveDays).toBe(1)
      expect(heatmap.currentStreakDays).toBe(1)
    })

    it('computes active days, longest streak, current streak, and maxDailyShots accurately', () => {
      const rows: HeatmapDailyRow[] = [
        // 4-day streak in October
        { date: '2026-10-01', count: 15 },
        { date: '2026-10-02', count: 45 },
        { date: '2026-10-03', count: 310, topCamera: 'ILCE-7M4' },
        { date: '2026-10-04', count: 120 },
        // 2-day current streak ending on referenceDate
        { date: '2026-11-18', count: 25 },
        { date: '2026-11-19', count: 80 }
      ]

      const heatmap = buildActivityHeatmap(rows, {
        year: 2026,
        referenceDate: '2026-11-19'
      })

      expect(heatmap.totalActiveDays).toBe(6)
      expect(heatmap.longestStreakDays).toBe(4)
      expect(heatmap.currentStreakDays).toBe(2)
      expect(heatmap.maxDailyShots).toEqual({ date: '2026-10-03', count: 310 })

      const peakCell = heatmap.cells.find((c) => c.date === '2026-10-03')
      expect(peakCell?.level).toBe(4)
      expect(peakCell?.topCamera).toBe('ILCE-7M4')
    })

    it('keeps currentStreakDays alive when yesterday was active and resets to 0 after a full missed day', () => {
      const yesterdayActive = buildActivityHeatmap(
        [
          { date: '2026-11-16', count: 10 },
          { date: '2026-11-17', count: 20 },
          { date: '2026-11-18', count: 30 }
        ],
        { year: 2026, referenceDate: '2026-11-19' }
      )
      expect(yesterdayActive.currentStreakDays).toBe(3)

      const brokenStreak = buildActivityHeatmap(
        [
          { date: '2026-11-16', count: 10 },
          { date: '2026-11-17', count: 20 }
        ],
        { year: 2026, referenceDate: '2026-11-19' }
      )
      expect(brokenStreak.currentStreakDays).toBe(0)
    })

    it('scales levels relative to the displayed window, ignoring rows outside of it', () => {
      const heatmap = buildActivityHeatmap(
        [
          // Outside of the rolling 52-week window: must not flatten the in-window scale
          { date: '2024-01-01', count: 1000 },
          { date: '2026-11-16', count: 1 },
          { date: '2026-11-17', count: 2 },
          { date: '2026-11-18', count: 3 },
          { date: '2026-11-19', count: 4 }
        ],
        { referenceDate: '2026-11-19' }
      )
      const levelOf = (date: string) => heatmap.cells.find((c) => c.date === date)?.level
      expect(levelOf('2026-11-15')).toBe(0)
      expect(levelOf('2026-11-16')).toBe(1)
      expect(levelOf('2026-11-17')).toBe(2)
      expect(levelOf('2026-11-18')).toBe(3)
      expect(levelOf('2026-11-19')).toBe(4)
    })

    it('keeps all cells but computes summary values from the selected day only when selectedDay is set', () => {
      const rows: HeatmapDailyRow[] = [
        { date: '2026-11-10', count: 30 },
        { date: '2026-11-17', count: 5 },
        { date: '2026-11-18', count: 2 },
        { date: '2026-11-19', count: 8 }
      ]
      const calendar = buildActivityHeatmap(rows, { referenceDate: '2026-11-19' })
      const selected = buildActivityHeatmap(rows, {
        referenceDate: '2026-11-19',
        selectedDay: '2026-11-18'
      })

      expect(selected.cells).toEqual(calendar.cells)
      expect(selected.cells.filter((c) => c.count > 0)).toHaveLength(4)
      expect(selected.totalActiveDays).toBe(1)
      expect(selected.longestStreakDays).toBe(1)
      // yesterday's shooting counts as a streak still alive on the reference date
      expect(selected.currentStreakDays).toBe(1)
      expect(selected.maxDailyShots).toEqual({ date: '2026-11-18', count: 2 })

      expect(calendar.totalActiveDays).toBe(4)
      expect(calendar.longestStreakDays).toBe(3)
      expect(calendar.maxDailyShots).toEqual({ date: '2026-11-10', count: 30 })
    })

    it('merges duplicate date rows by summing shot counts', () => {
      const heatmap = buildActivityHeatmap(
        [
          { date: '2026-11-19', count: 20, topCamera: 'A7C' },
          { date: '2026-11-19', count: 90, topCamera: 'ILCE-7M4', topLens: 'FE 35mm F1.4 GM' }
        ],
        { year: 2026, referenceDate: '2026-11-19' }
      )
      const cell = heatmap.cells.find((c) => c.date === '2026-11-19')
      expect(cell).toEqual({
        date: '2026-11-19',
        count: 110,
        level: 2,
        topCamera: 'ILCE-7M4',
        topLens: 'FE 35mm F1.4 GM'
      })
    })
  })
})
