import { useMemo, useState, type ReactElement } from 'react'
import { CalendarDays, Flame, Trophy, Zap } from 'lucide-react'
import type { HeatmapDayCell, HeatmapSummary } from '@core/domain/models'
import {
  Badge,
  Button,
  Card,
  HeatmapCell,
  HeatmapLegendSwatch,
  type HeatmapLevel
} from '../atoms'
import {
  buildHeatmapMonthMarkers,
  buildHeatmapWeekColumns,
  formatHeatmapDate,
  formatHeatmapPeriodLabel,
  toLocalDateKey
} from './heatmapLayout'

export interface ShootingActivityHeatmapProps {
  heatmap: HeatmapSummary
  selectedDay?: string
  onSelectDay?: (date: string) => void
  /**
   * True when the heatmap shows the rolling 52-week window (no year filter).
   * Switches the title label from `(YYYY年)` to the 52-week window wording.
   */
  isRollingWindow?: boolean
  className?: string
}

const WEEKDAY_LABELS: Array<{ row: number; label: string }> = [
  { row: 0, label: '日' },
  { row: 1, label: '月' },
  { row: 3, label: '水' },
  { row: 5, label: '金' }
]

const LEGEND_LEVELS: HeatmapLevel[] = [0, 1, 2, 3, 4]

/**
 * GitHub Contribution-style 52-week x 7-day Shooting Activity Calendar Heatmap
 * with active days, streak badges, hover detail bar, and click-to-drill-down day filtering.
 */
export function ShootingActivityHeatmap({
  heatmap,
  selectedDay,
  onSelectDay,
  isRollingWindow = false,
  className
}: ShootingActivityHeatmapProps): ReactElement {
  const [hoveredCell, setHoveredCell] = useState<HeatmapDayCell | null>(null)

  const { weeks, monthMarkers } = useMemo(() => {
    const weekColumns = buildHeatmapWeekColumns(heatmap.cells ?? [])
    return { weeks: weekColumns, monthMarkers: buildHeatmapMonthMarkers(weekColumns) }
  }, [heatmap.cells])

  const selectedCell = useMemo(
    () => (selectedDay ? heatmap.cells.find((c) => c.date === selectedDay) ?? null : null),
    [heatmap.cells, selectedDay]
  )

  const activeDetailCell = hoveredCell ?? selectedCell

  const maxDailyLabel = heatmap.maxDailyShots.date
    ? `${heatmap.maxDailyShots.count.toLocaleString()} 枚 (${heatmap.maxDailyShots.date})`
    : `${heatmap.maxDailyShots.count.toLocaleString()} 枚`

  const firstCellDate = heatmap.cells[0]?.date
  const lastCellDate = heatmap.cells[heatmap.cells.length - 1]?.date
  const periodLabel = formatHeatmapPeriodLabel({
    isRollingWindow,
    year: heatmap.year,
    lastDate: lastCellDate,
    today: toLocalDateKey(new Date())
  })
  const heatmapTitle = `撮影アクティビティ・ヒートマップ (${periodLabel})`
  const rangeLabel =
    firstCellDate && lastCellDate
      ? `${formatHeatmapDate(firstCellDate)}〜${formatHeatmapDate(lastCellDate)}`
      : undefined
  const isSelectedDayOutOfRange = Boolean(selectedDay) && selectedCell === null

  return (
    <Card
      title={heatmapTitle}
      subtitle={`${rangeLabel ? `${rangeLabel} / ` : ''}セルをクリックするとその日の撮影データにダッシュボード全体を絞り込めます`}
      icon={<CalendarDays className="h-4 w-4" />}
      headerRight={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* Summary values follow specificDay, so label them as the selected day's numbers */}
          {selectedDay && (
            <Badge variant="default">選択日 {formatHeatmapDate(selectedDay)} の集計</Badge>
          )}
          <Badge variant="emerald">
            <CalendarDays className="h-3 w-3" />
            稼働 {heatmap.totalActiveDays} 日
          </Badge>
          <Badge variant="amber">
            <Flame className="h-3 w-3" />
            最長 {heatmap.longestStreakDays} 日連続
          </Badge>
          {!selectedDay && (
            <Badge variant="sky">
              <Zap className="h-3 w-3" />
              現在 {heatmap.currentStreakDays} 日
            </Badge>
          )}
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

              <div className="flex gap-[3px]" role="grid" aria-label={heatmapTitle}>
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-[3px]" role="row">
                    {week.map((cell, dayIdx) =>
                      cell ? (
                        <span
                          key={cell.date}
                          onMouseEnter={() => setHoveredCell(cell)}
                          onMouseLeave={() => setHoveredCell(null)}
                          onFocus={() => setHoveredCell(cell)}
                          onBlur={() => setHoveredCell(null)}
                          className="inline-flex"
                        >
                          <HeatmapCell
                            level={cell.level}
                            date={cell.date}
                            count={cell.count}
                            topCamera={cell.topCamera}
                            topLens={cell.topLens}
                            selected={selectedDay === cell.date}
                            onClick={onSelectDay}
                          />
                        </span>
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

        {isSelectedDayOutOfRange && selectedDay && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
            <span>{`選択日（${formatHeatmapDate(selectedDay)}）は表示範囲外です。`}</span>
            {onSelectDay && (
              <Button variant="ghost" size="sm" onClick={() => onSelectDay(selectedDay)}>
                日付選択を解除
              </Button>
            )}
          </div>
        )}

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
            title="色の濃さは表示期間内の撮影枚数の相対比較です"
          >
            <span className="sr-only">色の濃さは表示期間内の撮影枚数の相対比較です。</span>
            <span>少</span>
            {LEGEND_LEVELS.map((level) => (
              <HeatmapLegendSwatch key={level} level={level} />
            ))}
            <span>多</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
