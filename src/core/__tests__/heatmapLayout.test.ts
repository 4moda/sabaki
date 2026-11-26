import { describe, expect, it } from 'vitest'
import { buildActivityHeatmap } from '@core/domain/services'
import {
  buildHeatmapMonthMarkers,
  buildHeatmapWeekColumns,
  formatHeatmapPeriodLabel
} from '@renderer/components/organisms/heatmapLayout'

describe('heatmapLayout (renderer pure helpers)', () => {
  describe('buildHeatmapWeekColumns', () => {
    it('pads to Sunday-first week columns of 7 days', () => {
      const { cells } = buildActivityHeatmap([], { referenceDate: '2026-11-19' })
      const weeks = buildHeatmapWeekColumns(cells)
      expect(weeks.every((w) => w.length === 7)).toBe(true)
      expect(weeks.flat().filter((c) => c !== null)).toHaveLength(364)
      // window starts on 2025-11-21 (Friday) -> 5 leading blanks
      expect(weeks[0].slice(0, 5)).toEqual([null, null, null, null, null])
      expect(weeks[0][5]?.date).toBe('2025-11-21')
    })

    it('returns no columns for empty cells', () => {
      expect(buildHeatmapWeekColumns([])).toEqual([])
    })
  })

  describe('buildHeatmapMonthMarkers', () => {
    it('labels each month once at the column containing its 1st day (rolling window)', () => {
      const { cells } = buildActivityHeatmap([], { referenceDate: '2026-11-19' })
      const markers = buildHeatmapMonthMarkers(buildHeatmapWeekColumns(cells))
      const labels = markers.map((m) => m.label)
      // partial leading November 2025 is not labeled -> no duplicated 11月
      expect(labels).toEqual([
        '12月',
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
        '11月'
      ])
      expect(new Set(labels).size).toBe(labels.length)
      const weekIndexes = markers.map((m) => m.weekIndex)
      expect([...weekIndexes].sort((a, b) => a - b)).toEqual(weekIndexes)
    })

    it('labels all 12 months starting at column 0 for a calendar year', () => {
      const { cells } = buildActivityHeatmap([], { year: 2026, referenceDate: '2026-11-19' })
      const markers = buildHeatmapMonthMarkers(buildHeatmapWeekColumns(cells))
      expect(markers).toHaveLength(12)
      expect(markers[0]).toEqual({ weekIndex: 0, label: '1月' })
    })
  })

  describe('formatHeatmapPeriodLabel', () => {
    it('uses the year for year mode', () => {
      expect(
        formatHeatmapPeriodLabel({
          isRollingWindow: false,
          year: 2026,
          lastDate: '2026-12-31',
          today: '2026-11-26'
        })
      ).toBe('2026年')
    })

    it('says 直近52週間 only when the rolling window ends today', () => {
      expect(
        formatHeatmapPeriodLabel({
          isRollingWindow: true,
          year: 2026,
          lastDate: '2026-11-26',
          today: '2026-11-26'
        })
      ).toBe('直近52週間')
      expect(
        formatHeatmapPeriodLabel({
          isRollingWindow: true,
          year: 2026,
          lastDate: '2026-11-19',
          today: '2026-11-26'
        })
      ).toBe('2026/11/19 までの52週間')
    })
  })
})
