import type {
  IAnalyticsQueryService,
  IFileRepository,
  IFileSystemGateway
} from '../../domain/ports'
import { buildPublicWebExportJson } from '../../domain/services'
import type {
  ExportPublicWebJsonRequest,
  ExportPublicWebJsonResult
} from '../dto/ipcContract'

/**
 * Port dependencies injected into ExportPublicWebJsonUseCase.
 */
export interface ExportPublicWebJsonDeps {
  analyticsQueryService: IAnalyticsQueryService
  fileRepository: IFileRepository
  fileSystem: IFileSystemGateway
}

/**
 * Exports privacy-safe dashboard analytics and public-flagged photo metadata
 * to a JSON payload (and optionally writes `stats-public.json` to disk).
 */
export class ExportPublicWebJsonUseCase {
  constructor(private readonly deps: ExportPublicWebJsonDeps) {}

  async execute(
    request?: ExportPublicWebJsonRequest
  ): Promise<ExportPublicWebJsonResult> {
    const { analyticsQueryService, fileRepository, fileSystem } = this.deps

    const stats = analyticsQueryService.queryDashboardStats(request?.filter)
    const files =
      request?.includePublicFiles === false
        ? []
        : fileRepository.findRecent({ limit: 1000 })

    const payload = buildPublicWebExportJson(stats, files)

    if (request?.outputPath) {
      await fileSystem.writeTextFile(
        request.outputPath,
        JSON.stringify(payload, null, 2)
      )
    }

    const publicFiles = Array.isArray(payload.publicFiles) ? payload.publicFiles : []

    return {
      payload,
      outputPath: request?.outputPath,
      exportedFileCount: publicFiles.length,
      canceled: false
    }
  }
}
