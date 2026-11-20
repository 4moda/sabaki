import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionDigest } from '@core/domain/models'
import type { INotificationGateway } from '@core/domain/ports'
import {
  ExecuteImportJobUseCase,
  GetDashboardStatsUseCase
} from '@core/application/usecases'
import {
  SqliteAnalyticsQueryService,
  SqliteConnection,
  SqliteFileRepository,
  SqliteJobRepository
} from '@main/infrastructure/database'
import {
  ExifrParserGateway,
  formatShutterSpeedLabel,
  NodeFileSystemGateway
} from '@main/infrastructure/filesystem'
import {
  DEFAULT_APP_SETTINGS,
  JsonSettingsRepository
} from '@main/infrastructure/settings'

class TestNotificationGateway implements INotificationGateway {
  public digests: SessionDigest[] = []
  public notifyImportComplete(digest: SessionDigest): void {
    this.digests.push(digest)
  }
}

describe('Infrastructure Layer Part 2: FileSystem, Exif, Settings & End-to-End Import', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'sabaki-fs-test-'))
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  describe('NodeFileSystemGateway', () => {
    it('recursively scans supported media extensions and ignores hidden/unsupported files', async () => {
      const fsGateway = new NodeFileSystemGateway()
      const sdRoot = join(tempRoot, 'SD_CARD')

      await fsGateway.writeTextFile(join(sdRoot, 'DCIM', '100MSDCF', 'DSC0001.ARW'), 'raw-data-1')
      await fsGateway.writeTextFile(join(sdRoot, 'DCIM', '100MSDCF', 'DSC0002.jpg'), 'jpeg-data-2')
      await fsGateway.writeTextFile(join(sdRoot, 'PRIVATE', 'M4ROOT', 'CLIP', 'C0001.MP4'), 'video-data-1')
      // Ignored files: hidden dot-file and unsupported .txt
      await fsGateway.writeTextFile(join(sdRoot, 'DCIM', '.DS_Store'), 'apple-meta')
      await fsGateway.writeTextFile(join(sdRoot, 'DCIM', 'README.TXT'), 'notes')

      const entries = await fsGateway.scanDirectory(sdRoot)
      expect(entries).toHaveLength(3)
      expect(entries.map((e) => e.name).sort()).toEqual([
        'C0001.MP4',
        'DSC0001.ARW',
        'DSC0002.jpg'
      ])
      expect(entries.map((e) => e.ext).sort()).toEqual(['ARW', 'JPG', 'MP4'])
    })

    it('computes full SHA-256 and fast sampled (>256KB) SHA-256 hashes accurately', async () => {
      const fsGateway = new NodeFileSystemGateway()
      const smallFile = join(tempRoot, 'small.arw')
      writeFileSync(smallFile, 'sabaki-small-content', 'utf-8')

      const fullSmallHash = await fsGateway.computeFileHash(smallFile, false)
      const fastSmallHash = await fsGateway.computeFileHash(smallFile, true)
      expect(fullSmallHash).toHaveLength(64)
      // Under 256KB, fastMode falls back to full stream hash
      expect(fastSmallHash).toBe(fullSmallHash)

      // Create two 400KB files differing in the middle 64KB window
      const size = 400 * 1024
      const bufA = Buffer.alloc(size, 0x41)
      const bufB = Buffer.alloc(size, 0x41)
      bufB[Math.floor(size / 2)] = 0x5a // Modify middle byte

      const largeFileA = join(tempRoot, 'largeA.arw')
      const largeFileB = join(tempRoot, 'largeB.arw')
      writeFileSync(largeFileA, bufA)
      writeFileSync(largeFileB, bufB)

      const fastHashA1 = await fsGateway.computeFileHash(largeFileA, true)
      const fastHashA2 = await fsGateway.computeFileHash(largeFileA, true)
      const fastHashB = await fsGateway.computeFileHash(largeFileB, true)
      const fullHashA = await fsGateway.computeFileHash(largeFileA, false)

      expect(fastHashA1).toHaveLength(64)
      expect(fastHashA1).toBe(fastHashA2)
      expect(fastHashA1).not.toBe(fastHashB)
      expect(fastHashA1).not.toBe(fullHashA)

      // Verify dynamic fastHashMode getter reflects runtime preference changes
      let dynamicFastMode = true
      const dynamicFsGateway = new NodeFileSystemGateway(() => dynamicFastMode)
      expect(await dynamicFsGateway.computeFileHash(largeFileA)).toBe(fastHashA1)
      dynamicFastMode = false
      expect(await dynamicFsGateway.computeFileHash(largeFileA)).toBe(fullHashA)
    })

    it('creates parent directories, copies files, and verifies existence', async () => {
      const fsGateway = new NodeFileSystemGateway()
      const srcFile = join(tempRoot, 'source', 'DSC0010.ARW')
      const destFile = join(tempRoot, 'dest', '2026', '2026-11-19', 'ARW', 'DSC0010.ARW')

      expect(await fsGateway.fileExists(srcFile)).toBe(false)
      await fsGateway.writeTextFile(srcFile, 'raw-binary-payload')
      expect(await fsGateway.fileExists(srcFile)).toBe(true)

      await fsGateway.copyFile(srcFile, destFile)
      expect(await fsGateway.fileExists(destFile)).toBe(true)

      const srcHash = await fsGateway.computeFileHash(srcFile)
      const destHash = await fsGateway.computeFileHash(destFile)
      expect(destHash).toBe(srcHash)
    })
  })

  describe('ExifrParserGateway', () => {
    it('formats shutter speed labels cleanly and falls back gracefully when Exif is absent', async () => {
      expect(formatShutterSpeedLabel(0.004)).toBe('1/250s')
      expect(formatShutterSpeedLabel(0.00025)).toBe('1/4000s')
      expect(formatShutterSpeedLabel(1.5)).toBe('1.5s')
      expect(formatShutterSpeedLabel(undefined)).toBeUndefined()

      const parser = new ExifrParserGateway()
      const dummyVideo = join(tempRoot, 'C0001.MP4')
      writeFileSync(dummyVideo, 'not-an-exif-header', 'utf-8')

      const fallbackDate = new Date('2026-11-19T17:30:00.000Z')
      const exif = await parser.parseExif(dummyVideo, fallbackDate)

      expect(exif.capturedAt).toBe('2026-11-19T17:30:00.000Z')
      expect(exif.cameraModel).toBe('Unknown Camera')
      expect(exif.lensModel).toBe('Unknown Lens')
    })
  })

  describe('JsonSettingsRepository', () => {
    it('persists and reloads AppSettings JSON with nested conflictPolicy merging', () => {
      const settingsFile = join(tempRoot, 'config', 'settings.json')
      const repo1 = new JsonSettingsRepository(settingsFile)

      const initial = repo1.getSettings()
      expect(initial.pathTemplate).toBe(DEFAULT_APP_SETTINGS.pathTemplate)
      expect(initial.conflictPolicy.fileConflictMode).toBe('skip_same_hash_rename_diff')
      expect(initial.fastHashMode).toBe(true)

      const updated = repo1.saveSettings({
        pathTemplate: '{YYYY}/{MM}/{Ext}',
        minimizeToTray: false,
        fastHashMode: false,
        conflictPolicy: {
          skipHistoryDuplicates: false,
          fileConflictMode: 'rename'
        }
      })

      expect(updated.pathTemplate).toBe('{YYYY}/{MM}/{Ext}')
      expect(updated.minimizeToTray).toBe(false)
      expect(updated.fastHashMode).toBe(false)
      expect(updated.conflictPolicy.fileConflictMode).toBe('rename')

      // Reload from disk in a second repository instance
      const repo2 = new JsonSettingsRepository(settingsFile)
      const reloaded = repo2.getSettings()
      expect(reloaded.pathTemplate).toBe('{YYYY}/{MM}/{Ext}')
      expect(reloaded.minimizeToTray).toBe(false)
      expect(reloaded.fastHashMode).toBe(false)
      expect(reloaded.conflictPolicy.skipHistoryDuplicates).toBe(false)
      expect(reloaded.conflictPolicy.fileConflictMode).toBe('rename')
    })

    it('uses OS-native Pictures/Sabaki default path and restores DEFAULT_APP_SETTINGS on reset', () => {
      const expectedDefaultDest = join(homedir(), 'Pictures', 'Sabaki')
      expect(DEFAULT_APP_SETTINGS.defaultDestRoot).toBe(expectedDefaultDest)
      expect(DEFAULT_APP_SETTINGS.defaultDestRoot).not.toBe('D:/Photos')

      const settingsFile = join(tempRoot, 'config', 'reset-settings.json')
      const repo = new JsonSettingsRepository(settingsFile)

      repo.saveSettings({
        defaultSourceDir: 'E:/DCIM',
        defaultDestRoot: 'D:/Photos',
        pathTemplate: '{YYYY}/{MM}',
        minimizeToTray: false,
        enableOsNotifications: false,
        autoOpenDigestModal: false,
        fastHashMode: false,
        theme: 'light',
        conflictPolicy: {
          skipHistoryDuplicates: false,
          fileConflictMode: 'overwrite'
        }
      })

      const resetResult = repo.resetSettings()
      expect(resetResult).toEqual(DEFAULT_APP_SETTINGS)
      expect(resetResult.defaultDestRoot).toBe(expectedDefaultDest)
      expect(resetResult.defaultSourceDir).toBe('')

      // Also verify direct saveSettings(DEFAULT_APP_SETTINGS) path used by RESET_SETTINGS IPC
      repo.saveSettings({ defaultDestRoot: 'D:/Photos', minimizeToTray: false })
      const ipcResetResult = repo.saveSettings(DEFAULT_APP_SETTINGS)
      expect(ipcResetResult).toEqual(DEFAULT_APP_SETTINGS)
      expect(ipcResetResult.defaultDestRoot).toBe(expectedDefaultDest)

      const reloaded = new JsonSettingsRepository(settingsFile).getSettings()
      expect(reloaded).toEqual(DEFAULT_APP_SETTINGS)
      expect(reloaded.defaultDestRoot).toBe(expectedDefaultDest)
    })
  })

  describe('End-to-End Import Pipeline (ExecuteImportJobUseCase + SQLite + NodeFileSystemGateway)', () => {
    it('scans temp SD directory, resolves conflicts, copies files to disk, persists to SQLite, and queries analytics', async () => {
      const sdDir = join(tempRoot, 'SD')
      const destDir = join(tempRoot, 'Library')

      const fsGateway = new NodeFileSystemGateway()
      const exifParser = new ExifrParserGateway()
      const conn = new SqliteConnection(':memory:')
      const fileRepo = new SqliteFileRepository(conn)
      const jobRepo = new SqliteJobRepository(conn)
      const analyticsService = new SqliteAnalyticsQueryService(conn)
      const notifications = new TestNotificationGateway()

      try {
        // Create 3 media files on the simulated SD card
        await fsGateway.writeTextFile(join(sdDir, 'DCIM', 'DSC0001.ARW'), 'photo-raw-content-1')
        await fsGateway.writeTextFile(join(sdDir, 'DCIM', 'DSC0002.JPG'), 'photo-jpg-content-2')
        await fsGateway.writeTextFile(join(sdDir, 'CLIP', 'C0003.MP4'), 'video-mp4-content-3')

        const importUseCase = new ExecuteImportJobUseCase({
          fileSystem: fsGateway,
          exifParser,
          fileRepository: fileRepo,
          jobRepository: jobRepo,
          notificationGateway: notifications
        })

        // 1st import: all 3 files should be copied and persisted in SQLite
        const firstRun = await importUseCase.execute({
          sourceDir: sdDir,
          destRoot: destDir,
          pathTemplate: '{YYYY}/{Ext}',
          conflictPolicy: {
            skipHistoryDuplicates: true,
            fileConflictMode: 'skip_same_hash_rename_diff'
          }
        })

        expect(firstRun.job.status).toBe('completed')
        expect(firstRun.job.totalFiles).toBe(3)
        expect(firstRun.job.copiedFiles).toBe(3)
        expect(firstRun.job.skippedFiles).toBe(0)
        expect(fileRepo.countAll()).toBe(3)
        expect(notifications.digests).toHaveLength(1)

        // Verify copied files exist on disk
        const savedRecords = fileRepo.findRecent()
        expect(savedRecords).toHaveLength(3)
        for (const rec of savedRecords) {
          expect(await fsGateway.fileExists(rec.destPath)).toBe(true)
        }

        // 2nd import with same files: all 3 should be skipped as history duplicates
        const secondRun = await importUseCase.execute({
          sourceDir: sdDir,
          destRoot: destDir,
          pathTemplate: '{YYYY}/{Ext}',
          conflictPolicy: {
            skipHistoryDuplicates: true,
            fileConflictMode: 'skip_same_hash_rename_diff'
          }
        })

        expect(secondRun.job.copiedFiles).toBe(0)
        expect(secondRun.job.skippedFiles).toBe(3)
        expect(fileRepo.countAll()).toBe(3)

        // Dashboard analytics reflects the imported records
        const dashboardUseCase = new GetDashboardStatsUseCase(analyticsService)
        const stats = dashboardUseCase.execute()
        expect(stats.totalFiles).toBe(3)
        expect(stats.heatmap.totalActiveDays).toBeGreaterThanOrEqual(1)
      } finally {
        conn.close()
      }
    })
  })
})
