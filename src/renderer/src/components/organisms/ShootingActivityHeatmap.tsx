import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { clsx } from 'clsx'
import { CalendarDays, Flame, Trophy, Zap } from 'lucide-react'
import type { HeatmapDayCell, HeatmapSummary } from '@core/domain/models'
import { Badge, Card, HeatmapCell, type HeatmapLevel } from '../atoms'
import { HEATMAP_LEVEL_CLASSES } from '../atoms/HeatmapCell'

export interface ShootingActivityHeatmapProps {
  heatmap: HeatmapSummary
  selectedDay?: string
  onSelectDay?: (date: string) => void
  periodLabel?: string
  className?: string
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

const WEEKDAY_LABELS: Array<{ row: number; label: string }> = [
  { row: 0, label: '日' },
  { row: 1, label: '月' },
  { row: 3, label: '水' },
  { row: 5, label: '金' }
]

const LEGEND_LEVELS: HeatmapLevel[] = [0, 1, 2, 3, 4]

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
 * GitHub Contribution-style 52-week x 7-day Shooting Activity Calendar Heatmap
 * with active days, streak badges, hover detail bar, and click-to-drill-down day filtering.
 */
export function ShootingActivityHeatmap({
  heatmap,
  selectedDay,
  onSelectDay,
  periodLabel,
  className
}: ShootingActivityHeatmapProps): ReactElement {
  const [hoveredCell, setHoveredCell] = useState<HeatmapDayCell | null>(null)
  const [focusedDate, setFocusedDate] = useState<string | null>(null)
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const { weeks, monthMarkers } = useMemo(() => {
    const cells = heatmap.cells ?? []
    if (cells.length === 0) {
      return {
        weeks: [] as Array<Array<HeatmapDayCell | null>>,
        monthMarkers: [] as Array<{ weekIndex: number; label: string }>
      }
    }

    const padded: Array<HeatmapDayCell | null> = []
    const leadingBlanks = parseDayOfWeek(cells[0].date)
    for (let i = 0; i < leadingBlanks; i += 1) {
      padded.push(null)
    }
    for (const cell of cells) {
      padded.push(cell)
    }
    while (padded.length % 7 !== 0) {
      padded.push(null)
    }

    const weekColumns: Array<Array<HeatmapDayCell | null>> = []
    for (let i = 0; i < padded.length; i += 7) {
      weekColumns.push(padded.slice(i, i + 7))
    }

    const markers: Array<{ weekIndex: number; label: string }> = []
    let lastMonth = -1
    weekColumns.forEach((col, weekIndex) => {
      const firstReal = col.find((c): c is HeatmapDayCell => c !== null)
      if (!firstReal) return
      const monthIdx = parseMonthIndex(firstReal.date)
      if (monthIdx < 0 || monthIdx === lastMonth) return
      lastMonth = monthIdx

      const prev = markers[markers.length - 1]
      if (prev && weekIndex - prev.weekIndex < 2) {
        if (prev.weekIndex === 0) {
          markers[markers.length - 1] = { weekIndex, label: MONTH_LABELS[monthIdx] }
        }
      } else {
        markers.push({ weekIndex, label: MONTH_LABELS[monthIdx] })
      }
    })

    return { weeks: weekColumns, monthMarkers: markers }
  }, [heatmap.cells])

  const cellIndexByDate = useMemo(() => {
    const map = new Map<string, number>()
    ;(heatmap.cells ?? []).forEach((cell, idx) => {
      map.set(cell.date, idx)
    })
    return map
  }, [heatmap.cells])

  const focusableDate = useMemo(() => {
    const cells = heatmap.cells ?? []
    if (cells.length === 0) return null
    if (focusedDate && cellIndexByDate.has(focusedDate)) {
      return focusedDate
    }
    if (selectedDay && cellIndexByDate.has(selectedDay)) {
      return selectedDay
    }
    return cells[0].date
  }, [heatmap.cells, cellIndexByDate, focusedDate, selectedDay])

  const moveFocusToIndex = useCallback(
    (targetIndex: number) => {
      const cells = heatmap.cells ?? []
      if (targetIndex < 0 || targetIndex >= cells.length) return
      const targetCell = cells[targetIndex]
      setFocusedDate(targetCell.date)
      setHoveredCell(targetCell)
      cellRefs.current.get(targetCell.date)?.focus()
    },
    [heatmap.cells]
  )

  const handleCellKeyDown = useCallback(
    (date: string, event: KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = cellIndexByDate.get(date)
      if (currentIndex === undefined) return
      const cells = heatmap.cells ?? []

      let targetIndex: number | null = null
      switch (event.key) {
        case 'ArrowLeft':
          targetIndex = currentIndex - 7
          break
        case 'ArrowRight':
          targetIndex = currentIndex + 7
          break
        case 'ArrowUp':
          targetIndex = currentIndex - 1
          break
        case 'ArrowDown':
          targetIndex = currentIndex + 1
          break
        case 'Home':
          targetIndex = 0
          break
        case 'End':
          targetIndex = cells.length - 1
          break
        default:
          return
      }

      event.preventDefault()
      if (targetIndex !== null && targetIndex >= 0 && targetIndex < cells.length) {
        moveFocusToIndex(targetIndex)
      }
    },
    [cellIndexByDate, heatmap.cells, moveFocusToIndex]
  )

  const handleSelectCell = useCallback(
    (date: string) => {
      setFocusedDate(date)
      onSelectDay?.(date)
    },
    [onSelectDay]
  )

  const selectedCell = useMemo(
    () => (selectedDay ? heatmap.cells.find((c) => c.date === selectedDay) ?? null : null),
    [heatmap.cells, selectedDay]
  )

  const activeDetailCell = hoveredCell ?? selectedCell

  const isFullCalendarYear =
    heatmap.cells.length >= 365 &&
    heatmap.cells[0]?.date.endsWith('-01-01') &&
    heatmap.cells[heatmap.cells.length - 1]?.date.endsWith('-12-31')
  const resolvedPeriodLabel =
    periodLabel ?? (isFullCalendarYear ? `${heatmap.year}年` : '直近52週間')

  const maxDailyLabel = heatmap.maxDailyShots.date
    ? `${heatmap.maxDailyShots.count.toLocaleString()} 枚 (${heatmap.maxDailyShots.date})`
    : `${heatmap.maxDailyShots.count.toLocaleString()} 枚`

  return (
    <Card
      title={`撮影アクティビティ・ヒートマップ (${resolvedPeriodLabel})`}
      subtitle="セルをクリックするとその日の撮影データにダッシュボード全体を絞り込めます"
      icon={<CalendarDays className="h-4 w-4" />}
      headerRight={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Badge variant="emerald">
            <CalendarDays className="h-3 w-3" />
            稼働 {heatmap.totalActiveDays} 日
          </Badge>
          <Badge variant="amber">
            <Flame className="h-3 w-3" />
            最長 {heatmap.longestStreakDays} 日連続
          </Badge>
          <Badge variant="sky">
            <Zap className="h-3 w-3" />
            現在 {heatmap.currentStreakDays} 日
          </Badge>
          <Badge variant="indigo">
            <Trophy className="h-3 w-3" />
            最多 {maxDailyLabel}
          </Badge>
        </div>
      }
      className={className}
    >
      <div className="flex flex-col gap-3">
        {/* Scrollable 52-week calendar grid */}
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex flex-col gap-1.5">
            {/* Month labels row */}
            <div className="relative ml-9 h-4 text-[10px] font-medium text-slate-400">
              {monthMarkers.map((marker) => (
                <span
                  key={`${marker.weekIndex}-${marker.label}`}
                  className="absolute top-0 whitespace-nowrap"
                  style={{ left: `${marker.weekIndex * 15}px` }}
                >
                  {marker.label}
                </span>
              ))}
            </div>

            {/* Weekday labels + 52 week columns */}
            <div className="flex items-start gap-2">
              <div className="relative h-[102px] w-7 shrink-0 text-[10px] text-slate-500">
                {WEEKDAY_LABELS.map((item) => (
                  <span
                    key={item.label}
                    className="absolute right-0 leading-none"
                    style={{ top: `${item.row * 15 + 1}px` }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>

              <div
                className="flex gap-[3px]"
                role="grid"
                aria-label={`撮影アクティビティ・ヒートマップ (${resolvedPeriodLabel})`}
              >
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-[3px]" role="row">
                    {week.map((cell, dayIdx) =>
                      cell ? (
                        <HeatmapCell
                          key={cell.date}
                          ref={(el) => {
                            if (el) {
                              cellRefs.current.set(cell.date, el)
                            } else {
                              cellRefs.current.delete(cell.date)
                            }
                          }}
                          role="gridcell"
                          tabIndex={focusableDate === cell.date ? 0 : -1}
                          level={cell.level}
                          date={cell.date}
                          count={cell.count}
                          topCamera={cell.topCamera}
                          topLens={cell.topLens}
                          selected={selectedDay === cell.date}
                          onClick={onSelectDay ? handleSelectCell : undefined}
                          onKeyDown={(event) => handleCellKeyDown(cell.date, event)}
                          onMouseEnter={() => setHoveredCell(cell)}
                          onMouseLeave={() =>
                            setHoveredCell((prev) =>
                              prev?.date === cell.date ? null : prev
                            )
                          }
                          onFocus={() => {
                            setFocusedDate(cell.date)
                            setHoveredCell(cell)
                          }}
                          onBlur={() =>
                            setHoveredCell((prev) =>
                              prev?.date === cell.date ? null : prev
                            )
                          }
                        />
                      ) : (
                        <span
                          key={`empty-${weekIdx}-${dayIdx}`}
                          className="h-3 w-3 rounded-[2px] bg-transparent"
                          aria-hidden="true"
                        />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Hover detail bar + color legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-xs">
          <div className="min-w-0 flex-1 text-slate-300">
            {activeDetailCell ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold text-emerald-300">
                  {activeDetailCell.date}
                </span>
                <span className="font-semibold text-slate-100">
                  {activeDetailCell.count.toLocaleString()}枚
                </span>
                {(activeDetailCell.topCamera || activeDetailCell.topLens) && (
                  <span className="truncate text-slate-400">
                    | Main:{' '}
                    {[activeDetailCell.topCamera, activeDetailCell.topLens]
                      .filter(Boolean)
                      .join(' / ')}
                  </span>
                )}
                {selectedDay === activeDetailCell.date && (
                  <Badge variant="amber">絞り込み中（再クリックで解除）</Badge>
                )}
              </div>
            ) : (
              <span className="text-slate-400">
                セルにカーソルを合わせると撮影枚数とメイン機材を表示します（クリックで日付絞り込み）
              </span>
            )}
          </div>

          <div
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-400"
            aria-label="撮影枚数の凡例 (少ない〜多い)"
          >
            <span>Less</span>
            {LEGEND_LEVELS.map((level) => (
              <span
                key={level}
                aria-hidden="true"
                className={clsx('h-3 w-3 rounded-[2px]', HEATMAP_LEVEL_CLASSES[level])}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
