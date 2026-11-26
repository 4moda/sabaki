import { describe, expect, it } from 'vitest'
import {
  buildActivityHeatmap,
  buildHeatmapLevelScale,
  calculateHeatmapLevel,
  type HeatmapDailyRow
} from '@core/domain/services'

describe('HeatmapDomainService', () => {
  describe('buildHeatmapLevelScale', () => {
    it('derives 25/50/75th percentile thresholds and max from non-zero daily counts only', () => {
      const scale = buildHeatmapLevelScale([0, 0, 8, 1, 2, 4, 0, 3, 5, 6, 7])
      // active (sorted): 1,2,3,4,5,6,7,8 -> nearest-rank percentiles
      expect(scale).toEqual({ thresholds: [2, 4, 6], max: 8 })
    })

    it('returns an all-zero scale when there are no active days', () => {
      expect(buildHeatmapLevelScale([])).toEqual({ thresholds: [0, 0, 0], max: 0 })
      expect(buildHeatmapLevelScale([0, 0, -3])).toEqual({ thresholds: [0, 0, 0], max: 0 })
    })
  })

  describe('calculateHeatmapLevel', () => {
    it('maps counts to levels 0..4 relative to the scale (0 shots -> 0, peak -> 4)', () => {
      const scale = buildHeatmapLevelScale([1, 2, 3, 4, 5, 6, 7, 8])
      expect(calculateHeatmapLevel(-5, scale)).toBe(0)
      expect(calculateHeatmapLevel(0, scale)).toBe(0)
      expect(calculateHeatmapLevel(1, scale)).toBe(1)
      expect(calculateHeatmapLevel(2, scale)).toBe(1)
      expect(calculateHeatmapLevel(3, scale)).toBe(2)
      expect(calculateHeatmapLevel(4, scale)).toBe(2)
      expect(calculateHeatmapLevel(5, scale)).toBe(3)
      expect(calculateHeatmapLevel(6, scale)).toBe(3)
      expect(calculateHeatmapLevel(7, scale)).toBe(4)
      expect(calculateHeatmapLevel(8, scale)).toBe(4)
    })

    it('keeps at least Level 1 for any day with shots, even next to a huge outlier', () => {
      const scale = buildHeatmapLevelScale([1, 1, 1, 2, 3, 1200])
      expect(calculateHeatmapLevel(1, scale)).toBe(1)
      expect(calculateHeatmapLevel(3, scale)).toBe(3)
      expect(calculateHeatmapLevel(1200, scale)).toBe(4)
    })

    it('distinguishes small daily counts that the old fixed thresholds lumped into Level 1', () => {
      const scale = buildHeatmapLevelScale([2, 5, 10, 20, 29])
      const levels = [2, 5, 10, 20, 29].map((c) => calculateHeatmapLevel(c, scale))
      expect(new Set(levels).size).toBeGreaterThanOrEqual(4)
      expect(levels).toEqual([1, 1, 2, 3, 4])
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
        level: 4,
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
        level: 4,
        topCamera: 'ILCE-7M4',
        topLens: 'FE 35mm F1.4 GM'
      })
    })
  })
})
