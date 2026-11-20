import { describe, expect, it } from 'vitest'
import type { DashboardStatsResult, MediaFileRecord } from '@core/domain/models'
import {
  buildPublicWebExportJson,
  formatDashboardSnsSummary,
  formatPhotoExifCaption
} from '@core/domain/services'

const createSampleStats = (): DashboardStatsResult => ({
  totalFiles: 1240,
  totalBytes: 38_500_000_000,
  uniqueCameras: 2,
  uniqueLenses: 3,
  sweetSpotFocalLength: '35mm',
  cameras: [
    { name: 'ILCE-7M4', count: 980, percentage: 79, totalBytes: 30_000_000_000 },
    { name: 'RICOH GR IIIx', count: 260, percentage: 21, totalBytes: 8_500_000_000 }
  ],
  lenses: [
    { name: 'FE 35mm F1.4 GM', count: 720, percentage: 58, totalBytes: 22_000_000_000 }
  ],
  focalLengthHistogram: [
    { label: '24-35mm', minMm: 24, maxMm: 35, count: 800, percentage: 64.5 }
  ],
  apertureDistribution: [{ label: 'F1.4-F2.0', count: 650, percentage: 52.4 }],
  isoDistribution: [{ label: 'ISO 100-400', count: 900, percentage: 72.6 }],
  monthlyTrends: [
    { month: '2026-11', rawCount: 400, jpegCount: 200, videoCount: 20, totalCount: 620 }
  ],
  heatmap: {
    year: 2026,
    cells: [
      {
        date: '2026-11-19',
        count: 85,
        level: 4,
        topCamera: 'ILCE-7M4',
        topLens: 'FE 35mm F1.4 GM'
      }
    ],
    totalActiveDays: 42,
    longestStreakDays: 7,
    currentStreakDays: 3,
    maxDailyShots: { date: '2026-11-19', count: 85 }
  },
  insights: ['35mm単焦点の使用率が58%を超えています。']
})

const createSampleFile = (overrides: Partial<MediaFileRecord> = {}): MediaFileRecord => ({
  id: 1,
  fileHash: 'abc123',
  originalName: 'DSC0001.ARW',
  sourcePath: 'E:\\DCIM\\100MSDCF\\DSC0001.ARW',
  destPath: 'D:\\Photos\\2026\\2026-11-19\\ARW\\DSC0001.ARW',
  fileSize: 33_000_000,
  mediaType: 'RAW',
  ext: 'ARW',
  capturedAt: '2026-11-19T14:30:00.000Z',
  capturedYear: 2026,
  capturedMonth: '11',
  capturedDay: '2026-11-19',
  capturedHour: 14,
  exif: {
    capturedAt: '2026-11-19T14:30:00.000Z',
    cameraMake: 'SONY',
    cameraModel: 'ILCE-7M4',
    lensModel: 'FE 35mm F1.4 GM',
    focalLength: 35,
    fNumber: 1.4,
    exposureTime: 1 / 500,
    iso: 100,
    rawMetaJson: '{"SecretInternalPath":"C:/Users/secret"}'
  },
  favorite: true,
  webPublic: true,
  ...overrides
})

describe('SnsCaptionDomainService', () => {
  it('formats full Exif caption with hashtags', () => {
    const file = createSampleFile()
    const caption = formatPhotoExifCaption(file)
    expect(caption).toBe(
      '📷 SONY ILCE-7M4 | FE 35mm F1.4 GM | 35mm F1.4 1/500s ISO100 #ILCE7M4 #FE35mmF14GM #Sabaki'
    )
  })

  it('supports omitting hashtags, avoiding duplicate camera make, and formatting long exposures', () => {
    const file = createSampleFile({
      exif: {
        capturedAt: '2026-11-19T22:00:00.000Z',
        cameraMake: 'Canon',
        cameraModel: 'Canon EOS R5',
        lensModel: 'RF50mm F1.2 L USM',
        focalLength35mm: 50,
        fNumber: 1.2,
        exposureTime: 2.5,
        iso: 400
      }
    })
    const caption = formatPhotoExifCaption(file, { includeHashtags: false })
    expect(caption).toBe('📷 Canon EOS R5 | RF50mm F1.2 L USM | 50mm F1.2 2.5s ISO400')
  })

  it('prefers explicit shutterSpeedLabel and handles unknown gear gracefully', () => {
    const file = createSampleFile({
      exif: {
        capturedAt: '2026-11-19T12:00:00.000Z',
        cameraModel: 'Unknown',
        lensModel: 'Unknown',
        shutterSpeedLabel: '1/1000s',
        iso: 200
      }
    })
    expect(formatPhotoExifCaption(file)).toBe('1/1000s ISO200 #Sabaki')
  })

  it('formats dashboard SNS summary with optional period label', () => {
    const stats = createSampleStats()
    const summary = formatDashboardSnsSummary(stats, '2026年11月')

    expect(summary).toContain('📊 2026年11月の撮影記録')
    expect(summary).toContain('1,240枚')
    expect(summary).toContain('稼働日数 42日 / 最長連続 7日')
    expect(summary).toContain('メインカメラ: ILCE-7M4 (79%)')
    expect(summary).toContain('メインレンズ: FE 35mm F1.4 GM (58%)')
    expect(summary).toContain('スイートスポット焦点距離: 35mm')
    expect(summary).toContain('#Sabaki')
  })

  it('builds sanitized public web export JSON without local paths or rawMetaJson', () => {
    const stats = createSampleStats()
    const publicFile = createSampleFile({ id: 1, webPublic: true })
    const privateFile = createSampleFile({
      id: 2,
      originalName: 'PRIVATE.ARW',
      webPublic: false
    })

    const exported = buildPublicWebExportJson(stats, [publicFile, privateFile])
    const serialized = JSON.stringify(exported)

    expect(serialized).not.toContain('sourcePath')
    expect(serialized).not.toContain('destPath')
    expect(serialized).not.toContain('E:\\\\DCIM')
    expect(serialized).not.toContain('D:\\\\Photos')
    expect(serialized).not.toContain('rawMetaJson')
    expect(serialized).not.toContain('PRIVATE.ARW')

    const exportedFiles = exported.publicFiles as Array<Record<string, unknown>>
    expect(exportedFiles).toHaveLength(1)
    expect(exportedFiles[0].originalName).toBe('DSC0001.ARW')
    expect(exportedFiles[0].snsCaption).toContain('#Sabaki')
  })
})
