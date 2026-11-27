import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SabakiApi } from '@core/application/dto'
import type {
  DashboardFilter,
  DashboardStatsResult
} from '@core/domain/models'
import type { DistinctFilterOptions } from '@core/domain/ports'
import { buildActivityHeatmap } from '@core/domain/services/HeatmapDomainService'
import {
  buildPublicWebExportJson,
  formatDashboardSnsSummary
} from '@core/domain/services/SnsCaptionDomainService'

/**
 * Result message of demo data seeding shown at the top of the dashboard.
 */
export interface SeedStatus {
  tone: 'success' | 'warning'
  message: string
}

export interface UseDashboardStatsReturn {
  filter: DashboardFilter
  setFilter: (filter: DashboardFilter) => void
  updateFilter: (patch: Partial<DashboardFilter>) => void
  resetFilter: () => void
  toggleSpecificDay: (date: string) => void
  stats: DashboardStatsResult | null
  filterOptions: DistinctFilterOptions
  isLoading: boolean
  isSeeding: boolean
  isExporting: boolean
  snsSummaryText: string
  exportStatus: string | null
  seedStatus: SeedStatus | null
  clearSeedStatus: () => void
  error: string | null
  refresh: () => Promise<void>
  seedDemoData: (shotCount?: number) => Promise<void>
  exportPublicWebJson: () => Promise<void>
}

const INITIAL_FILTER: DashboardFilter = {
  use35mmEquivalent: false
}

const EMPTY_FILTER_OPTIONS: DistinctFilterOptions = {
  years: [],
  cameras: [],
  lenses: []
}

function getSabakiApi(): SabakiApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as Window & { sabaki?: SabakiApi }).sabaki
}

function createEmptyStats(year?: number): DashboardStatsResult {
  return {
    totalFiles: 0,
    totalBytes: 0,
    uniqueCameras: 0,
    uniqueLenses: 0,
    sweetSpotFocalLength: undefined,
    cameras: [],
    lenses: [],
    focalLengthHistogram: [],
    apertureDistribution: [],
    isoDistribution: [],
    monthlyTrends: [],
    heatmap: buildActivityHeatmap([], year ? { year } : undefined),
    insights: []
  }
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err
  }
  return fallback
}

/**
 * Custom hook managing Exif analytics dashboard filters, aggregated stats,
 * SNS summary generation, Web portfolio JSON export, and demo data seeding.
 */
export function useDashboardStats(): UseDashboardStatsReturn {
  const [filter, setFilter] = useState<DashboardFilter>(INITIAL_FILTER)
  const [stats, setStats] = useState<DashboardStatsResult | null>(null)
  const [filterOptions, setFilterOptions] = useState<DistinctFilterOptions>(
    EMPTY_FILTER_OPTIONS
  )
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSeeding, setIsSeeding] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [seedStatus, setSeedStatus] = useState<SeedStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (activeFilter: DashboardFilter) => {
    const api = getSabakiApi()
    if (!api?.getDashboardStats || !api?.getFilterOptions) {
      setStats(createEmptyStats(activeFilter.year))
      setFilterOptions(EMPTY_FILTER_OPTIONS)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const [nextStats, nextOptions] = await Promise.all([
        api.getDashboardStats(activeFilter),
        api.getFilterOptions()
      ])
      setStats(nextStats)
      setFilterOptions(nextOptions)
    } catch (err) {
      setError(toErrorMessage(err, '撮影統計データの取得に失敗しました。'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData(filter)
  }, [filter, loadData])

  const updateFilter = useCallback((patch: Partial<DashboardFilter>) => {
    setFilter((prev) => ({
      ...prev,
      ...patch
    }))
  }, [])

  const resetFilter = useCallback(() => {
    setFilter(INITIAL_FILTER)
  }, [])

  const toggleSpecificDay = useCallback((date: string) => {
    setFilter((prev) => ({
      ...prev,
      specificDay: prev.specificDay === date ? undefined : date
    }))
  }, [])

  const refresh = useCallback(async () => {
    await loadData(filter)
  }, [filter, loadData])

  const seedDemoData = useCallback(
    async (shotCount = 180) => {
      const api = getSabakiApi()
      if (!api?.seedDemoData) {
        setSeedStatus({
          tone: 'warning',
          message: 'サンプルデータ投入はElectron環境でのみ実行できます。'
        })
        return
      }

      setIsSeeding(true)
      setError(null)
      setSeedStatus(null)
      try {
        const result = await api.seedDemoData({ shotCount })
        setSeedStatus({
          tone: 'success',
          message: `サンプル撮影データ ${result.insertedFiles.toLocaleString()}件 を投入しました。`
        })
        await loadData(filter)
      } catch (err) {
        setError(toErrorMessage(err, 'サンプル撮影データの投入に失敗しました。'))
      } finally {
        setIsSeeding(false)
      }
    },
    [filter, loadData]
  )

  const clearSeedStatus = useCallback(() => {
    setSeedStatus(null)
  }, [])

  const exportPublicWebJson = useCallback(async () => {
    setIsExporting(true)
    setError(null)
    try {
      const api = getSabakiApi()
      let payload: Record<string, unknown>
      let outputPath: string | undefined

      if (api?.exportPublicWebJson) {
        const result = await api.exportPublicWebJson({
          filter,
          includePublicFiles: true
        })
        if (result.canceled) {
          setExportStatus('stats-public.json の書き出しをキャンセルしました。')
          return
        }
        payload = result.payload
        outputPath = result.outputPath
      } else {
        payload = buildPublicWebExportJson(
          stats ?? createEmptyStats(filter.year),
          undefined,
          filter
        )
      }

      const jsonText = JSON.stringify(payload, null, 2)
      if (outputPath) {
        setExportStatus(`stats-public.json を書き出しました: ${outputPath}`)
      } else if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
        const blob = new Blob([jsonText], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'stats-public.json'
        anchor.click()
        URL.revokeObjectURL(url)
        setExportStatus('stats-public.json をダウンロードしました。')
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonText)
        setExportStatus('stats-public.json の内容をクリップボードにコピーしました。')
      } else {
        setExportStatus('stats-public.json を生成しました。')
      }
    } catch (err) {
      setError(toErrorMessage(err, 'Web公開用JSONのエクスポートに失敗しました。'))
    } finally {
      setIsExporting(false)
    }
  }, [filter, stats])

  const snsSummaryText = useMemo(() => {
    if (!stats) return ''
    const periodLabel = filter.specificDay
      ? filter.specificDay
      : filter.year
        ? `${filter.year}年`
        : undefined
    return formatDashboardSnsSummary(stats, periodLabel)
  }, [stats, filter.specificDay, filter.year])

  return {
    filter,
    setFilter,
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
    seedStatus,
    clearSeedStatus,
    error,
    refresh,
    seedDemoData,
    exportPublicWebJson
  }
}
