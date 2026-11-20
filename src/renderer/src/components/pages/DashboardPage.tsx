import type { ReactElement } from 'react'
import {
  Camera,
  CheckCircle2,
  Database,
  Focus,
  HardDrive,
  RefreshCw,
  Sparkles,
  X
} from 'lucide-react'
import { useDashboardStats } from '../../hooks'
import { Button, Card } from '../atoms'
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
    seedStatus,
    exportStatus,
    error,
    refresh,
    seedDemoData,
    clearSeedStatus,
    exportPublicWebJson
  } = useDashboardStats()

  const hasActiveDataFilter = Boolean(
    filter.year !== undefined ||
      filter.cameraModel ||
      filter.lensModel ||
      filter.mediaType ||
      filter.specificDay ||
      filter.dateFrom ||
      filter.dateTo
  )
  const isLibraryEmpty =
    stats !== null &&
    stats.totalFiles === 0 &&
    !hasActiveDataFilter &&
    filterOptions.years.length === 0

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

      {seedStatus && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-200"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>{seedStatus}</span>
          </span>
          <button
            type="button"
            onClick={clearSeedStatus}
            aria-label="通知を閉じる"
            className="rounded p-0.5 text-emerald-300/80 transition-colors hover:bg-emerald-500/20 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLibraryEmpty && (
        <Card
          title="撮影データがまだ登録されていません"
          subtitle="「SD取込・整理」タブから写真・動画を取り込むか、デモ用のサンプル撮影データを投入して52週間ヒートマップやExif分析を体験できます。"
          icon={<Sparkles className="h-4 w-4 text-amber-400" />}
          headerRight={
            <Button
              variant="secondary"
              size="sm"
              icon={<Sparkles className="h-3.5 w-3.5 text-amber-400" />}
              loading={isSeeding}
              onClick={() => void seedDemoData(180)}
            >
              サンプル撮影データを投入
            </Button>
          }
          padding="sm"
          className="border-amber-500/30 bg-amber-950/10"
        >
          <p className="text-xs text-slate-400">
            実データを取り込んだ後の追加投入や初期化は「常駐・設定」タブから安全に操作できます。
          </p>
        </Card>
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
              periodLabel={filter.year !== undefined ? `${filter.year}年` : '直近52週間'}
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
