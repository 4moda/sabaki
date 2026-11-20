import { describe, expect, it } from 'vitest'
import type { ExifMetadata, MediaFileRecord, MediaType } from '@core/domain/models'
import {
  analyzeSessionDigest,
  detectShootingStyleTags,
  type SessionJobCounters
} from '@core/domain/services'

function makeFile(overrides: {
  ext?: string
  mediaType?: MediaType
  capturedHour?: number
  exif?: Partial<ExifMetadata>
}): MediaFileRecord {
  const ext = overrides.ext ?? 'ARW'
  const mediaType = overrides.mediaType ?? 'RAW'
  const capturedHour = overrides.capturedHour ?? 14
  const hourStr = String(capturedHour).padStart(2, '0')
  return {
    fileHash: `hash-${Math.random()}`,
    originalName: `DSC0001.${ext}`,
    sourcePath: `/sd/DSC0001.${ext}`,
    destPath: `/dest/2026/2026-11-19/${ext}/DSC0001.${ext}`,
    fileSize: 30_000_000,
    mediaType,
    ext,
    capturedAt: `2026-11-19T${hourStr}:15:00`,
    capturedYear: 2026,
    capturedMonth: '2026-11',
    capturedDay: '2026-11-19',
    capturedHour,
    exif: {
      capturedAt: `2026-11-19T${hourStr}:15:00`,
      cameraModel: 'ILCE-7M4',
      lensModel: 'FE 35mm F1.4 GM',
      focalLength: 35,
      fNumber: 2.8,
      iso: 200,
      exposureTime: 1 / 250,
      ...overrides.exif
    },
    favorite: false,
    webPublic: false
  }
}

function makeCounters(count: number): SessionJobCounters {
  return {
    jobId: 42,
    totalFiles: count,
    copiedFiles: count,
    skippedFiles: 0,
    renamedFiles: 0,
    overwrittenFiles: 0,
    errorFiles: 0,
    totalBytes: count * 30_000_000
  }
}

describe('SessionDigestDomainService', () => {
  it('computes breakdowns, top gear, top 3 focal lengths, wideApertureRatio, and summaries', () => {
    const files: MediaFileRecord[] = [
      makeFile({
        ext: 'ARW',
        mediaType: 'RAW',
        capturedHour: 17,
        exif: { cameraModel: 'ILCE-7M4', lensModel: 'FE 35mm F1.4 GM', focalLength: 35, fNumber: 1.4 }
      }),
      makeFile({
        ext: 'ARW',
        mediaType: 'RAW',
        capturedHour: 17,
        exif: { cameraModel: 'ILCE-7M4', lensModel: 'FE 35mm F1.4 GM', focalLength: 35, fNumber: 1.8 }
      }),
      makeFile({
        ext: 'JPG',
        mediaType: 'JPEG',
        capturedHour: 16,
        exif: { cameraModel: 'ILCE-7M4', lensModel: 'FE 35mm F1.4 GM', focalLength: 35, fNumber: 2.0 }
      }),
      makeFile({
        ext: 'ARW',
        mediaType: 'RAW',
        capturedHour: 14,
        exif: { cameraModel: 'ILCE-7M4', lensModel: 'FE 85mm F1.4 GM', focalLength: 85, fNumber: 1.4 }
      }),
      makeFile({
        ext: 'MP4',
        mediaType: 'VIDEO',
        capturedHour: 15,
        exif: {
          cameraModel: 'Unknown',
          lensModel: 'Unknown',
          focalLength: undefined,
          fNumber: undefined
        }
      })
    ]

    const digest = analyzeSessionDigest(files, makeCounters(files.length))

    expect(digest.jobId).toBe(42)
    expect(digest.extBreakdown).toEqual({ ARW: 3, JPG: 1, MP4: 1 })
    expect(digest.mediaTypeBreakdown).toEqual({ RAW: 3, JPEG: 1, VIDEO: 1 })
    expect(digest.topCamera).toEqual({ model: 'ILCE-7M4', count: 4, ratio: 100 })
    expect(digest.topLens).toEqual({ model: 'FE 35mm F1.4 GM', count: 3, ratio: 75 })
    expect(digest.topFocalLengths).toEqual([
      { focalLength: 35, count: 3, ratio: 75 },
      { focalLength: 85, count: 1, ratio: 25 }
    ])
    expect(digest.wideApertureRatio).toBe(100)

    const tagIds = digest.styleTags.map((t) => t.id)
    expect(tagIds).toContain('golden_hour')
    expect(tagIds).toContain('bokeh_portrait')

    expect(digest.headlineSummary).toContain('ILCE-7M4')
    expect(digest.headlineSummary).toContain('FE 35mm F1.4 GM (75%)')
    expect(digest.headlineSummary).toContain('35mm中心')

    expect(digest.snsShareText).toContain('#Sabaki')
    expect(digest.snsShareText).toContain('#ILCE7M4')
    expect(digest.snsShareText).toContain('#FE35mmF14GM')
  })

  it('detects night_high_iso, wide_landscape, and high_speed_action style tags', () => {
    const nightFiles = [
      makeFile({ capturedHour: 21, exif: { iso: 800 } }),
      makeFile({ capturedHour: 12, exif: { iso: 6400 } }),
      makeFile({ capturedHour: 13, exif: { iso: 100 } }),
      makeFile({ capturedHour: 14, exif: { iso: 100 } })
    ]
    expect(detectShootingStyleTags(nightFiles).map((t) => t.id)).toContain('night_high_iso')

    const landscapeFiles = [
      makeFile({ exif: { focalLength: 24, fNumber: 8 } }),
      makeFile({ exif: { focalLength: 16, fNumber: 11 } }),
      makeFile({ exif: { focalLength: 50, fNumber: 4 } })
    ]
    expect(detectShootingStyleTags(landscapeFiles).map((t) => t.id)).toContain('wide_landscape')

    const actionFiles = [
      makeFile({ exif: { exposureTime: 1 / 2000 } }),
      makeFile({ exif: { exposureTime: 1 / 1000 } }),
      makeFile({ exif: { exposureTime: 1 / 250 } }),
      makeFile({ exif: { exposureTime: 1 / 125 } })
    ]
    expect(detectShootingStyleTags(actionFiles).map((t) => t.id)).toContain('high_speed_action')
  })

  it('falls back to daily_allround tag when no specialized style threshold is met or batch is empty', () => {
    const neutralFiles = [
      makeFile({ capturedHour: 11, exif: { focalLength: 50, fNumber: 4, iso: 200, exposureTime: 1 / 250 } }),
      makeFile({ capturedHour: 12, exif: { focalLength: 50, fNumber: 4, iso: 400, exposureTime: 1 / 250 } })
    ]
    const neutralTags = detectShootingStyleTags(neutralFiles)
    expect(neutralTags).toHaveLength(1)
    expect(neutralTags[0].id).toBe('daily_allround')

    const emptyDigest = analyzeSessionDigest([], makeCounters(0))
    expect(emptyDigest.styleTags).toHaveLength(1)
    expect(emptyDigest.styleTags[0].id).toBe('daily_allround')
    expect(emptyDigest.wideApertureRatio).toBe(0)
    expect(emptyDigest.topCamera).toBeUndefined()
    expect(emptyDigest.topLens).toBeUndefined()
    expect(emptyDigest.topFocalLengths).toEqual([])
    expect(emptyDigest.snsShareText).toContain('#Sabaki')
  })

  it('limits topFocalLengths to top 3 sorted descending by count', () => {
    const files = [
      makeFile({ exif: { focalLength: 24 } }),
      makeFile({ exif: { focalLength: 35 } }),
      makeFile({ exif: { focalLength: 35 } }),
      makeFile({ exif: { focalLength: 50 } }),
      makeFile({ exif: { focalLength: 50 } }),
      makeFile({ exif: { focalLength: 50 } }),
      makeFile({ exif: { focalLength: 85 } }),
      makeFile({ exif: { focalLength: 85 } }),
      makeFile({ exif: { focalLength: 85 } }),
      makeFile({ exif: { focalLength: 85 } })
    ]
    const digest = analyzeSessionDigest(files, makeCounters(files.length))
    expect(digest.topFocalLengths).toEqual([
      { focalLength: 85, count: 4, ratio: 40 },
      { focalLength: 50, count: 3, ratio: 30 },
      { focalLength: 35, count: 2, ratio: 20 }
    ])
  })
})
