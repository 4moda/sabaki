import { describe, expect, it } from 'vitest'
import { buildActivityHeatmap } from '@core/domain/services'
import { buildHeatmapWeekColumns } from '../heatmapLayout'
import { getNextHeatmapFocusDate, resolveHeatmapTabStopDate } from '../heatmapNavigation'

// Rolling window 2025-11-21 (Fri) .. 2026-11-19 (Thu): 5 leading and 2 trailing blanks
const { cells } = buildActivityHeatmap([], { referenceDate: '2026-11-19' })
const weeks = buildHeatmapWeekColumns(cells)

type Modifiers = { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }

const move = (date: string, key: string, mods: Modifiers = {}) =>
  getNextHeatmapFocusDate(weeks, date, { key, ...mods })

describe('heatmapNavigation (renderer pure helpers)', () => {
  describe('getNextHeatmapFocusDate', () => {
    it('moves to the same weekday of the previous / next week with ArrowLeft / ArrowRight', () => {
      expect(move('2026-06-10', 'ArrowLeft')).toBe('2026-06-03')
      expect(move('2026-06-10', 'ArrowRight')).toBe('2026-06-17')
    })

    it('moves to the previous / next day with ArrowUp / ArrowDown, wrapping across weeks', () => {
      expect(move('2026-06-10', 'ArrowUp')).toBe('2026-06-09')
      expect(move('2026-06-10', 'ArrowDown')).toBe('2026-06-11')
      // Saturday -> next Sunday (next column), Sunday -> previous Saturday
      expect(move('2026-06-13', 'ArrowDown')).toBe('2026-06-14')
      expect(move('2026-06-14', 'ArrowUp')).toBe('2026-06-13')
    })

    it('keeps focus in place at the edges of the period', () => {
      expect(move('2025-11-21', 'ArrowUp')).toBe('2025-11-21')
      expect(move('2025-11-21', 'ArrowLeft')).toBe('2025-11-21')
      // first Saturday of the window: previous week is a leading blank
      expect(move('2025-11-22', 'ArrowLeft')).toBe('2025-11-22')
      expect(move('2026-11-19', 'ArrowDown')).toBe('2026-11-19')
      expect(move('2026-11-19', 'ArrowRight')).toBe('2026-11-19')
      // last Monday of the window: next week's Monday is after the end date
      expect(move('2026-11-16', 'ArrowRight')).toBe('2026-11-16')
    })

    it('Home / End jump to the first / last day of the same weekday row', () => {
      // Wednesday row: first Wednesday in the window is 2025-11-26, last is 2026-11-18
      expect(move('2026-06-10', 'Home')).toBe('2025-11-26')
      expect(move('2026-06-10', 'End')).toBe('2026-11-18')
      // Friday row starts in the first (partial) column
      expect(move('2026-06-12', 'Home')).toBe('2025-11-21')
    })

    it('Ctrl/Cmd + Home / End jump to the first / last day of the period', () => {
      expect(move('2026-06-10', 'Home', { ctrlKey: true })).toBe('2025-11-21')
      expect(move('2026-06-10', 'End', { ctrlKey: true })).toBe('2026-11-19')
      expect(move('2026-06-10', 'End', { metaKey: true })).toBe('2026-11-19')
    })

    it('passes through Alt / Shift with any key and Ctrl/Cmd with arrow keys', () => {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
        expect(move('2026-06-10', key, { altKey: true })).toBeNull()
        expect(move('2026-06-10', key, { shiftKey: true })).toBeNull()
      }
      expect(move('2026-06-10', 'Home', { ctrlKey: true, shiftKey: true })).toBeNull()
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        expect(move('2026-06-10', key, { ctrlKey: true })).toBeNull()
        expect(move('2026-06-10', key, { metaKey: true })).toBeNull()
      }
    })

    it('returns null for non-navigation keys and unknown dates', () => {
      expect(move('2026-06-10', 'Enter')).toBeNull()
      expect(move('2026-06-10', ' ')).toBeNull()
      expect(move('2026-06-10', 'Tab')).toBeNull()
      expect(move('2027-01-01', 'ArrowLeft')).toBeNull()
    })
  })

  describe('resolveHeatmapTabStopDate', () => {
    it('prefers the last focused date while it is still rendered', () => {
      expect(resolveHeatmapTabStopDate(cells, '2026-03-03', '2026-05-05')).toBe('2026-03-03')
    })

    it('falls back to the selected day, then to the latest day', () => {
      expect(resolveHeatmapTabStopDate(cells, null, '2026-05-05')).toBe('2026-05-05')
      expect(resolveHeatmapTabStopDate(cells, '1999-01-01', undefined)).toBe('2026-11-19')
      // selected day outside the visible range is ignored
      expect(resolveHeatmapTabStopDate(cells, null, '2020-01-01')).toBe('2026-11-19')
    })

    it('returns null when there are no cells', () => {
      expect(resolveHeatmapTabStopDate([], '2026-03-03', '2026-05-05')).toBeNull()
    })
  })
})
