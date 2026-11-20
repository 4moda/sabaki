import type { ReactElement } from 'react'
import { Focus } from 'lucide-react'
import type {
  ApertureBucket,
  FocalLengthBucket,
  IsoBucket,
  MonthlyTrendPoint
} from '@core/domain/models'
import { Badge, Card } from '../atoms'

export interface FocalLengthHistogramCardProps {
  histogram: FocalLengthBucket[]
  apertureDistribution: ApertureBucket[]
  isoDistribution: IsoBucket[]
  monthlyTrends: MonthlyTrendPoint[]
  sweetSpotFocalLength?: string
  use35mmEquivalent: boolean
  className?: string
}

function formatMonthLabel(monthKey: string): string {
  const monthPart = monthKey.slice(5)
  const parsed = Number(monthPart)
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12
    ? `${parsed}月`
    : `${monthPart}月`
}

/**
 * Displays Focal Length Histogram (with Physical vs 35mm Equivalent toggle),
 * sweet-spot focal length badge, F-number & ISO mini-charts, and monthly RAW/JPEG/VIDEO trends.
 */
export function FocalLengthHistogramCard({
  histogram,
  apertureDistribution,
  isoDistribution,
  monthlyTrends,
  sweetSpotFocalLength,
  use35mmEquivalent,
  className
}: FocalLengthHistogramCardProps): ReactElement {
  const visibleMonthlyTrends = monthlyTrends.slice(-12)
  const maxFocalCount = Math.max(1, ...histogram.map((b) => b.count))
  const maxMonthlyTotal = Math.max(1, ...visibleMonthlyTrends.map((m) => m.totalCount))

  return (
    <Card
      title="光学・露出傾向 & 月別推移"
      subtitle="焦点距離ヒストグラム、F値・ISO分布、月別のRAW/JPEG/動画比率を可視化します"
      icon={<Focus className="h-4 w-4" />}
      headerRight={
        sweetSpotFocalLength ? (
          <Badge variant="sky">スイートスポット: {sweetSpotFocalLength}</Badge>
        ) : undefined
      }
      className={className}
    >
      <div className="flex flex-col gap-5">
        {/* Focal length histogram */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-200">
              焦点距離ヒストグラム ({use35mmEquivalent ? '35mm判換算' : '実焦点距離'})
            </h4>
          </div>

          {histogram.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
              焦点距離データがありません
            </p>
          ) : (
            <div className="grid grid-cols-6 items-end gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 pb-3 pt-5">
              {histogram.map((bucket) => {
                const heightPercent = Math.max(6, Math.round((bucket.count / maxFocalCount) * 100))
                return (
                  <div key={bucket.label} className="flex flex-col items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400">
                      {bucket.percentage}%
                    </span>
                    <div className="flex h-24 w-full items-end justify-center">
                      <div
                        className="w-full max-w-[36px] rounded-t-md bg-gradient-to-t from-sky-600 to-sky-400 transition-all duration-500"
                        style={{ height: `${bucket.count > 0 ? heightPercent : 4}%` }}
                        title={`${bucket.label}: ${bucket.count}枚 (${bucket.percentage}%)`}
                      />
                    </div>
                    <span className="truncate text-[10px] font-medium text-slate-300">
                      {bucket.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* F-Number & ISO mini charts */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
            <h4 className="text-xs font-semibold text-slate-200">F値（絞り）傾向</h4>
            {apertureDistribution.length === 0 ? (
              <p className="text-xs text-slate-500">データなし</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {apertureDistribution.map((item) => (
                  <li key={item.label} className="flex flex-col gap-1 text-[11px]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-mono">{item.label}</span>
                      <span className="font-mono text-amber-300">
                        {item.percentage}% ({item.count})
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${Math.min(100, item.percentage)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
            <h4 className="text-xs font-semibold text-slate-200">ISO感度分布</h4>
            {isoDistribution.length === 0 ? (
              <p className="text-xs text-slate-500">データなし</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {isoDistribution.map((item) => (
                  <li key={item.label} className="flex flex-col gap-1 text-[11px]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-mono">{item.label}</span>
                      <span className="font-mono text-emerald-300">
                        {item.percentage}% ({item.count})
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${Math.min(100, item.percentage)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Monthly RAW / JPEG / VIDEO stacked bar visualization */}
        <div className="flex flex-col gap-2.5 border-t border-slate-800/80 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-200">
              月別撮影枚数推移 (RAW / JPEG / VIDEO)
            </h4>
            <div className="flex items-center gap-2.5 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-amber-400" />
                RAW
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-400" />
                JPEG
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-sky-400" />
                VIDEO
              </span>
            </div>
          </div>

          {visibleMonthlyTrends.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
              月別推移データがありません
            </p>
          ) : (
            <div
              className="grid items-end gap-1 rounded-lg border border-slate-800/80 bg-slate-950/60 px-2.5 pb-2.5 pt-4"
              style={{
                gridTemplateColumns: `repeat(${visibleMonthlyTrends.length}, minmax(0, 1fr))`
              }}
            >
              {visibleMonthlyTrends.map((point) => {
                const totalHeight = Math.max(
                  6,
                  Math.round((point.totalCount / maxMonthlyTotal) * 100)
                )
                const rawPct =
                  point.totalCount > 0 ? (point.rawCount / point.totalCount) * 100 : 0
                const jpegPct =
                  point.totalCount > 0 ? (point.jpegCount / point.totalCount) * 100 : 0
                const videoPct =
                  point.totalCount > 0 ? (point.videoCount / point.totalCount) * 100 : 0

                return (
                  <div
                    key={point.month}
                    className="flex min-w-0 flex-col items-center gap-1"
                    title={`${point.month}: 合計${point.totalCount} (RAW:${point.rawCount}, JPEG:${point.jpegCount}, VIDEO:${point.videoCount})`}
                  >
                    <span className="font-mono text-[10px] leading-none text-slate-400 tabular-nums">
                      {point.totalCount}
                    </span>
                    <div className="flex h-20 w-full items-end justify-center">
                      <div
                        className="flex w-full max-w-[18px] flex-col-reverse overflow-hidden rounded-t-sm bg-slate-800 transition-all duration-500"
                        style={{ height: `${totalHeight}%` }}
                      >
                        {rawPct > 0 && (
                          <div className="w-full bg-amber-400" style={{ height: `${rawPct}%` }} />
                        )}
                        {jpegPct > 0 && (
                          <div
                            className="w-full bg-emerald-400"
                            style={{ height: `${jpegPct}%` }}
                          />
                        )}
                        {videoPct > 0 && (
                          <div className="w-full bg-sky-400" style={{ height: `${videoPct}%` }} />
                        )}
                      </div>
                    </div>
                    <span className="whitespace-nowrap font-mono text-[10px] leading-none text-slate-400">
                      {formatMonthLabel(point.month)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
