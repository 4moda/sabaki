import type { MediaType } from './MediaFile'

/**
 * Single day cell in the GitHub-style shooting activity heatmap.
 */
export interface HeatmapDayCell {
  date: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
  topCamera?: string
  topLens?: string
}

/**
 * Annual shooting activity heatmap and streak summary.
 *
 * `cells` always describe the displayed calendar window and are NOT narrowed by
 * `DashboardFilter.specificDay` (selecting a day only moves the highlight).
 * The summary values (`totalActiveDays`, streaks, `maxDailyShots`) follow every filter
 * including `specificDay`, so they stay consistent with `totalFiles` and other KPIs.
 */
export interface HeatmapSummary {
  year: number
  cells: HeatmapDayCell[]
  totalActiveDays: number
  longestStreakDays: number
  currentStreakDays: number
  maxDailyShots: { date: string; count: number }
}

/**
 * Usage statistics for a camera body or lens.
 */
export interface GearUsageStat {
  name: string
  count: number
  percentage: number
  totalBytes: number
}

/**
 * Histogram bucket for focal length distribution.
 */
export interface FocalLengthBucket {
  label: string
  minMm: number
  maxMm: number
  count: number
  percentage: number
}

/**
 * Distribution bucket for aperture (F-number) usage.
 */
export interface ApertureBucket {
  label: string
  count: number
  percentage: number
}

/**
 * Distribution bucket for ISO sensitivity usage.
 */
export interface IsoBucket {
  label: string
  count: number
  percentage: number
}

/**
 * Monthly shot count breakdown by media type.
 */
export interface MonthlyTrendPoint {
  month: string
  rawCount: number
  jpegCount: number
  videoCount: number
  totalCount: number
}

/**
 * Filter criteria for querying dashboard analytics.
 */
export interface DashboardFilter {
  year?: number
  dateFrom?: string
  dateTo?: string
  specificDay?: string
  cameraModel?: string
  lensModel?: string
  mediaType?: MediaType
  use35mmEquivalent?: boolean
}

/**
 * Aggregated analytics result for the statistics dashboard.
 */
export interface DashboardStatsResult {
  totalFiles: number
  totalBytes: number
  uniqueCameras: number
  uniqueLenses: number
  sweetSpotFocalLength?: string
  cameras: GearUsageStat[]
  lenses: GearUsageStat[]
  focalLengthHistogram: FocalLengthBucket[]
  apertureDistribution: ApertureBucket[]
  isoDistribution: IsoBucket[]
  monthlyTrends: MonthlyTrendPoint[]
  heatmap: HeatmapSummary
  insights: string[]
}
