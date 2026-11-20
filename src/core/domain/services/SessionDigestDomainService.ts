import type { MediaFileRecord, MediaType } from '../models/MediaFile'
import type { SessionDigest, ShootingStyleTag } from '../models/SessionDigest'

/**
 * Job execution counters supplied alongside imported media records.
 */
export interface SessionJobCounters {
  jobId?: number
  totalFiles: number
  copiedFiles: number
  skippedFiles: number
  renamedFiles: number
  overwrittenFiles: number
  errorFiles: number
  totalBytes: number
}

const STYLE_TAG_CATALOG = {
  golden_hour: {
    id: 'golden_hour',
    emoji: '🌅',
    label: 'ゴールデンアワー・夕景セッション',
    description: '夕方（16時〜18時台）の柔らかな光で撮影されたカットが多いセッションです。'
  },
  night_high_iso: {
    id: 'night_high_iso',
    emoji: '🌙',
    label: 'ナイトスナップ・高感度セッション',
    description: '夜間帯（19時〜翌4時台）または高感度（ISO3200以上）の撮影が中心です。'
  },
  bokeh_portrait: {
    id: 'bokeh_portrait',
    emoji: '🌸',
    label: '大口径ボケ味・ポートレート傾向',
    description: 'F2.2以下の大口径と中望遠〜標準域（35mm〜135mm）を活かした撮影傾向です。'
  },
  wide_landscape: {
    id: 'wide_landscape',
    emoji: '🏔️',
    label: '広角・絞り込みランドスケープ傾向',
    description: '28mm以下の広角レンズとF5.6以上の絞り込みで風景を捉えた撮影傾向です。'
  },
  high_speed_action: {
    id: 'high_speed_action',
    emoji: '⚡',
    label: '高速シャッター・アクション傾向',
    description: '1/1000秒以上の高速シャッターで動きを止めたカットが多いセッションです。'
  },
  daily_allround: {
    id: 'daily_allround',
    emoji: '📸',
    label: 'デイリースナップ・オールラウンドセッション',
    description: '幅広いシーンをバランス良く収めたオールラウンドな撮影セッションです。'
  }
} as const satisfies Record<string, ShootingStyleTag>

/**
 * Rounds a ratio (0..1) into a percentage (0..100) with one decimal place.
 */
function toPercentage(count: number, total: number): number {
  if (total <= 0 || count <= 0) {
    return 0
  }
  return Math.round((count / total) * 1000) / 10
}

/**
 * Returns true when a camera or lens name is meaningful (not empty or "Unknown").
 */
function isKnownGearName(name?: string): name is string {
  if (!name) {
    return false
  }
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'unknown'
}

/**
 * Normalizes a file extension to uppercase without leading dot.
 */
function normalizeExt(ext: string): string {
  const cleaned = ext.trim().replace(/^\./, '').toUpperCase()
  return cleaned.length > 0 ? cleaned : 'UNKNOWN'
}

/**
 * Converts a model or lens label into a clean hashtag.
 */
function toHashtag(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')
  return cleaned.length > 0 ? `#${cleaned}` : ''
}

/**
 * Extracts effective focal length (preferring focalLength, falling back to focalLength35mm).
 */
function getEffectiveFocalLength(file: MediaFileRecord): number | undefined {
  const value = file.exif.focalLength ?? file.exif.focalLength35mm
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  return value
}

/**
 * Detects shooting style tags from a batch of media file records.
 */
export function detectShootingStyleTags(files: MediaFileRecord[]): ShootingStyleTag[] {
  const total = files.length
  if (total === 0) {
    return [{ ...STYLE_TAG_CATALOG.daily_allround }]
  }

  let goldenHourCount = 0
  let nightHighIsoCount = 0
  let bokehPortraitCount = 0
  let wideLandscapeCount = 0
  let highSpeedActionCount = 0

  for (const file of files) {
    const hour = file.capturedHour
    const { fNumber, iso, exposureTime } = file.exif
    const focal = getEffectiveFocalLength(file)

    if (hour >= 16 && hour <= 18) {
      goldenHourCount += 1
    }

    if (hour >= 19 || hour <= 4 || (iso !== undefined && iso >= 3200)) {
      nightHighIsoCount += 1
    }

    if (
      fNumber !== undefined &&
      fNumber > 0 &&
      fNumber <= 2.2 &&
      focal !== undefined &&
      focal >= 35 &&
      focal <= 135
    ) {
      bokehPortraitCount += 1
    }

    if (
      focal !== undefined &&
      focal <= 28 &&
      fNumber !== undefined &&
      fNumber >= 5.6
    ) {
      wideLandscapeCount += 1
    }

    if (exposureTime !== undefined && exposureTime > 0 && exposureTime <= 0.001) {
      highSpeedActionCount += 1
    }
  }

  const tags: ShootingStyleTag[] = []

  if (goldenHourCount / total >= 0.25) {
    tags.push({ ...STYLE_TAG_CATALOG.golden_hour })
  }
  if (nightHighIsoCount / total >= 0.25) {
    tags.push({ ...STYLE_TAG_CATALOG.night_high_iso })
  }
  if (bokehPortraitCount / total >= 0.3) {
    tags.push({ ...STYLE_TAG_CATALOG.bokeh_portrait })
  }
  if (wideLandscapeCount / total >= 0.3) {
    tags.push({ ...STYLE_TAG_CATALOG.wide_landscape })
  }
  if (highSpeedActionCount / total >= 0.25) {
    tags.push({ ...STYLE_TAG_CATALOG.high_speed_action })
  }

  if (tags.length === 0) {
    tags.push({ ...STYLE_TAG_CATALOG.daily_allround })
  }

  return tags
}

/**
 * Picks the most frequent key from a frequency map, tie-breaking alphabetically.
 */
function findTopEntry(
  counts: Map<string, number>,
  totalValid: number
): { model: string; count: number; ratio: number } | undefined {
  let topModel: string | undefined
  let topCount = 0

  for (const [model, count] of counts.entries()) {
    if (count > topCount || (count === topCount && topModel !== undefined && model < topModel)) {
      topModel = model
      topCount = count
    }
  }

  if (!topModel || topCount <= 0) {
    return undefined
  }

  return {
    model: topModel,
    count: topCount,
    ratio: toPercentage(topCount, totalValid)
  }
}

/**
 * Analyzes a batch of imported media files and job counters to produce a complete SessionDigest.
 */
export function analyzeSessionDigest(
  files: MediaFileRecord[],
  counters: SessionJobCounters
): SessionDigest {
  const extBreakdown: Record<string, number> = {}
  const mediaTypeBreakdown: Record<MediaType, number> = {
    RAW: 0,
    JPEG: 0,
    VIDEO: 0
  }

  const cameraCounts = new Map<string, number>()
  let knownCameraTotal = 0

  const lensCounts = new Map<string, number>()
  let knownLensTotal = 0

  const focalCounts = new Map<number, number>()
  let focalTotal = 0

  let apertureTotal = 0
  let wideApertureCount = 0

  for (const file of files) {
    const ext = normalizeExt(file.ext)
    extBreakdown[ext] = (extBreakdown[ext] ?? 0) + 1
    mediaTypeBreakdown[file.mediaType] = (mediaTypeBreakdown[file.mediaType] ?? 0) + 1

    if (isKnownGearName(file.exif.cameraModel)) {
      const model = file.exif.cameraModel.trim()
      cameraCounts.set(model, (cameraCounts.get(model) ?? 0) + 1)
      knownCameraTotal += 1
    }

    if (isKnownGearName(file.exif.lensModel)) {
      const lens = file.exif.lensModel.trim()
      lensCounts.set(lens, (lensCounts.get(lens) ?? 0) + 1)
      knownLensTotal += 1
    }

    const focal = getEffectiveFocalLength(file)
    if (focal !== undefined) {
      const roundedFocal = Math.round(focal)
      focalCounts.set(roundedFocal, (focalCounts.get(roundedFocal) ?? 0) + 1)
      focalTotal += 1
    }

    if (file.exif.fNumber !== undefined && file.exif.fNumber > 0) {
      apertureTotal += 1
      if (file.exif.fNumber <= 2.8) {
        wideApertureCount += 1
      }
    }
  }

  const topCamera = findTopEntry(cameraCounts, knownCameraTotal)
  const topLens = findTopEntry(lensCounts, knownLensTotal)

  const topFocalLengths = Array.from(focalCounts.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] - b[0]))
    .slice(0, 3)
    .map(([focalLength, count]) => ({
      focalLength,
      count,
      ratio: toPercentage(count, focalTotal)
    }))

  const wideApertureRatio = toPercentage(wideApertureCount, apertureTotal)
  const styleTags = detectShootingStyleTags(files)
  const primaryStyle = styleTags[0]

  // Build OS notification headline summary
  let gearPart: string
  if (topCamera && topLens) {
    gearPart = `📷 ${topCamera.model} / ${topLens.model} (${Math.round(topLens.ratio)}%)`
  } else if (topCamera) {
    gearPart = `📷 ${topCamera.model} (${Math.round(topCamera.ratio)}%)`
  } else if (topLens) {
    gearPart = `📷 ${topLens.model} (${Math.round(topLens.ratio)}%)`
  } else {
    const importedCount = counters.copiedFiles + counters.renamedFiles + counters.overwrittenFiles
    gearPart = `📷 ${importedCount}件のメディアを取り込みました`
  }

  const insightPart =
    topFocalLengths.length > 0
      ? `🎯 ${topFocalLengths[0].focalLength}mm中心・${primaryStyle.label}`
      : `${primaryStyle.emoji} ${primaryStyle.label}`

  const headlineSummary = `${gearPart} | ${insightPart}`

  // Build ready-to-post SNS share text
  const snsLines: string[] = [
    `📸 今日の撮影ログ（${counters.totalFiles.toLocaleString()}枚取り込み）`
  ]

  if (topCamera || topLens) {
    const gearLabels = [topCamera?.model, topLens?.model].filter(Boolean).join(' / ')
    snsLines.push(`機材: ${gearLabels}`)
  }

  if (topFocalLengths.length > 0) {
    const focalSummary = topFocalLengths
      .map((item) => `${item.focalLength}mm (${Math.round(item.ratio)}%)`)
      .join(' / ')
    snsLines.push(`よく使った焦点距離: ${focalSummary}`)
  }

  snsLines.push(styleTags.map((tag) => `${tag.emoji} ${tag.label}`).join(' / '))

  const hashtags = new Set<string>()
  if (topCamera) {
    const tag = toHashtag(topCamera.model)
    if (tag) hashtags.add(tag)
  }
  if (topLens) {
    const tag = toHashtag(topLens.model)
    if (tag) hashtags.add(tag)
  }
  hashtags.add('#Sabaki')
  snsLines.push(Array.from(hashtags).join(' '))

  return {
    jobId: counters.jobId,
    totalFiles: counters.totalFiles,
    copiedFiles: counters.copiedFiles,
    skippedFiles: counters.skippedFiles,
    renamedFiles: counters.renamedFiles,
    overwrittenFiles: counters.overwrittenFiles,
    errorFiles: counters.errorFiles,
    totalBytes: counters.totalBytes,
    extBreakdown,
    mediaTypeBreakdown,
    topCamera,
    topLens,
    topFocalLengths,
    wideApertureRatio,
    styleTags,
    headlineSummary,
    snsShareText: snsLines.join('\n')
  }
}
