import type { ReactElement } from 'react'
import {
  Camera,
  Database,
  Focus,
  HardDrive,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { useDashboardStats } from '../../hooks'
import { Button } from '../atoms'
import { FilterBarGroup, StatSummaryCard } from '../molecules'
import {
  FocalLengthHistogramCard,
  GearUsageChartCard,
  ShootingActivityHeatmap,
  SnsShareExportCard,
  formatBytes
} from '../organisms'
import { DashboardGridTemplate } from '../templates'

export interface DashboardPageProps {
  className?: string
}

/**
 * Exif Analytics Dashboard Page combining multi-dimensional filters, 4 KPI summary cards,
 * GitHub-style 52-week Shooting Activity Heatmap, Camera/Lens rankings,
 * Focal Length / F-number / ISO / Monthly Trend charts, and SNS / Web JSON export.
 */
export function DashboardPage({ className }: DashboardPageProps): ReactElement {
  const {
    filter,
    updateFilter,
    resetFilter,
    toggleSpecificDay,
    stats,
    filterOptions,
    isLoading,
    isSeeding,
    isExporting,
    snsSummaryText,
    exportStatus,
    error,
    refresh,
    seedDemoData,
    exportPublicWebJson
  } = useDashboardStats()

  const handleToggleCamera = (cameraModel: string) => {
    updateFilter({
      cameraModel: filter.cameraModel === cameraModel ? undefined : cameraModel
    })
  }

  const handleToggleLens = (lensModel: string) => {
    updateFilter({
      lensModel: filter.lensModel === lensModel ? undefined : lensModel
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header with Demo Data & Refresh controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            撮影アクティビティ &amp; Exif分析ダッシュボード
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            52週間の撮影ヒートマップ、カメラ・レンズ稼働率、焦点距離スイートスポットを多角的に分析します。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Sparkles className="h-3.5 w-3.5 text-amber-400" />}
            loading={isSeeding}
            onClick={() => void seedDemoData(180)}
          >
            サンプル撮影データを投入
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={isLoading}
            onClick={() => void refresh()}
          >
            再集計
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      <DashboardGridTemplate
        className={className}
        filterBar={
          <FilterBarGroup
            years={filterOptions.years}
            cameras={filterOptions.cameras}
            lenses={filterOptions.lenses}
            selectedYear={filter.year}
            selectedCamera={filter.cameraModel}
            selectedLens={filter.lensModel}
            selectedMediaType={filter.mediaType}
            use35mmEquivalent={Boolean(filter.use35mmEquivalent)}
            specificDay={filter.specificDay}
            onFilterChange={updateFilter}
            onReset={resetFilter}
          />
        }
        kpiRow={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatSummaryCard
              label="総ショット数"
              value={(stats?.totalFiles ?? 0).toLocaleString()}
              subValue={`年間稼働 ${stats?.heatmap.totalActiveDays ?? 0} 日`}
              icon={<Camera className="h-4 w-4" />}
              accent="emerald"
            />
            <StatSummaryCard
              label="合計データ容量"
              value={formatBytes(stats?.totalBytes ?? 0)}
              subValue="RAW / JPEG / VIDEO 合計"
              icon={<HardDrive className="h-4 w-4" />}
              accent="sky"
            />
            <StatSummaryCard
              label="使用カメラ / レンズ数"
              value={`${stats?.uniqueCameras ?? 0} / ${stats?.uniqueLenses ?? 0}`}
              subValue="カメラボディ / 交換レンズ"
              icon={<Database className="h-4 w-4" />}
              accent="indigo"
            />
            <StatSummaryCard
              label="スイートスポット帯"
              value={stats?.sweetSpotFocalLength ?? '—'}
              subValue={filter.use35mmEquivalent ? '35mm判換算ベース' : '実焦点距離ベース'}
              icon={<Focus className="h-4 w-4" />}
              accent="amber"
            />
          </div>
        }
        heatmapSection={
          stats ? (
            <ShootingActivityHeatmap
              heatmap={stats.heatmap}
              selectedDay={filter.specificDay}
              onSelectDay={toggleSpecificDay}
            />
          ) : (
            <div className="h-44 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
          )
        }
        gearSection={
          <GearUsageChartCard
            cameras={stats?.cameras ?? []}
            lenses={stats?.lenses ?? []}
            selectedCamera={filter.cameraModel}
            selectedLens={filter.lensModel}
            onSelectCamera={handleToggleCamera}
            onSelectLens={handleToggleLens}
          />
        }
        opticalSection={
          <FocalLengthHistogramCard
            histogram={stats?.focalLengthHistogram ?? []}
            apertureDistribution={stats?.apertureDistribution ?? []}
            isoDistribution={stats?.isoDistribution ?? []}
            monthlyTrends={stats?.monthlyTrends ?? []}
            sweetSpotFocalLength={stats?.sweetSpotFocalLength}
            use35mmEquivalent={Boolean(filter.use35mmEquivalent)}
            onToggle35mmEquivalent={(checked) =>
              updateFilter({ use35mmEquivalent: checked })
            }
          />
        }
        exportSection={
          <SnsShareExportCard
            insights={stats?.insights ?? []}
            snsSummaryText={snsSummaryText}
            isExporting={isExporting}
            exportStatus={exportStatus}
            onExportWebJson={() => void exportPublicWebJson()}
          />
        }
      />
    </div>
  )
}
