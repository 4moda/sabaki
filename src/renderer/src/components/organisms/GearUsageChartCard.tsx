import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import { Aperture, Camera } from 'lucide-react'
import type { GearUsageStat } from '@core/domain/models'
import { Badge, Card } from '../atoms'
import { formatBytes } from './ImportProgressPanel'

export interface GearUsageChartCardProps {
  cameras: GearUsageStat[]
  lenses: GearUsageStat[]
  selectedCamera?: string
  selectedLens?: string
  onSelectCamera?: (cameraModel: string) => void
  onSelectLens?: (lensModel: string) => void
  className?: string
}

/**
 * Displays Camera Body Share and Lens Usage Ranking with animated horizontal bars,
 * shot counts, percentage shares, storage volume, and click-to-filter interaction.
 */
export function GearUsageChartCard({
  cameras,
  lenses,
  selectedCamera,
  selectedLens,
  onSelectCamera,
  onSelectLens,
  className
}: GearUsageChartCardProps): ReactElement {
  return (
    <Card
      title="カメラ・レンズ稼働率ランキング"
      subtitle="項目をクリックすると該当機材でダッシュボードを絞り込めます"
      icon={<Camera className="h-4 w-4" />}
      className={className}
    >
      <div className="flex flex-col gap-6">
        {/* Camera Share */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Camera className="h-3.5 w-3.5 text-emerald-400" />
              カメラ機材稼働率 (Camera Share)
            </h4>
            <span className="text-[11px] text-slate-400">{cameras.length} 機種</span>
          </div>

          {cameras.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
              カメラ統計データがありません
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cameras.slice(0, 6).map((cam, idx) => {
                const isSelected = selectedCamera === cam.name
                return (
                  <li key={cam.name}>
                    <button
                      type="button"
                      onClick={() => onSelectCamera?.(cam.name)}
                      disabled={!onSelectCamera}
                      className={clsx(
                        'flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                        isSelected
                          ? 'border-emerald-500/70 bg-emerald-950/30'
                          : 'border-slate-800/80 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-500">
                            #{idx + 1}
                          </span>
                          <span className="truncate font-medium text-slate-100">
                            {cam.name}
                          </span>
                          {isSelected && <Badge variant="emerald">絞り込み中</Badge>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-slate-300">
                          <span>{cam.count.toLocaleString()}枚</span>
                          <span className="font-semibold text-emerald-300">
                            {cam.percentage}%
                          </span>
                          <span className="hidden text-slate-500 sm:inline">
                            ({formatBytes(cam.totalBytes)})
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(2, cam.percentage))}%` }}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Lens Ranking */}
        <div className="flex flex-col gap-2.5 border-t border-slate-800/80 pt-5">
          <div className="flex items-center justify-between">
            <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Aperture className="h-3.5 w-3.5 text-indigo-400" />
              レンズ稼働率ランキング (Lens Ranking)
            </h4>
            <span className="text-[11px] text-slate-400">{lenses.length} 本</span>
          </div>

          {lenses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
              レンズ統計データがありません
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lenses.slice(0, 6).map((lens, idx) => {
                const isSelected = selectedLens === lens.name
                return (
                  <li key={lens.name}>
                    <button
                      type="button"
                      onClick={() => onSelectLens?.(lens.name)}
                      disabled={!onSelectLens}
                      className={clsx(
                        'flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        isSelected
                          ? 'border-indigo-500/70 bg-indigo-950/30'
                          : 'border-slate-800/80 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-500">
                            #{idx + 1}
                          </span>
                          <span className="truncate font-medium text-slate-100">
                            {lens.name}
                          </span>
                          {isSelected && <Badge variant="indigo">絞り込み中</Badge>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-slate-300">
                          <span>{lens.count.toLocaleString()}枚</span>
                          <span className="font-semibold text-indigo-300">
                            {lens.percentage}%
                          </span>
                          <span className="hidden text-slate-500 sm:inline">
                            ({formatBytes(lens.totalBytes)})
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(2, lens.percentage))}%` }}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
