import type { DashboardFilter, DashboardStatsResult } from '../../domain/models'
import type {
  DistinctFilterOptions,
  IAnalyticsQueryService
} from '../../domain/ports'

/**
 * Retrieves aggregated dashboard analytics statistics and available filter options.
 */
export class GetDashboardStatsUseCase {
  constructor(private readonly analyticsQueryService: IAnalyticsQueryService) {}

  execute(filter?: DashboardFilter): DashboardStatsResult {
    return this.analyticsQueryService.queryDashboardStats(filter)
  }

  getFilterOptions(): DistinctFilterOptions {
    return this.analyticsQueryService.getDistinctFilterOptions()
  }
}
