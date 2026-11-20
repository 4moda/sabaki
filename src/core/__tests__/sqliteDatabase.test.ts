import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MediaFileRecord } from '@core/domain/models'
import {
  GetDashboardStatsUseCase,
  SeedDemoDataUseCase
} from '@core/application/usecases'
import {
  SqliteAnalyticsQueryService,
  SqliteConnection,
  SqliteFileRepository,
  SqliteJobRepository
} from '@main/infrastructure/database'

function buildSampleFile(overrides: Partial<MediaFileRecord> = {}): MediaFileRecord {
  const capturedAt = overrides.capturedAt ?? '2026-11-19T17:15:00'
  const capturedDay = overrides.capturedDay ?? capturedAt.slice(0, 10)
  const capturedMonth = overrides.capturedMonth ?? capturedAt.slice(0, 7)
  const capturedYear = overrides.capturedYear ?? Number(capturedAt.slice(0, 4))
  const capturedHour = overrides.capturedHour ?? 17

  return {
    fileHash: 'sha256-sample-001',
    originalName: 'DSC0001.ARW',
    sourcePath: '/SD/DCIM/100MSDCF/DSC0001.ARW',
    destPath: '/Library/2026/2026-11-19/ARW/DSC0001.ARW',
    fileSize: 32_000_000,
    mediaType: 'RAW',
    ext: 'ARW',
    capturedAt,
    capturedYear,
    capturedMonth,
    capturedDay,
    capturedHour,
    exif: {
      capturedAt,
      cameraMake: 'SONY',
      cameraModel: 'ILCE-7M4',
      lensModel: 'FE 35mm F1.4 GM',
      focalLength: 35,
      focalLength35mm: 35,
      fNumber: 1.4,
      iso: 200,
      exposureTime: 1 / 500,
      shutterSpeedLabel: '1/500s',
      imageWidth: 7008,
      imageHeight: 4672,
      ...(overrides.exif ?? {})
    },
    favorite: false,
    snsCaption: '📷 SONY ILCE-7M4 | FE 35mm F1.4 GM #Sabaki',
    webPublic: false,
    ...overrides
  }
}

describe('SQLite Infrastructure Layer (SqliteConnection, Repositories & Analytics)', () => {
  let conn: SqliteConnection
  let fileRepo: SqliteFileRepository
  let jobRepo: SqliteJobRepository
  let analyticsService: SqliteAnalyticsQueryService

  beforeEach(() => {
    conn = new SqliteConnection(':memory:')
    fileRepo = new SqliteFileRepository(conn)
    jobRepo = new SqliteJobRepository(conn)
    analyticsService = new SqliteAnalyticsQueryService(conn)
  })

  afterEach(() => {
    conn.close()
  })

  describe('SqliteConnection & Schema Migrations', () => {
    it('creates tables and all required indexes in :memory: mode', () => {
      const db = conn.getDb()
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('imported_files', 'import_jobs', 'app_metadata')"
        )
        .all()
        .map((r) => String(r.name))

      expect(tables).toContain('imported_files')
      expect(tables).toContain('import_jobs')
      expect(tables).toContain('app_metadata')

      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'imported_files'"
        )
        .all()
        .map((r) => String(r.name))

      expect(indexes).toEqual(
        expect.arrayContaining([
          'idx_files_hash',
          'idx_files_captured_day',
          'idx_files_camera',
          'idx_files_lens',
          'idx_files_focal',
          'idx_files_year'
        ])
      )
    })

    it('reads and updates key-value entries in app_metadata', () => {
      expect(conn.getMeta('initial_demo_seeded')).toBeNull()
      conn.setMeta('initial_demo_seeded', '1')
      expect(conn.getMeta('initial_demo_seeded')).toBe('1')
      conn.setMeta('initial_demo_seeded', '0')
      expect(conn.getMeta('initial_demo_seeded')).toBe('0')
    })

    it('enables WAL journal mode for file-backed SQLite databases', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'sabaki-sqlite-test-'))
      const dbFile = join(tempDir, 'nested', 'sabaki.db')
      const fileConn = new SqliteConnection(dbFile)

      try {
        const row = fileConn.getDb().prepare('PRAGMA journal_mode;').get()
        expect(String(row?.journal_mode).toLowerCase()).toBe('wal')
      } finally {
        fileConn.close()
        rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })

  describe('SqliteFileRepository', () => {
    it('saves, finds by id, checks hash existence, and handles conflict on dest_path', () => {
      expect(fileRepo.existsByHash('sha256-sample-001')).toBe(false)
      expect(fileRepo.countAll()).toBe(0)

      const saved = fileRepo.save(buildSampleFile())
      expect(saved.id).toBeDefined()
      expect(fileRepo.existsByHash('sha256-sample-001')).toBe(true)
      expect(fileRepo.countAll()).toBe(1)

      const found = fileRepo.findById(saved.id!)
      expect(found).not.toBeNull()
      expect(found?.originalName).toBe('DSC0001.ARW')
      expect(found?.exif.cameraModel).toBe('ILCE-7M4')
      expect(found?.exif.fNumber).toBe(1.4)

      // Upsert on same dest_path updates record without creating duplicate row
      const updated = fileRepo.save(
        buildSampleFile({
          fileHash: 'sha256-updated-001',
          fileSize: 40_000_000,
          favorite: true
        })
      )
      expect(fileRepo.countAll()).toBe(1)
      expect(updated.id).toBe(saved.id)
      expect(updated.fileHash).toBe('sha256-updated-001')
      expect(updated.fileSize).toBe(40_000_000)
      expect(updated.favorite).toBe(true)
    })

    it('batch inserts files within an explicit transaction and supports findRecent filters & toggleFavorite', () => {
      const batch: MediaFileRecord[] = [
        buildSampleFile({
          fileHash: 'hash-1',
          originalName: 'DSC0101.ARW',
          destPath: '/Library/DSC0101.ARW',
          mediaType: 'RAW',
          capturedAt: '2026-11-17T10:00:00',
          capturedDay: '2026-11-17',
          favorite: true,
          exif: {
            capturedAt: '2026-11-17T10:00:00',
            cameraModel: 'ILCE-7M4',
            lensModel: 'FE 35mm F1.4 GM'
          }
        }),
        buildSampleFile({
          fileHash: 'hash-2',
          originalName: 'DSC0102.JPG',
          destPath: '/Library/DSC0102.JPG',
          mediaType: 'JPEG',
          ext: 'JPG',
          capturedAt: '2026-11-18T12:00:00',
          capturedDay: '2026-11-18',
          favorite: false,
          exif: {
            capturedAt: '2026-11-18T12:00:00',
            cameraModel: 'EOS R5',
            lensModel: 'RF 28-70mm F2L'
          }
        }),
        buildSampleFile({
          fileHash: 'hash-3',
          originalName: 'C0103.MP4',
          destPath: '/Library/C0103.MP4',
          mediaType: 'VIDEO',
          ext: 'MP4',
          capturedAt: '2026-11-19T18:00:00',
          capturedDay: '2026-11-19',
          favorite: false,
          exif: {
            capturedAt: '2026-11-19T18:00:00',
            cameraModel: 'ILCE-7CR',
            lensModel: 'FE 85mm F1.4 GM II'
          }
        })
      ]

      fileRepo.saveBatch(batch)
      expect(fileRepo.countAll()).toBe(3)

      // Ordered by captured_at DESC
      const allRecent = fileRepo.findRecent()
      expect(allRecent.map((f) => f.originalName)).toEqual([
        'C0103.MP4',
        'DSC0102.JPG',
        'DSC0101.ARW'
      ])

      // Filter by favoriteOnly
      const favorites = fileRepo.findRecent({ favoriteOnly: true })
      expect(favorites).toHaveLength(1)
      expect(favorites[0].originalName).toBe('DSC0101.ARW')

      // Filter by cameraModel & lensModel
      const canonFiles = fileRepo.findRecent({
        cameraModel: 'EOS R5',
        lensModel: 'RF 28-70mm F2L'
      })
      expect(canonFiles).toHaveLength(1)
      expect(canonFiles[0].originalName).toBe('DSC0102.JPG')

      // Filter by specificDay
      const dayFiles = fileRepo.findRecent({ specificDay: '2026-11-19' })
      expect(dayFiles).toHaveLength(1)
      expect(dayFiles[0].originalName).toBe('C0103.MP4')

      // Filter by mediaType
      const videoFiles = fileRepo.findRecent({ mediaType: 'VIDEO' })
      expect(videoFiles).toHaveLength(1)
      expect(videoFiles[0].originalName).toBe('C0103.MP4')

      // Filter by search text
      const searched = fileRepo.findRecent({ search: '85mm' })
      expect(searched).toHaveLength(1)
      expect(searched[0].originalName).toBe('C0103.MP4')

      // Pagination (limit & offset)
      const paged = fileRepo.findRecent({ limit: 1, offset: 1 })
      expect(paged).toHaveLength(1)
      expect(paged[0].originalName).toBe('DSC0102.JPG')

      // toggleFavorite
      const targetId = canonFiles[0].id!
      expect(fileRepo.toggleFavorite(targetId)).toBe(true)
      expect(fileRepo.findById(targetId)?.favorite).toBe(true)
      expect(fileRepo.toggleFavorite(targetId)).toBe(false)
      expect(fileRepo.findById(targetId)?.favorite).toBe(false)
      expect(fileRepo.toggleFavorite(999_999)).toBe(false)
    })
  })

  describe('SqliteJobRepository', () => {
    it('creates, updates, finds by id, and lists recent import jobs', () => {
      const job1 = jobRepo.createJob({
        sourceDir: '/SD1',
        destRoot: '/Library',
        pathTemplate: '{YYYY}/{YYYY-MM-DD}/{Ext}',
        conflictPolicy: {
          skipHistoryDuplicates: true,
          fileConflictMode: 'skip_same_hash_rename_diff'
        },
        status: 'running',
        totalFiles: 50,
        copiedFiles: 0,
        skippedFiles: 0,
        renamedFiles: 0,
        overwrittenFiles: 0,
        errorFiles: 0,
        totalBytes: 0,
        startedAt: '2026-11-18T10:00:00Z'
      })

      expect(job1.id).toBeDefined()

      jobRepo.updateJob(job1.id!, {
        status: 'completed',
        copiedFiles: 48,
        skippedFiles: 2,
        totalBytes: 1_500_000_000,
        completedAt: '2026-11-18T10:02:00Z',
        digestJson: '{"headlineSummary":"48 files imported"}'
      })

      const updatedJob1 = jobRepo.findById(job1.id!)
      expect(updatedJob1?.status).toBe('completed')
      expect(updatedJob1?.copiedFiles).toBe(48)
      expect(updatedJob1?.skippedFiles).toBe(2)
      expect(updatedJob1?.totalBytes).toBe(1_500_000_000)
      expect(updatedJob1?.digestJson).toBe('{"headlineSummary":"48 files imported"}')

      const job2 = jobRepo.createJob({
        sourceDir: '/SD2',
        destRoot: '/Library',
        pathTemplate: '{YYYY}/{MM}/{Ext}',
        conflictPolicy: {
          skipHistoryDuplicates: false,
          fileConflictMode: 'rename'
        },
        status: 'failed',
        totalFiles: 10,
        copiedFiles: 3,
        skippedFiles: 0,
        renamedFiles: 1,
        overwrittenFiles: 0,
        errorFiles: 6,
        totalBytes: 90_000_000,
        startedAt: '2026-11-19T12:00:00Z',
        errorMessage: 'Disk full'
      })

      const recentJobs = jobRepo.findRecentJobs(10)
      expect(recentJobs).toHaveLength(2)
      expect(recentJobs[0].id).toBe(job2.id)
      expect(recentJobs[0].errorMessage).toBe('Disk full')
      expect(recentJobs[1].id).toBe(job1.id)
    })
  })

  describe('SqliteAnalyticsQueryService', () => {
    beforeEach(() => {
      // Seed controlled records spanning multiple focal lengths (including APS-C 35mm eq difference),
      // apertures, ISOs, media types, months, and days
      fileRepo.saveBatch([
        // 1. APS-C 16mm (24mm eq), F1.4, ISO 100, RAW, 2026-10-10
        buildSampleFile({
          fileHash: 'a-1',
          originalName: 'APS001.ARW',
          destPath: '/Lib/APS001.ARW',
          fileSize: 25_000_000,
          mediaType: 'RAW',
          capturedAt: '2026-10-10T16:30:00',
          capturedYear: 2026,
          capturedMonth: '2026-10',
          capturedDay: '2026-10-10',
          capturedHour: 16,
          exif: {
            capturedAt: '2026-10-10T16:30:00',
            cameraModel: 'ILCE-6700',
            lensModel: 'E 16mm F1.4',
            focalLength: 16, // ~20mm bucket when raw
            focalLength35mm: 24, // 21-34mm bucket when 35mm equivalent!
            fNumber: 1.4, // F1.2-F1.8
            iso: 100 // ISO ~400
          }
        }),
        // 2. Full-frame 35mm, F2.8, ISO 800, RAW, 2026-11-18
        buildSampleFile({
          fileHash: 'a-2',
          originalName: 'FF002.ARW',
          destPath: '/Lib/FF002.ARW',
          fileSize: 35_000_000,
          mediaType: 'RAW',
          capturedAt: '2026-11-18T17:00:00',
          capturedYear: 2026,
          capturedMonth: '2026-11',
          capturedDay: '2026-11-18',
          capturedHour: 17,
          exif: {
            capturedAt: '2026-11-18T17:00:00',
            cameraModel: 'ILCE-7M4',
            lensModel: 'FE 35mm F1.4 GM',
            focalLength: 35, // 35-55mm
            focalLength35mm: 35,
            fNumber: 2.8, // F2.0-F2.8
            iso: 800 // ISO 401-1600
          }
        }),
        // 3. Full-frame 50mm, F4.0, ISO 3200, JPEG, 2026-11-19
        buildSampleFile({
          fileHash: 'a-3',
          originalName: 'FF003.JPG',
          destPath: '/Lib/FF003.JPG',
          fileSize: 10_000_000,
          mediaType: 'JPEG',
          ext: 'JPG',
          capturedAt: '2026-11-19T19:00:00',
          capturedYear: 2026,
          capturedMonth: '2026-11',
          capturedDay: '2026-11-19',
          capturedHour: 19,
          exif: {
            capturedAt: '2026-11-19T19:00:00',
            cameraModel: 'ILCE-7M4',
            lensModel: 'FE 24-70mm F2.8 GM II',
            focalLength: 50, // 35-55mm
            focalLength35mm: 50,
            fNumber: 4.0, // F3.2-F5.6
            iso: 3200 // ISO 1601-6400
          }
        }),
        // 4. Full-frame 85mm, F8.0, ISO 12800, RAW, 2026-11-19
        buildSampleFile({
          fileHash: 'a-4',
          originalName: 'FF004.ARW',
          destPath: '/Lib/FF004.ARW',
          fileSize: 35_000_000,
          mediaType: 'RAW',
          capturedAt: '2026-11-19T20:00:00',
          capturedYear: 2026,
          capturedMonth: '2026-11',
          capturedDay: '2026-11-19',
          capturedHour: 20,
          exif: {
            capturedAt: '2026-11-19T20:00:00',
            cameraModel: 'ILCE-7M4',
            lensModel: 'FE 85mm F1.4 GM II',
            focalLength: 85, // 56-105mm
            focalLength35mm: 85,
            fNumber: 8.0, // F6.3-F11
            iso: 12800 // ISO 6401+
          }
        }),
        // 5. Super Tele 300mm, F16, ISO 400, VIDEO, 2025-12-01
        buildSampleFile({
          fileHash: 'a-5',
          originalName: 'VID005.MP4',
          destPath: '/Lib/VID005.MP4',
          fileSize: 95_000_000,
          mediaType: 'VIDEO',
          ext: 'MP4',
          capturedAt: '2025-12-01T11:00:00',
          capturedYear: 2025,
          capturedMonth: '2025-12',
          capturedDay: '2025-12-01',
          capturedHour: 11,
          exif: {
            capturedAt: '2025-12-01T11:00:00',
            cameraModel: 'EOS R5',
            lensModel: 'RF 100-500mm F4.5-7.1L',
            focalLength: 300, // 201mm+
            focalLength35mm: 300,
            fNumber: 16, // F13+
            iso: 400 // ISO ~400
          }
        })
      ])
    })

    it('computes totals, gear rankings, aperture/ISO buckets, monthly trends, heatmap, and insights', () => {
      const stats = analyticsService.queryDashboardStats()

      expect(stats.totalFiles).toBe(5)
      expect(stats.totalBytes).toBe(200_000_000)
      expect(stats.uniqueCameras).toBe(3)
      expect(stats.uniqueLenses).toBe(5)

      // Top camera is ILCE-7M4 with 3 shots (60%)
      expect(stats.cameras[0]).toEqual({
        name: 'ILCE-7M4',
        count: 3,
        percentage: 60,
        totalBytes: 80_000_000
      })

      // Sweet spot focal length is Standard 35-55mm (2 shots: 35mm & 50mm)
      expect(stats.sweetSpotFocalLength).toBe('35-55mm')

      // Aperture distribution covers all 5 buckets (1 each = 20%)
      expect(stats.apertureDistribution).toEqual([
        { label: 'F1.2-F1.8', count: 1, percentage: 20 },
        { label: 'F2.0-F2.8', count: 1, percentage: 20 },
        { label: 'F3.2-F5.6', count: 1, percentage: 20 },
        { label: 'F6.3-F11', count: 1, percentage: 20 },
        { label: 'F13+', count: 1, percentage: 20 }
      ])

      // ISO distribution
      expect(stats.isoDistribution).toEqual([
        { label: 'ISO ~400', count: 2, percentage: 40 },
        { label: 'ISO 401-1600', count: 1, percentage: 20 },
        { label: 'ISO 1601-6400', count: 1, percentage: 20 },
        { label: 'ISO 6401+', count: 1, percentage: 20 }
      ])

      // Monthly trends ordered chronologically
      expect(stats.monthlyTrends).toEqual([
        { month: '2025-12', rawCount: 0, jpegCount: 0, videoCount: 1, totalCount: 1 },
        { month: '2026-10', rawCount: 1, jpegCount: 0, videoCount: 0, totalCount: 1 },
        { month: '2026-11', rawCount: 2, jpegCount: 1, videoCount: 0, totalCount: 3 }
      ])

      // Heatmap summary & per-day top gear
      expect(stats.heatmap.totalActiveDays).toBe(4)
      expect(stats.heatmap.longestStreakDays).toBe(2) // 2026-11-18 and 2026-11-19
      expect(stats.heatmap.currentStreakDays).toBe(2)
      expect(stats.heatmap.maxDailyShots).toEqual({ date: '2026-11-19', count: 2 })

      const nov19Cell = stats.heatmap.cells.find((c) => c.date === '2026-11-19')
      expect(nov19Cell?.count).toBe(2)
      expect(nov19Cell?.topCamera).toBe('ILCE-7M4')

      // Actionable photographer insights
      expect(stats.insights.length).toBeGreaterThanOrEqual(3)
      expect(stats.insights.some((i) => i.includes('ILCE-7M4'))).toBe(true)
      expect(stats.insights.some((i) => i.includes('35-55mm'))).toBe(true)
    })

    it('switches focalLengthHistogram between physical focal_length and 35mm equivalent when use35mmEquivalent is set', () => {
      const physicalStats = analyticsService.queryDashboardStats({
        use35mmEquivalent: false
      })
      const eq35Stats = analyticsService.queryDashboardStats({
        use35mmEquivalent: true
      })

      // In physical focal length: 16mm is in '~20mm' (count 1), '21-34mm' has count 0
      const physUltraWide = physicalStats.focalLengthHistogram.find(
        (b) => b.label === '~20mm'
      )
      const physWide = physicalStats.focalLengthHistogram.find(
        (b) => b.label === '21-34mm'
      )
      expect(physUltraWide?.count).toBe(1)
      expect(physWide?.count).toBe(0)

      // In 35mm equivalent: 16mm has focalLength35mm=24mm, shifting from '~20mm' to '21-34mm'
      const eqUltraWide = eq35Stats.focalLengthHistogram.find(
        (b) => b.label === '~20mm'
      )
      const eqWide = eq35Stats.focalLengthHistogram.find(
        (b) => b.label === '21-34mm'
      )
      expect(eqUltraWide?.count).toBe(0)
      expect(eqWide?.count).toBe(1)
    })

    it('supports filtering by year, date range, specificDay, cameraModel, lensModel, and mediaType', () => {
      const byYear = analyticsService.queryDashboardStats({ year: 2026 })
      expect(byYear.totalFiles).toBe(4)
      expect(byYear.heatmap.year).toBe(2026)
      expect(byYear.heatmap.cells).toHaveLength(365)

      const byCamera = analyticsService.queryDashboardStats({
        cameraModel: 'ILCE-7M4'
      })
      expect(byCamera.totalFiles).toBe(3)
      expect(byCamera.uniqueCameras).toBe(1)

      const byDay = analyticsService.queryDashboardStats({
        specificDay: '2026-11-19'
      })
      expect(byDay.totalFiles).toBe(2)

      const byMediaType = analyticsService.queryDashboardStats({
        mediaType: 'VIDEO'
      })
      expect(byMediaType.totalFiles).toBe(1)
      expect(byMediaType.sweetSpotFocalLength).toBe('201mm+')
    })

    it('returns distinct filter options (years, cameras, lenses)', () => {
      const options = analyticsService.getDistinctFilterOptions()
      expect(options.years).toEqual([2026, 2025])
      expect(options.cameras).toEqual(['EOS R5', 'ILCE-6700', 'ILCE-7M4'])
      expect(options.lenses).toContain('FE 35mm F1.4 GM')
      expect(options.lenses).toContain('RF 100-500mm F4.5-7.1L')
    })
  })

  describe('SeedDemoDataUseCase + GetDashboardStatsUseCase Integration with Real SQLite', () => {
    it('seeds 180 realistic 52-week records into SQLite and queries complete dashboard analytics', () => {
      const seedUseCase = new SeedDemoDataUseCase({
        fileRepository: fileRepo,
        jobRepository: jobRepo
      })
      const dashboardUseCase = new GetDashboardStatsUseCase(analyticsService)

      const seedResult = seedUseCase.execute({
        shotCount: 180,
        referenceDate: '2026-11-19'
      })

      expect(seedResult.insertedFiles).toBe(180)
      expect(fileRepo.countAll()).toBe(180)
      expect(seedResult.job.id).toBeDefined()
      expect(seedResult.job.status).toBe('completed')

      const persistedJob = jobRepo.findById(seedResult.job.id!)
      expect(persistedJob?.status).toBe('completed')
      expect(persistedJob?.copiedFiles).toBe(180)
      expect(persistedJob?.digestJson).toBeDefined()

      const stats = dashboardUseCase.execute()
      expect(stats.totalFiles).toBe(180)
      expect(stats.totalBytes).toBeGreaterThan(1_000_000_000)
      expect(stats.uniqueCameras).toBeGreaterThanOrEqual(2)
      expect(stats.uniqueLenses).toBeGreaterThanOrEqual(3)
      expect(stats.sweetSpotFocalLength).toBeDefined()
      expect(stats.heatmap.cells).toHaveLength(364) // 52-week rolling window
      expect(stats.heatmap.totalActiveDays).toBeGreaterThan(20)
      expect(stats.heatmap.currentStreakDays).toBeGreaterThanOrEqual(4)
      expect(stats.insights.length).toBeGreaterThanOrEqual(3)

      const filterOptions = dashboardUseCase.getFilterOptions()
      expect(filterOptions.years).toContain(2026)
      expect(filterOptions.cameras).toContain('ILCE-7M4')
      expect(filterOptions.lenses).toContain('FE 35mm F1.4 GM')

      // deleteAll removes all imported_files and import_jobs rows and returns deleted counts
      expect(fileRepo.deleteAll()).toBe(180)
      expect(jobRepo.deleteAll()).toBe(1)
      expect(fileRepo.countAll()).toBe(0)
      expect(jobRepo.findRecentJobs()).toHaveLength(0)
    })
  })
})
