import {
  generateRealtimePreviews,
  PATH_PRESETS
} from '../../domain/services'
import type {
  PreviewTargetPathsRequest,
  PreviewTargetPathsResult
} from '../dto/ipcContract'

/**
 * Generates real-time sample destination paths for RAW, JPEG, and VIDEO files
 * along with the catalog of recommended path presets.
 */
export class PreviewTargetPathUseCase {
  execute(request: PreviewTargetPathsRequest): PreviewTargetPathsResult {
    const sampleDate =
      request.sampleDate !== undefined
        ? request.sampleDate instanceof Date
          ? request.sampleDate
          : new Date(request.sampleDate)
        : undefined

    const previews = generateRealtimePreviews(
      request.destRoot,
      request.template,
      sampleDate
    )

    return {
      previews,
      presets: PATH_PRESETS.map((preset) => ({ ...preset }))
    }
  }
}
