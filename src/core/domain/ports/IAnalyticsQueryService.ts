import type { DashboardFilter, DashboardStatsResult } from '../models/DashboardAnalytics'

/**
 * Distinct filter values available for the analytics dashboard dropdowns.
 */
export interface DistinctFilterOptions {
  years: number[]
  cameras: string[]
  lenses: string[]
}

/**
 * Query port for aggregated dashboard analytics and filter metadata.
 */
export interface IAnalyticsQueryService {
  queryDashboardStats(filter?: DashboardFilter): DashboardStatsResult
  getDistinctFilterOptions(): DistinctFilterOptions
}
