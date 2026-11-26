import type { DatabaseSync } from 'node:sqlite'
import type {
  ApertureBucket,
  DashboardFilter,
  DashboardStatsResult,
  FocalLengthBucket,
  GearUsageStat,
  IsoBucket,
  MonthlyTrendPoint
} from '@core/domain/models'
import type {
  DistinctFilterOptions,
  IAnalyticsQueryService
} from '@core/domain/ports'
import {
  buildActivityHeatmap,
  type HeatmapDailyRow
} from '@core/domain/services'
import { SqliteConnection } from './SqliteConnection'

interface SqlWhereClause {
  whereSql: string
  params: Array<string | number>
}

interface FocalBucketSpec {
  label: string
  minMm: number
  maxMm: number
}

const FOCAL_BUCKET_SPECS: readonly FocalBucketSpec[] = [
  { label: '~20mm', minMm: 0, maxMm: 20 },
  { label: '21-34mm', minMm: 21, maxMm: 34 },
  { label: '35-55mm', minMm: 35, maxMm: 55 },
  { label: '56-105mm', minMm: 56, maxMm: 105 },
  { label: '106-200mm', minMm: 106, maxMm: 200 },
  { label: '201mm+', minMm: 201, maxMm: 9999 }
]

const APERTURE_BUCKET_LABELS = [
  'F1.2-F1.8',
  'F2.0-F2.8',
  'F3.2-F5.6',
  'F6.3-F11',
  'F13+'
] as const

const ISO_BUCKET_LABELS = [
  'ISO ~400',
  'ISO 401-1600',
  'ISO 1601-6400',
  'ISO 6401+'
] as const

function toPercentage(count: number, total: number): number {
  if (total <= 0 || count <= 0) {
    return 0
  }
  return Math.round((count / total) * 1000) / 10
}

function isKnownGear(name: unknown): name is string {
  if (typeof name !== 'string') {
    return false
  }
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'unknown'
}

function classifyFocalBucketIndex(mm: number): number {
  if (mm <= 20) return 0
  if (mm < 35) return 1
  if (mm < 56) return 2
  if (mm < 106) return 3
  if (mm < 201) return 4
  return 5
}

function classifyApertureBucketIndex(fNumber: number): number {
  if (fNumber <= 1.8) return 0
  if (fNumber <= 2.8) return 1
  if (fNumber <= 5.6) return 2
  if (fNumber <= 11) return 3
  return 4
}

function classifyIsoBucketIndex(iso: number): number {
  if (iso <= 400) return 0
  if (iso <= 1600) return 1
  if (iso <= 6400) return 2
  return 3
}

/**
 * SQLite implementation of `IAnalyticsQueryService` providing multi-dimensional
 * photography statistics, gear rankings, focal/aperture/ISO distributions,
 * monthly media trends, and 52-week shooting activity heatmap data.
 */
export class SqliteAnalyticsQueryService implements IAnalyticsQueryService {
  private readonly db: DatabaseSync

  constructor(connection: SqliteConnection | DatabaseSync) {
    this.db = connection instanceof SqliteConnection ? connection.getDb() : connection
  }

  public queryDashboardStats(filter?: DashboardFilter): DashboardStatsResult {
    const { whereSql, params } = this.buildWhereClause(filter)

    // 1. Summary totals
    const totalsStmt = this.db.prepare(`
      SELECT
        COUNT(*) AS total_files,
        COALESCE(SUM(file_size), 0) AS total_bytes
      FROM imported_files
      ${whereSql}
    `)
    const totalsRow = totalsStmt.get(...params)
    const totalFiles = Number(totalsRow?.total_files ?? 0)
    const totalBytes = Number(totalsRow?.total_bytes ?? 0)

    // 2. Camera usage rankings
    const camerasStmt = this.db.prepare(`
      SELECT
        camera_model AS name,
        COUNT(*) AS cnt,
        COALESCE(SUM(file_size), 0) AS total_bytes
      FROM imported_files
      ${whereSql}
      GROUP BY camera_model
      ORDER BY cnt DESC, total_bytes DESC, name ASC
    `)
    const cameraRows = camerasStmt.all(...params)
    const cameras: GearUsageStat[] = cameraRows
      .filter((r) => isKnownGear(r.name))
      .map((r) => {
        const count = Number(r.cnt)
        return {
          name: String(r.name),
          count,
          percentage: toPercentage(count, totalFiles),
          totalBytes: Number(r.total_bytes)
        }
      })

    // 3. Lens usage rankings
    const lensesStmt = this.db.prepare(`
      SELECT
        lens_model AS name,
        COUNT(*) AS cnt,
        COALESCE(SUM(file_size), 0) AS total_bytes
      FROM imported_files
      ${whereSql}
      GROUP BY lens_model
      ORDER BY cnt DESC, total_bytes DESC, name ASC
    `)
    const lensRows = lensesStmt.all(...params)
    const lenses: GearUsageStat[] = lensRows
      .filter((r) => isKnownGear(r.name))
      .map((r) => {
        const count = Number(r.cnt)
        return {
          name: String(r.name),
          count,
          percentage: toPercentage(count, totalFiles),
          totalBytes: Number(r.total_bytes)
        }
      })

    const uniqueCameras = cameras.length
    const uniqueLenses = lenses.length

    // 4. Focal length histogram (respecting filter?.use35mmEquivalent)
    const focalExpr = filter?.use35mmEquivalent
      ? 'COALESCE(focal_length_35mm, focal_length)'
      : 'COALESCE(focal_length, focal_length_35mm)'

    const focalCond = whereSql
      ? `${whereSql} AND ${focalExpr} IS NOT NULL AND ${focalExpr} > 0`
      : `WHERE ${focalExpr} IS NOT NULL AND ${focalExpr} > 0`

    const focalStmt = this.db.prepare(`
      SELECT ${focalExpr} AS effective_focal, COUNT(*) AS cnt
      FROM imported_files
      ${focalCond}
      GROUP BY effective_focal
    `)
    const focalRows = focalStmt.all(...params)
    const focalCounts = [0, 0, 0, 0, 0, 0]
    let totalFocalCount = 0

    for (const row of focalRows) {
      const mm = Number(row.effective_focal)
      const cnt = Number(row.cnt)
      if (Number.isFinite(mm) && mm > 0 && cnt > 0) {
        const bucketIdx = classifyFocalBucketIndex(mm)
        focalCounts[bucketIdx] += cnt
        totalFocalCount += cnt
      }
    }

    const focalLengthHistogram: FocalLengthBucket[] = FOCAL_BUCKET_SPECS.map(
      (spec, idx) => ({
        label: spec.label,
        minMm: spec.minMm,
        maxMm: spec.maxMm,
        count: focalCounts[idx],
        percentage: toPercentage(focalCounts[idx], totalFocalCount)
      })
    )

    let sweetSpotFocalLength: string | undefined
    let maxFocalBucketCount = 0
    let topFocalBucket: FocalLengthBucket | undefined
    for (const bucket of focalLengthHistogram) {
      if (bucket.count > maxFocalBucketCount) {
        maxFocalBucketCount = bucket.count
        sweetSpotFocalLength = bucket.label
        topFocalBucket = bucket
      }
    }

    // 5. Aperture distribution
    const apertureCond = whereSql
      ? `${whereSql} AND f_number IS NOT NULL AND f_number > 0`
      : 'WHERE f_number IS NOT NULL AND f_number > 0'

    const apertureStmt = this.db.prepare(`
      SELECT f_number, COUNT(*) AS cnt
      FROM imported_files
      ${apertureCond}
      GROUP BY f_number
    `)
    const apertureRows = apertureStmt.all(...params)
    const apertureCounts = [0, 0, 0, 0, 0]
    let totalApertureCount = 0

    for (const row of apertureRows) {
      const fNum = Number(row.f_number)
      const cnt = Number(row.cnt)
      if (Number.isFinite(fNum) && fNum > 0 && cnt > 0) {
        const idx = classifyApertureBucketIndex(fNum)
        apertureCounts[idx] += cnt
        totalApertureCount += cnt
      }
    }

    const apertureDistribution: ApertureBucket[] = APERTURE_BUCKET_LABELS.map(
      (label, idx) => ({
        label,
        count: apertureCounts[idx],
        percentage: toPercentage(apertureCounts[idx], totalApertureCount)
      })
    )

    // 6. ISO distribution
    const isoCond = whereSql
      ? `${whereSql} AND iso IS NOT NULL AND iso > 0`
      : 'WHERE iso IS NOT NULL AND iso > 0'

    const isoStmt = this.db.prepare(`
      SELECT iso, COUNT(*) AS cnt
      FROM imported_files
      ${isoCond}
      GROUP BY iso
    `)
    const isoRows = isoStmt.all(...params)
    const isoCounts = [0, 0, 0, 0]
    let totalIsoCount = 0

    for (const row of isoRows) {
      const isoVal = Number(row.iso)
      const cnt = Number(row.cnt)
      if (Number.isFinite(isoVal) && isoVal > 0 && cnt > 0) {
        const idx = classifyIsoBucketIndex(isoVal)
        isoCounts[idx] += cnt
        totalIsoCount += cnt
      }
    }

    const isoDistribution: IsoBucket[] = ISO_BUCKET_LABELS.map((label, idx) => ({
      label,
      count: isoCounts[idx],
      percentage: toPercentage(isoCounts[idx], totalIsoCount)
    }))

    // 7. Monthly trends
    const monthlyStmt = this.db.prepare(`
      SELECT
        captured_month AS month,
        SUM(CASE WHEN media_type = 'RAW' THEN 1 ELSE 0 END) AS raw_count,
        SUM(CASE WHEN media_type = 'JPEG' THEN 1 ELSE 0 END) AS jpeg_count,
        SUM(CASE WHEN media_type = 'VIDEO' THEN 1 ELSE 0 END) AS video_count,
        COUNT(*) AS total_count
      FROM imported_files
      ${whereSql}
      GROUP BY captured_month
      ORDER BY captured_month ASC
    `)
    const monthlyRows = monthlyStmt.all(...params)
    const monthlyTrends: MonthlyTrendPoint[] = monthlyRows.map((row) => ({
      month: String(row.month),
      rawCount: Number(row.raw_count ?? 0),
      jpegCount: Number(row.jpeg_count ?? 0),
      videoCount: Number(row.video_count ?? 0),
      totalCount: Number(row.total_count ?? 0)
    }))

    // 8. Daily counts + top camera & top lens per day for HeatmapDomainService.
    // The heatmap ignores `specificDay` so that selecting a day only moves the highlight:
    // other active days and the calendar range stay intact.
    const { whereSql: heatmapWhereSql, params: heatmapParams } =
      this.buildWhereClause(filter ? { ...filter, specificDay: undefined } : undefined)

    const dailyCountsStmt = this.db.prepare(`
      SELECT
        captured_day AS date,
        COUNT(*) AS cnt
      FROM imported_files
      ${heatmapWhereSql}
      GROUP BY captured_day
      ORDER BY captured_day ASC
    `)
    const dailyCountRows = dailyCountsStmt.all(...heatmapParams)

    const dailyCameraStmt = this.db.prepare(`
      SELECT
        captured_day AS date,
        camera_model,
        COUNT(*) AS cnt
      FROM imported_files
      ${heatmapWhereSql}
      GROUP BY captured_day, camera_model
      ORDER BY captured_day ASC, cnt DESC, camera_model ASC
    `)
    const dailyCameraRows = dailyCameraStmt.all(...heatmapParams)
    const topCameraByDay = new Map<string, string>()
    for (const row of dailyCameraRows) {
      const day = String(row.date)
      if (!topCameraByDay.has(day) && isKnownGear(row.camera_model)) {
        topCameraByDay.set(day, String(row.camera_model))
      }
    }

    const dailyLensStmt = this.db.prepare(`
      SELECT
        captured_day AS date,
        lens_model,
        COUNT(*) AS cnt
      FROM imported_files
      ${heatmapWhereSql}
      GROUP BY captured_day, lens_model
      ORDER BY captured_day ASC, cnt DESC, lens_model ASC
    `)
    const dailyLensRows = dailyLensStmt.all(...heatmapParams)
    const topLensByDay = new Map<string, string>()
    for (const row of dailyLensRows) {
      const day = String(row.date)
      if (!topLensByDay.has(day) && isKnownGear(row.lens_model)) {
        topLensByDay.set(day, String(row.lens_model))
      }
    }

    const heatmapDailyRows: HeatmapDailyRow[] = dailyCountRows.map((row) => {
      const date = String(row.date)
      return {
        date,
        count: Number(row.cnt),
        topCamera: topCameraByDay.get(date),
        topLens: topLensByDay.get(date)
      }
    })

    const latestCapturedDay =
      heatmapDailyRows.length > 0
        ? heatmapDailyRows[heatmapDailyRows.length - 1].date
        : undefined
    const referenceDate = filter?.dateTo ?? latestCapturedDay ?? new Date()

    const heatmap = buildActivityHeatmap(heatmapDailyRows, {
      year: filter?.year,
      referenceDate
    })

    // 9. Actionable photographer insights
    const insights = this.buildPhotographerInsights({
      totalFiles,
      cameras,
      lenses,
      sweetSpotFocalLength,
      topFocalBucket,
      apertureCounts,
      totalApertureCount,
      heatmap
    })

    return {
      totalFiles,
      totalBytes,
      uniqueCameras,
      uniqueLenses,
      ...(sweetSpotFocalLength ? { sweetSpotFocalLength } : {}),
      cameras,
      lenses,
      focalLengthHistogram,
      apertureDistribution,
      isoDistribution,
      monthlyTrends,
      heatmap,
      insights
    }
  }

  public getDistinctFilterOptions(): DistinctFilterOptions {
    const yearsStmt = this.db.prepare(`
      SELECT DISTINCT captured_year
      FROM imported_files
      WHERE captured_year IS NOT NULL
      ORDER BY captured_year DESC
    `)
    const years = yearsStmt
      .all()
      .map((r) => Number(r.captured_year))
      .filter((y) => Number.isFinite(y))

    const camerasStmt = this.db.prepare(`
      SELECT DISTINCT camera_model
      FROM imported_files
      WHERE camera_model IS NOT NULL
        AND TRIM(camera_model) != ''
        AND LOWER(TRIM(camera_model)) != 'unknown'
      ORDER BY camera_model ASC
    `)
    const cameras = camerasStmt.all().map((r) => String(r.camera_model))

    const lensesStmt = this.db.prepare(`
      SELECT DISTINCT lens_model
      FROM imported_files
      WHERE lens_model IS NOT NULL
        AND TRIM(lens_model) != ''
        AND LOWER(TRIM(lens_model)) != 'unknown'
      ORDER BY lens_model ASC
    `)
    const lenses = lensesStmt.all().map((r) => String(r.lens_model))

    return {
      years,
      cameras,
      lenses
    }
  }

  private buildWhereClause(filter?: DashboardFilter): SqlWhereClause {
    const conditions: string[] = []
    const params: Array<string | number> = []

    if (filter?.year !== undefined) {
      conditions.push('captured_year = ?')
      params.push(filter.year)
    }

    if (filter?.dateFrom && filter.dateFrom.trim().length > 0) {
      conditions.push('captured_day >= ?')
      params.push(filter.dateFrom.trim())
    }

    if (filter?.dateTo && filter.dateTo.trim().length > 0) {
      conditions.push('captured_day <= ?')
      params.push(filter.dateTo.trim())
    }

    if (filter?.specificDay && filter.specificDay.trim().length > 0) {
      conditions.push('captured_day = ?')
      params.push(filter.specificDay.trim())
    }

    if (filter?.cameraModel && filter.cameraModel.trim().length > 0) {
      conditions.push('camera_model = ?')
      params.push(filter.cameraModel.trim())
    }

    if (filter?.lensModel && filter.lensModel.trim().length > 0) {
      conditions.push('lens_model = ?')
      params.push(filter.lensModel.trim())
    }

    if (filter?.mediaType && filter.mediaType.trim().length > 0) {
      conditions.push('media_type = ?')
      params.push(filter.mediaType.trim())
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    return { whereSql, params }
  }

  private buildPhotographerInsights(input: {
    totalFiles: number
    cameras: GearUsageStat[]
    lenses: GearUsageStat[]
    sweetSpotFocalLength?: string
    topFocalBucket?: FocalLengthBucket
    apertureCounts: number[]
    totalApertureCount: number
    heatmap: DashboardStatsResult['heatmap']
  }): string[] {
    const {
      totalFiles,
      cameras,
      lenses,
      sweetSpotFocalLength,
      topFocalBucket,
      apertureCounts,
      totalApertureCount,
      heatmap
    } = input

    if (totalFiles === 0) {
      return []
    }

    const insights: string[] = []
    const topCamera = cameras[0]
    const topLens = lenses[0]

    if (topCamera && topLens) {
      insights.push(
        `メイン機材は ${topCamera.name}（${topCamera.percentage}%）× ${topLens.name}（${topLens.percentage}%）の組み合わせが最も活躍しています。`
      )
    } else if (topCamera) {
      insights.push(
        `メインカメラは ${topCamera.name}（稼働率 ${topCamera.percentage}%）です。`
      )
    }

    if (sweetSpotFocalLength && topFocalBucket) {
      insights.push(
        `焦点距離のスイートスポットは ${sweetSpotFocalLength} 帯（${topFocalBucket.percentage}% / ${topFocalBucket.count}枚）です。`
      )
    }

    if (totalApertureCount > 0) {
      const wideCount = apertureCounts[0] + apertureCounts[1]
      const wideRatio = toPercentage(wideCount, totalApertureCount)
      insights.push(
        `F2.8以下の大口径・開放域での撮影が全体の ${wideRatio}% を占めています。`
      )
    }

    if (heatmap.totalActiveDays > 0) {
      insights.push(
        `撮影稼働日は ${heatmap.totalActiveDays} 日（最長連続 ${heatmap.longestStreakDays} 日・最多 ${heatmap.maxDailyShots.date} の ${heatmap.maxDailyShots.count} 枚）です。`
      )
    }

    return insights
  }
}
