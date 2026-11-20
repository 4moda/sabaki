import { describe, expect, it } from 'vitest'
import {
  buildActivityHeatmap,
  calculateHeatmapLevel,
  type HeatmapDailyRow
} from '@core/domain/services'

describe('HeatmapDomainService', () => {
  describe('calculateHeatmapLevel', () => {
    it('maps shot count thresholds to intensity levels 0..4 when maxCount is omitted', () => {
      expect(calculateHeatmapLevel(-5)).toBe(0)
      expect(calculateHeatmapLevel(0)).toBe(0)
      expect(calculateHeatmapLevel(1)).toBe(1)
      expect(calculateHeatmapLevel(29)).toBe(1)
      expect(calculateHeatmapLevel(30)).toBe(2)
      expect(calculateHeatmapLevel(99)).toBe(2)
      expect(calculateHeatmapLevel(100)).toBe(3)
      expect(calculateHeatmapLevel(249)).toBe(3)
      expect(calculateHeatmapLevel(250)).toBe(4)
      expect(calculateHeatmapLevel(1200)).toBe(4)
    })

    it('scales intensity levels 1..4 relatively when maxCount > 0 and falls back when maxCount <= 0', () => {
      expect(calculateHeatmapLevel(0, 8)).toBe(0)
      expect(calculateHeatmapLevel(1, 8)).toBe(1)
      expect(calculateHeatmapLevel(2, 8)).toBe(1)
      expect(calculateHeatmapLevel(3, 8)).toBe(2)
      expect(calculateHeatmapLevel(4, 8)).toBe(2)
      expect(calculateHeatmapLevel(5, 8)).toBe(3)
      expect(calculateHeatmapLevel(6, 8)).toBe(3)
      expect(calculateHeatmapLevel(7, 8)).toBe(4)
      expect(calculateHeatmapLevel(8, 8)).toBe(4)
      expect(calculateHeatmapLevel(12, 8)).toBe(4)

      expect(calculateHeatmapLevel(1, 4)).toBe(1)
      expect(calculateHeatmapLevel(2, 4)).toBe(2)
      expect(calculateHeatmapLevel(3, 4)).toBe(3)
      expect(calculateHeatmapLevel(4, 4)).toBe(4)

      // Non-positive maxCount falls back to static thresholds
      expect(calculateHeatmapLevel(5, 0)).toBe(1)
      expect(calculateHeatmapLevel(35, -1)).toBe(2)
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

    it('distributes low-volume daily shot counts across levels 1..4 relative to peak day', () => {
      const heatmap = buildActivityHeatmap(
        [
          { date: '2026-11-10', count: 1 },
          { date: '2026-11-11', count: 2 },
          { date: '2026-11-12', count: 4 },
          { date: '2026-11-13', count: 6 }
        ],
        { referenceDate: '2026-11-19' }
      )

      const levelByDate = (date: string) =>
        heatmap.cells.find((c) => c.date === date)?.level

      expect(levelByDate('2026-11-09')).toBe(0)
      expect(levelByDate('2026-11-10')).toBe(1)
      expect(levelByDate('2026-11-11')).toBe(2)
      expect(levelByDate('2026-11-12')).toBe(3)
      expect(levelByDate('2026-11-13')).toBe(4)
    })
  })
})
