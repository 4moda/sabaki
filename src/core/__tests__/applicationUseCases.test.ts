import { describe, expect, it } from 'vitest'
import type {
  DashboardFilter,
  DashboardStatsResult,
  ExifMetadata,
  ImportJobRecord,
  ImportProgressEvent,
  MediaFileRecord,
  SessionDigest
} from '@core/domain/models'
import type {
  DistinctFilterOptions,
  IAnalyticsQueryService,
  IExifParserGateway,
  IFileRepository,
  IFileSystemGateway,
  IJobRepository,
  INotificationGateway,
  MediaFileQueryFilter,
  ScannedFileEntry
} from '@core/domain/ports'
import {
  ClearAllDataUseCase,
  ExecuteImportJobUseCase,
  ExportPublicWebJsonUseCase,
  GetDashboardStatsUseCase,
  PreviewTargetPathUseCase,
  ScanSourceDirectoryUseCase,
  SeedDemoDataUseCase
} from '@core/application/usecases'

// ---------------------------------------------------------------------------
// In-Memory Port Mocks
// ---------------------------------------------------------------------------

class InMemoryFileRepository implements IFileRepository {
  private nextId = 1
  public files: MediaFileRecord[] = []

  existsByHash(hash: string): boolean {
    return this.files.some((f) => f.fileHash === hash)
  }

  findById(id: number): MediaFileRecord | null {
    return this.files.find((f) => f.id === id) ?? null
  }

  save(file: MediaFileRecord): MediaFileRecord {
    const saved: MediaFileRecord = { ...file, id: file.id ?? this.nextId++ }
    this.files.push(saved)
    return saved
  }

  saveBatch(files: MediaFileRecord[]): void {
    for (const file of files) {
      this.save(file)
    }
  }

  findRecent(filter?: MediaFileQueryFilter): MediaFileRecord[] {
    let result = [...this.files]
    if (filter?.favoriteOnly) {
      result = result.filter((f) => f.favorite)
    }
    if (filter?.cameraModel) {
      result = result.filter((f) => f.exif.cameraModel === filter.cameraModel)
    }
    if (filter?.lensModel) {
      result = result.filter((f) => f.exif.lensModel === filter.lensModel)
    }
    if (filter?.specificDay) {
      result = result.filter((f) => f.capturedDay === filter.specificDay)
    }
    const offset = filter?.offset ?? 0
    const limit = filter?.limit ?? result.length
    return result.slice(offset, offset + limit)
  }

  toggleFavorite(id: number): boolean {
    const file = this.files.find((f) => f.id === id)
    if (!file) return false
    file.favorite = !file.favorite
    return file.favorite
  }

  countAll(): number {
    return this.files.length
  }

  deleteAll(): number {
    const count = this.files.length
    this.files = []
    return count
  }
}

class InMemoryJobRepository implements IJobRepository {
  private nextId = 1
  public jobs: ImportJobRecord[] = []

  createJob(job: Omit<ImportJobRecord, 'id'>): ImportJobRecord {
    const created: ImportJobRecord = { ...job, id: this.nextId++ }
    this.jobs.push(created)
    return created
  }

  updateJob(id: number, patch: Partial<ImportJobRecord>): void {
    const idx = this.jobs.findIndex((j) => j.id === id)
    if (idx >= 0) {
      this.jobs[idx] = { ...this.jobs[idx], ...patch }
    }
  }

  findRecentJobs(limit = 20): ImportJobRecord[] {
    return this.jobs.slice(-limit).reverse()
  }

  findById(id: number): ImportJobRecord | null {
    return this.jobs.find((j) => j.id === id) ?? null
  }

  deleteAll(): number {
    const count = this.jobs.length
    this.jobs = []
    return count
  }
}

class InMemoryFileSystemGateway implements IFileSystemGateway {
  public scannedEntries: ScannedFileEntry[] = []
  public existingFiles = new Map<string, string>() // path -> hash
  public copiedFiles: Array<{ sourcePath: string; destPath: string }> = []
  public writtenTextFiles = new Map<string, string>()
  public fileHashes = new Map<string, string>()

  async scanDirectory(_sourceRoot: string): Promise<ScannedFileEntry[]> {
    return [...this.scannedEntries]
  }

  async computeFileHash(filePath: string): Promise<string> {
    if (this.fileHashes.has(filePath)) {
      return this.fileHashes.get(filePath)!
    }
    if (this.existingFiles.has(filePath)) {
      return this.existingFiles.get(filePath)!
    }
    return `hash:${filePath}`
  }

  async fileExists(filePath: string): Promise<boolean> {
    return this.existingFiles.has(filePath)
  }

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    this.copiedFiles.push({ sourcePath, destPath })
    const hash = await this.computeFileHash(sourcePath)
    this.existingFiles.set(destPath, hash)
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    this.writtenTextFiles.set(filePath, content)
  }
}

class InMemoryExifParserGateway implements IExifParserGateway {
  public exifByPath = new Map<string, ExifMetadata>()

  async parseExif(filePath: string, fallbackDate: Date): Promise<ExifMetadata> {
    const preset = this.exifByPath.get(filePath)
    if (preset) {
      return preset
    }
    return {
      capturedAt: fallbackDate.toISOString(),
      cameraMake: 'SONY',
      cameraModel: 'ILCE-7M4',
      lensModel: 'FE 35mm F1.4 GM',
      focalLength: 35,
      fNumber: 1.4,
      iso: 200,
      exposureTime: 1 / 500
    }
  }
}

class InMemoryNotificationGateway implements INotificationGateway {
  public sentDigests: SessionDigest[] = []

  notifyImportComplete(digest: SessionDigest): void {
    this.sentDigests.push(digest)
  }
}

class InMemoryAnalyticsQueryService implements IAnalyticsQueryService {
  public lastFilter?: DashboardFilter

  queryDashboardStats(filter?: DashboardFilter): DashboardStatsResult {
    this.lastFilter = filter
    return {
      totalFiles: 120,
      totalBytes: 3_600_000_000,
      uniqueCameras: 2,
      uniqueLenses: 3,
      sweetSpotFocalLength: '35mm',
      cameras: [{ name: 'ILCE-7M4', count: 90, percentage: 75, totalBytes: 2_700_000_000 }],
      lenses: [{ name: 'FE 35mm F1.4 GM', count: 80, percentage: 66.7, totalBytes: 2_400_000_000 }],
      focalLengthHistogram: [{ label: '35mm', minMm: 35, maxMm: 35, count: 80, percentage: 66.7 }],
      apertureDistribution: [{ label: 'F1.4–F2.0', count: 70, percentage: 58.3 }],
      isoDistribution: [{ label: 'ISO 100–400', count: 95, percentage: 79.2 }],
      monthlyTrends: [
        { month: '2026-11', rawCount: 80, jpegCount: 30, videoCount: 10, totalCount: 120 }
      ],
      heatmap: {
        year: 2026,
        cells: [],
        totalActiveDays: 18,
        longestStreakDays: 5,
        currentStreakDays: 3,
        maxDailyShots: { date: '2026-11-19', count: 42 }
      },
      insights: ['35mm単焦点が最も活躍しています。']
    }
  }

  getDistinctFilterOptions(): DistinctFilterOptions {
    return {
      years: [2026, 2025],
      cameras: ['ILCE-7M4', 'EOS R5'],
      lenses: ['FE 35mm F1.4 GM', 'RF 28-70mm F2L']
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Application Layer UseCases', () => {
  it('PreviewTargetPathUseCase generates realtime previews and returns presets', () => {
    const useCase = new PreviewTargetPathUseCase()
    const result = useCase.execute({
      destRoot: '/Volumes/Photos',
      template: '{YYYY}/{YYYY-MM-DD}/{Ext}',
      sampleDate: new Date(2026, 10, 19, 17, 0, 0)
    })

    expect(result.presets).toHaveLength(5)
    expect(result.previews).toEqual([
      { label: 'RAW', ext: 'ARW', fullPath: '/Volumes/Photos/2026/2026-11-19/ARW/DSC0001.ARW' },
      { label: 'JPEG', ext: 'JPG', fullPath: '/Volumes/Photos/2026/2026-11-19/JPG/DSC0001.JPG' },
      { label: 'VIDEO', ext: 'MP4', fullPath: '/Volumes/Photos/2026/2026-11-19/MP4/C0001.MP4' }
    ])
  })

  it('ScanSourceDirectoryUseCase aggregates counts, total bytes, breakdowns, and sample files', async () => {
    const fs = new InMemoryFileSystemGateway()
    fs.scannedEntries = [
      {
        path: '/SD/DCIM/DSC0001.ARW',
        name: 'DSC0001.ARW',
        ext: '.arw',
        size: 35_000_000,
        mtime: new Date('2026-11-19T17:00:00Z')
      },
      {
        path: '/SD/DCIM/DSC0001.JPG',
        name: 'DSC0001.JPG',
        ext: 'jpg',
        size: 8_000_000,
        mtime: new Date('2026-11-19T17:00:00Z')
      },
      {
        path: '/SD/CLIP/C0001.MP4',
        name: 'C0001.MP4',
        ext: 'MP4',
        size: 120_000_000,
        mtime: new Date('2026-11-19T17:05:00Z')
      }
    ]

    const useCase = new ScanSourceDirectoryUseCase(fs)
    const preview = await useCase.execute('/SD')

    expect(preview.totalFiles).toBe(3)
    expect(preview.totalBytes).toBe(163_000_000)
    expect(preview.rawCount).toBe(1)
    expect(preview.jpegCount).toBe(1)
    expect(preview.videoCount).toBe(1)
    expect(preview.mediaTypeBreakdown).toEqual({ RAW: 1, JPEG: 1, VIDEO: 1 })
    expect(preview.extBreakdown).toEqual({ ARW: 1, JPG: 1, MP4: 1 })
    expect(preview.sampleFiles).toHaveLength(3)
    expect(preview.sampleFiles[0].relativeSourcePath).toBe('DCIM/DSC0001.ARW')
  })

  it('ExecuteImportJobUseCase orchestrates copy, duplicate skip, rename on conflict, DB save, digest, and notification', async () => {
    const fs = new InMemoryFileSystemGateway()
    const exif = new InMemoryExifParserGateway()
    const fileRepo = new InMemoryFileRepository()
    const jobRepo = new InMemoryJobRepository()
    const notifications = new InMemoryNotificationGateway()

    // Pre-seed history with one previously imported file hash
    fileRepo.save({
      fileHash: 'hash-already-in-db',
      originalName: 'OLD0001.ARW',
      sourcePath: '/OLD_SD/OLD0001.ARW',
      destPath: '/Photos/2026/2026-11-18/ARW/OLD0001.ARW',
      fileSize: 30_000_000,
      mediaType: 'RAW',
      ext: 'ARW',
      capturedAt: '2026-11-18T12:00:00',
      capturedYear: 2026,
      capturedMonth: '2026-11',
      capturedDay: '2026-11-18',
      capturedHour: 12,
      exif: {
        capturedAt: '2026-11-18T12:00:00',
        cameraModel: 'ILCE-7M4',
        lensModel: 'FE 35mm F1.4 GM'
      },
      favorite: false,
      webPublic: false
    })

    // Pre-seed destination disk with an existing conflicting file (different hash) and _1
    fs.existingFiles.set('/Photos/2026/2026-11-19/ARW/CONFLICT.ARW', 'hash-existing-different')
    fs.existingFiles.set('/Photos/2026/2026-11-19/ARW/CONFLICT_1.ARW', 'hash-existing-suffix-1')
    // Pre-seed destination disk with an identical file (same hash)
    fs.existingFiles.set('/Photos/2026/2026-11-19/JPG/SAME_ON_DISK.JPG', 'hash-same-on-disk')

    fs.scannedEntries = [
      {
        path: '/SD/NEW001.ARW',
        name: 'NEW001.ARW',
        ext: 'ARW',
        size: 32_000_000,
        mtime: new Date('2026-11-19T17:15:00')
      },
      {
        path: '/SD/DUP_HISTORY.ARW',
        name: 'DUP_HISTORY.ARW',
        ext: 'ARW',
        size: 30_000_000,
        mtime: new Date('2026-11-19T17:20:00')
      },
      {
        path: '/SD/CONFLICT.ARW',
        name: 'CONFLICT.ARW',
        ext: 'ARW',
        size: 34_000_000,
        mtime: new Date('2026-11-19T17:25:00')
      },
      {
        path: '/SD/SAME_ON_DISK.JPG',
        name: 'SAME_ON_DISK.JPG',
        ext: 'JPG',
        size: 9_000_000,
        mtime: new Date('2026-11-19T17:30:00')
      }
    ]

    fs.fileHashes.set('/SD/NEW001.ARW', 'hash-new-001')
    fs.fileHashes.set('/SD/DUP_HISTORY.ARW', 'hash-already-in-db')
    fs.fileHashes.set('/SD/CONFLICT.ARW', 'hash-conflict-new-content')
    fs.fileHashes.set('/SD/SAME_ON_DISK.JPG', 'hash-same-on-disk')

    for (const entry of fs.scannedEntries) {
      exif.exifByPath.set(entry.path, {
        capturedAt: '2026-11-19T17:20:00',
        cameraMake: 'SONY',
        cameraModel: 'ILCE-7M4',
        lensModel: 'FE 35mm F1.4 GM',
        focalLength: 35,
        fNumber: 1.4,
        iso: 200,
        exposureTime: 1 / 500
      })
    }

    const progressEvents: ImportProgressEvent[] = []
    const useCase = new ExecuteImportJobUseCase({
      fileSystem: fs,
      exifParser: exif,
      fileRepository: fileRepo,
      jobRepository: jobRepo,
      notificationGateway: notifications
    })

    const result = await useCase.execute({
      sourceDir: '/SD',
      destRoot: '/Photos',
      pathTemplate: '{YYYY}/{YYYY-MM-DD}/{Ext}',
      conflictPolicy: {
        skipHistoryDuplicates: true,
        fileConflictMode: 'skip_same_hash_rename_diff'
      },
      onProgress: (ev) => progressEvents.push(ev)
    })

    // Verify job counters and persisted job record
    expect(result.job.status).toBe('completed')
    expect(result.job.totalFiles).toBe(4)
    expect(result.job.copiedFiles).toBe(1)
    expect(result.job.renamedFiles).toBe(1)
    expect(result.job.skippedFiles).toBe(2)
    expect(result.job.overwrittenFiles).toBe(0)
    expect(result.job.errorFiles).toBe(0)
    expect(result.job.totalBytes).toBe(66_000_000)
    expect(result.job.completedAt).toBeDefined()
    expect(result.job.digestJson).toBeDefined()

    // Verify exact file copy destinations (including skipping pre-existing _1 to _2)
    expect(fs.copiedFiles).toEqual([
      {
        sourcePath: '/SD/NEW001.ARW',
        destPath: '/Photos/2026/2026-11-19/ARW/NEW001.ARW'
      },
      {
        sourcePath: '/SD/CONFLICT.ARW',
        destPath: '/Photos/2026/2026-11-19/ARW/CONFLICT_2.ARW'
      }
    ])

    // Verify repository saved 2 newly imported files (plus 1 pre-seeded = 3 total)
    expect(fileRepo.countAll()).toBe(3)
    const renamedRecord = fileRepo.files.find((f) => f.fileHash === 'hash-conflict-new-content')
    expect(renamedRecord?.destPath).toBe('/Photos/2026/2026-11-19/ARW/CONFLICT_2.ARW')
    expect(renamedRecord?.snsCaption).toContain('#Sabaki')

    // Verify digest & notification
    expect(result.digest.topCamera?.model).toBe('ILCE-7M4')
    expect(result.digest.topLens?.model).toBe('FE 35mm F1.4 GM')
    expect(result.digest.styleTags.map((t) => t.id)).toContain('golden_hour')
    expect(notifications.sentDigests).toHaveLength(1)
    expect(notifications.sentDigests[0].headlineSummary).toBe(result.digest.headlineSummary)

    // Verify progress lifecycle phases
    const phases = progressEvents.map((e) => e.phase)
    expect(phases[0]).toBe('scanning')
    expect(phases).toContain('copying')
    expect(phases).toContain('analyzing')
    expect(phases[phases.length - 1]).toBe('completed')
  })

  it('GetDashboardStatsUseCase delegates analytics queries and filter options', () => {
    const analytics = new InMemoryAnalyticsQueryService()
    const useCase = new GetDashboardStatsUseCase(analytics)

    const stats = useCase.execute({ year: 2026, cameraModel: 'ILCE-7M4' })
    expect(analytics.lastFilter).toEqual({ year: 2026, cameraModel: 'ILCE-7M4' })
    expect(stats.totalFiles).toBe(120)

    const options = useCase.getFilterOptions()
    expect(options.years).toEqual([2026, 2025])
    expect(options.cameras).toContain('ILCE-7M4')
  })

  it('ExportPublicWebJsonUseCase strips private paths and writes stats-public.json', async () => {
    const analytics = new InMemoryAnalyticsQueryService()
    const fileRepo = new InMemoryFileRepository()
    const fs = new InMemoryFileSystemGateway()

    fileRepo.save({
      fileHash: 'pub-1',
      originalName: 'PUBLIC.ARW',
      sourcePath: 'E:\\PrivateSD\\PUBLIC.ARW',
      destPath: 'D:\\PrivatePhotos\\PUBLIC.ARW',
      fileSize: 30_000_000,
      mediaType: 'RAW',
      ext: 'ARW',
      capturedAt: '2026-11-19T17:00:00',
      capturedYear: 2026,
      capturedMonth: '2026-11',
      capturedDay: '2026-11-19',
      capturedHour: 17,
      exif: {
        capturedAt: '2026-11-19T17:00:00',
        cameraModel: 'ILCE-7M4',
        lensModel: 'FE 35mm F1.4 GM',
        rawMetaJson: '{"secretSerial":"12345"}'
      },
      favorite: true,
      webPublic: true
    })

    fileRepo.save({
      fileHash: 'priv-1',
      originalName: 'PRIVATE.ARW',
      sourcePath: 'E:\\PrivateSD\\PRIVATE.ARW',
      destPath: 'D:\\PrivatePhotos\\PRIVATE.ARW',
      fileSize: 30_000_000,
      mediaType: 'RAW',
      ext: 'ARW',
      capturedAt: '2026-11-19T18:00:00',
      capturedYear: 2026,
      capturedMonth: '2026-11',
      capturedDay: '2026-11-19',
      capturedHour: 18,
      exif: {
        capturedAt: '2026-11-19T18:00:00',
        cameraModel: 'ILCE-7M4',
        lensModel: 'FE 35mm F1.4 GM'
      },
      favorite: false,
      webPublic: false
    })

    const useCase = new ExportPublicWebJsonUseCase({
      analyticsQueryService: analytics,
      fileRepository: fileRepo,
      fileSystem: fs
    })

    const result = await useCase.execute({ outputPath: '/exports/stats-public.json' })

    expect(result.canceled).toBe(false)
    expect(result.outputPath).toBe('/exports/stats-public.json')
    expect(result.exportedFileCount).toBe(1)

    const withoutPath = await useCase.execute({ includePublicFiles: false })
    expect(withoutPath.canceled).toBe(false)
    expect(withoutPath.outputPath).toBeUndefined()
    expect(withoutPath.exportedFileCount).toBe(0)

    const written = fs.writtenTextFiles.get('/exports/stats-public.json')
    expect(written).toBeDefined()
    expect(written).not.toContain('PrivateSD')
    expect(written).not.toContain('PrivatePhotos')
    expect(written).not.toContain('secretSerial')
    expect(written).not.toContain('PRIVATE.ARW')
    expect(written).toContain('PUBLIC.ARW')
  })

  it('SeedDemoDataUseCase seeds realistic 52-week multi-gear records and a completed job with digest', () => {
    const fileRepo = new InMemoryFileRepository()
    const jobRepo = new InMemoryJobRepository()

    const useCase = new SeedDemoDataUseCase({
      fileRepository: fileRepo,
      jobRepository: jobRepo
    })

    const result = useCase.execute({
      shotCount: 160,
      referenceDate: '2026-11-19'
    })

    expect(result.insertedFiles).toBe(160)
    expect(fileRepo.countAll()).toBe(160)
    expect(jobRepo.findRecentJobs()).toHaveLength(1)
    expect(result.job.status).toBe('completed')
    expect(result.job.digestJson).toBeDefined()

    // Verify diversity of cameras, lenses, and dates across multiple months
    const cameras = new Set(fileRepo.files.map((f) => f.exif.cameraModel))
    const lenses = new Set(fileRepo.files.map((f) => f.exif.lensModel))
    const months = new Set(fileRepo.files.map((f) => f.capturedMonth))

    expect(cameras.size).toBeGreaterThanOrEqual(2)
    expect(lenses.size).toBeGreaterThanOrEqual(3)
    expect(months.size).toBeGreaterThanOrEqual(6)

    // Verify digest summary
    expect(result.digest.totalFiles).toBe(160)
    expect(result.digest.topCamera).toBeDefined()
    expect(result.digest.topLens).toBeDefined()
    expect(result.digest.styleTags.length).toBeGreaterThanOrEqual(1)
    expect(result.digest.snsShareText).toContain('#Sabaki')
  })

  it('ClearAllDataUseCase clears all file & job records and invokes onCleared callback', () => {
    const fileRepo = new InMemoryFileRepository()
    const jobRepo = new InMemoryJobRepository()

    const seedUseCase = new SeedDemoDataUseCase({
      fileRepository: fileRepo,
      jobRepository: jobRepo
    })
    seedUseCase.execute({ shotCount: 25, referenceDate: '2026-11-19' })
    expect(fileRepo.countAll()).toBe(25)
    expect(jobRepo.findRecentJobs()).toHaveLength(1)

    let clearedCallbackInvoked = false
    const clearUseCase = new ClearAllDataUseCase({
      fileRepository: fileRepo,
      jobRepository: jobRepo,
      onCleared: () => {
        clearedCallbackInvoked = true
      }
    })

    const result = clearUseCase.execute()
    expect(result).toEqual({ deletedFiles: 25, deletedJobs: 1 })
    expect(fileRepo.countAll()).toBe(0)
    expect(jobRepo.findRecentJobs()).toHaveLength(0)
    expect(clearedCallbackInvoked).toBe(true)
  })
})
