import type { DashboardStatsResult } from '../models/DashboardAnalytics'
import type { ExifMetadata, MediaFileRecord } from '../models/MediaFile'

/**
 * Formats exposureTime (seconds) into a readable shutter speed label such as "1/500s" or "2.5s".
 */
function formatShutterSpeed(exif: ExifMetadata): string | undefined {
  if (exif.shutterSpeedLabel && exif.shutterSpeedLabel.trim().length > 0) {
    return exif.shutterSpeedLabel.trim()
  }
  if (exif.exposureTime === undefined || exif.exposureTime <= 0) {
    return undefined
  }
  if (exif.exposureTime < 1) {
    const denominator = Math.round(1 / exif.exposureTime)
    return `1/${denominator}s`
  }
  const rounded = Number(exif.exposureTime.toFixed(1))
  return `${rounded}s`
}

/**
 * Converts a model or lens name into a clean alphanumeric hashtag without spaces or punctuation.
 */
function toHashtag(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')
  return cleaned.length > 0 ? `#${cleaned}` : ''
}

/**
 * Formats camera make + model without duplicating the make when already present in the model string.
 */
function formatCameraName(exif: ExifMetadata): string {
  const make = exif.cameraMake?.trim()
  const model = exif.cameraModel.trim()
  if (!make) {
    return model
  }
  if (model.toLowerCase().startsWith(make.toLowerCase())) {
    return model
  }
  return `${make} ${model}`
}

/**
 * Formats a single photo's Exif metadata into an SNS-ready caption string.
 * Example: "📷 SONY ILCE-7M4 | FE 35mm F1.4 GM | 35mm F1.4 1/500s ISO100 #ILCE7M4 #FE35mmF14GM #Sabaki"
 */
export function formatPhotoExifCaption(
  file: Pick<MediaFileRecord, 'exif' | 'capturedDay'>,
  options?: { includeHashtags?: boolean }
): string {
  const { exif } = file
  const includeHashtags = options?.includeHashtags ?? true

  const segments: string[] = []
  const cameraName = formatCameraName(exif)
  if (cameraName && cameraName !== 'Unknown') {
    segments.push(`📷 ${cameraName}`)
  }

  const lensModel = exif.lensModel.trim()
  if (lensModel && lensModel !== 'Unknown') {
    segments.push(lensModel)
  }

  const exposureParts: string[] = []
  const focal = exif.focalLength ?? exif.focalLength35mm
  if (focal !== undefined && focal > 0) {
    exposureParts.push(`${focal}mm`)
  }
  if (exif.fNumber !== undefined && exif.fNumber > 0) {
    exposureParts.push(`F${exif.fNumber}`)
  }
  const shutter = formatShutterSpeed(exif)
  if (shutter) {
    exposureParts.push(shutter)
  }
  if (exif.iso !== undefined && exif.iso > 0) {
    exposureParts.push(`ISO${exif.iso}`)
  }

  if (exposureParts.length > 0) {
    segments.push(exposureParts.join(' '))
  }

  const baseCaption = segments.join(' | ')
  if (!includeHashtags) {
    return baseCaption
  }

  const hashtagSet = new Set<string>()
  if (exif.cameraModel.trim() && exif.cameraModel.trim() !== 'Unknown') {
    const tag = toHashtag(exif.cameraModel)
    if (tag) hashtagSet.add(tag)
  }
  if (lensModel && lensModel !== 'Unknown') {
    const tag = toHashtag(lensModel)
    if (tag) hashtagSet.add(tag)
  }
  hashtagSet.add('#Sabaki')

  const hashtags = Array.from(hashtagSet).join(' ')
  return baseCaption ? `${baseCaption} ${hashtags}` : hashtags
}

/**
 * Formats dashboard statistics into a concise SNS share summary.
 */
export function formatDashboardSnsSummary(
  stats: DashboardStatsResult,
  periodLabel?: string
): string {
  const header = periodLabel ? `📊 ${periodLabel}の撮影記録` : '📊 撮影アクティビティサマリー'
  const lines: string[] = [
    header,
    `総ショット数: ${stats.totalFiles.toLocaleString()}枚（稼働日数 ${stats.heatmap.totalActiveDays}日 / 最長連続 ${stats.heatmap.longestStreakDays}日）`
  ]

  const topCamera = stats.cameras[0]
  if (topCamera) {
    lines.push(`メインカメラ: ${topCamera.name} (${topCamera.percentage}%)`)
  }

  const topLens = stats.lenses[0]
  if (topLens) {
    lines.push(`メインレンズ: ${topLens.name} (${topLens.percentage}%)`)
  }

  if (stats.sweetSpotFocalLength) {
    lines.push(`スイートスポット焦点距離: ${stats.sweetSpotFocalLength}`)
  }

  lines.push('#Sabaki #PhotographyStats')
  return lines.join('\n')
}

/**
 * Builds a sanitized JSON payload for public web portfolio export,
 * stripping local filesystem paths (sourcePath, destPath) and raw Exif dumps.
 */
export function buildPublicWebExportJson(
  stats: DashboardStatsResult,
  publicFiles?: MediaFileRecord[]
): Record<string, unknown> {
  const sanitizedFiles = (publicFiles ?? [])
    .filter((file) => file.webPublic)
    .map((file) => {
      const { rawMetaJson: _rawMeta, ...publicExif } = file.exif
      return {
        id: file.id,
        originalName: file.originalName,
        fileSize: file.fileSize,
        mediaType: file.mediaType,
        ext: file.ext,
        capturedAt: file.capturedAt,
        capturedYear: file.capturedYear,
        capturedMonth: file.capturedMonth,
        capturedDay: file.capturedDay,
        exif: publicExif,
        favorite: file.favorite,
        snsCaption: file.snsCaption ?? formatPhotoExifCaption(file),
        webSyncedAt: file.webSyncedAt
      }
    })

  return {
    app: 'Sabaki',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes,
      uniqueCameras: stats.uniqueCameras,
      uniqueLenses: stats.uniqueLenses,
      sweetSpotFocalLength: stats.sweetSpotFocalLength,
      insights: stats.insights
    },
    gear: {
      cameras: stats.cameras,
      lenses: stats.lenses
    },
    distributions: {
      focalLengthHistogram: stats.focalLengthHistogram,
      apertureDistribution: stats.apertureDistribution,
      isoDistribution: stats.isoDistribution,
      monthlyTrends: stats.monthlyTrends
    },
    heatmap: stats.heatmap,
    publicFiles: sanitizedFiles
  }
}
