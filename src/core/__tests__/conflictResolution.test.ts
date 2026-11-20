import { describe, expect, it } from 'vitest'
import type { ConflictPolicyConfig } from '@core/domain/models'
import {
  generateUniqueRenamedPath,
  resolveFileImportAction
} from '@core/domain/services'

describe('ConflictResolutionService', () => {
  describe('generateUniqueRenamedPath', () => {
    it('appends _1 before the extension on POSIX paths', () => {
      const result = generateUniqueRenamedPath(
        '/2026/2026-11-19/ARW/DSC0001.ARW',
        () => false
      )
      expect(result).toBe('/2026/2026-11-19/ARW/DSC0001_1.ARW')
    })

    it('increments suffix until an unused candidate path is found', () => {
      const existing = new Set([
        '/2026/2026-11-19/ARW/DSC0001.ARW',
        '/2026/2026-11-19/ARW/DSC0001_1.ARW',
        '/2026/2026-11-19/ARW/DSC0001_2.ARW'
      ])
      const result = generateUniqueRenamedPath(
        '/2026/2026-11-19/ARW/DSC0001.ARW',
        (candidate) => existing.has(candidate)
      )
      expect(result).toBe('/2026/2026-11-19/ARW/DSC0001_3.ARW')
    })

    it('preserves Windows separators and handles files without extension or dotted directories', () => {
      expect(
        generateUniqueRenamedPath('D:\\Photos\\v1.0\\DSC0001.JPG', () => false)
      ).toBe('D:\\Photos\\v1.0\\DSC0001_1.JPG')

      expect(
        generateUniqueRenamedPath('/photos/v1.0/README', () => false)
      ).toBe('/photos/v1.0/README_1')

      expect(
        generateUniqueRenamedPath('/photos/.hidden', () => false)
      ).toBe('/photos/.hidden_1')
    })
  })

  describe('resolveFileImportAction', () => {
    const targetPath = '/2026/2026-11-19/ARW/DSC0001.ARW'
    const sourceHash = 'abc123def456'

    it('skips as duplicate when skipHistoryDuplicates is enabled and hash exists in history', () => {
      const policy: ConflictPolicyConfig = {
        skipHistoryDuplicates: true,
        fileConflictMode: 'overwrite'
      }
      const result = resolveFileImportAction({
        targetPath,
        sourceHash,
        policy,
        isHashInHistory: true,
        destFileExists: false
      })
      expect(result.action).toBe('skip_duplicate')
      expect(result.finalDestPath).toBe(targetPath)
    })

    it('copies when destination does not exist and hash is not skipped by history', () => {
      const policy: ConflictPolicyConfig = {
        skipHistoryDuplicates: false,
        fileConflictMode: 'skip_same_hash_rename_diff'
      }
      const result = resolveFileImportAction({
        targetPath,
        sourceHash,
        policy,
        isHashInHistory: true,
        destFileExists: false
      })
      expect(result.action).toBe('copy')
      expect(result.finalDestPath).toBe(targetPath)
    })

    it('handles "skip" conflict mode when destination file exists', () => {
      const result = resolveFileImportAction({
        targetPath,
        sourceHash,
        policy: { skipHistoryDuplicates: true, fileConflictMode: 'skip' },
        isHashInHistory: false,
        destFileExists: true
      })
      expect(result.action).toBe('skip_existing')
      expect(result.finalDestPath).toBe(targetPath)
    })

    it('handles "overwrite" conflict mode when destination file exists', () => {
      const result = resolveFileImportAction({
        targetPath,
        sourceHash,
        policy: { skipHistoryDuplicates: true, fileConflictMode: 'overwrite' },
        isHashInHistory: false,
        destFileExists: true
      })
      expect(result.action).toBe('overwrite')
      expect(result.finalDestPath).toBe(targetPath)
    })

    it('handles "rename" conflict mode using pathExistsCheck', () => {
      const occupied = new Set([
        targetPath,
        '/2026/2026-11-19/ARW/DSC0001_1.ARW'
      ])
      const result = resolveFileImportAction({
        targetPath,
        sourceHash,
        policy: { skipHistoryDuplicates: true, fileConflictMode: 'rename' },
        isHashInHistory: false,
        destFileExists: true,
        pathExistsCheck: (candidate) => occupied.has(candidate)
      })
      expect(result.action).toBe('rename')
      expect(result.finalDestPath).toBe('/2026/2026-11-19/ARW/DSC0001_2.ARW')
    })

    it('skips in "skip_same_hash_rename_diff" mode when existing destination hash matches (case-insensitive)', () => {
      const result = resolveFileImportAction({
        targetPath,
        sourceHash: 'ABC123DEF456',
        policy: {
          skipHistoryDuplicates: true,
          fileConflictMode: 'skip_same_hash_rename_diff'
        },
        isHashInHistory: false,
        destFileExists: true,
        existingDestHash: 'abc123def456'
      })
      expect(result.action).toBe('skip_duplicate')
      expect(result.finalDestPath).toBe(targetPath)
    })

    it('renames in "skip_same_hash_rename_diff" mode when existing destination hash differs or is missing', () => {
      const diffHashResult = resolveFileImportAction({
        targetPath,
        sourceHash,
        policy: {
          skipHistoryDuplicates: true,
          fileConflictMode: 'skip_same_hash_rename_diff'
        },
        isHashInHistory: false,
        destFileExists: true,
        existingDestHash: 'different_hash_999'
      })
      expect(diffHashResult.action).toBe('rename')
      expect(diffHashResult.finalDestPath).toBe('/2026/2026-11-19/ARW/DSC0001_1.ARW')

      const missingHashResult = resolveFileImportAction({
        targetPath,
        sourceHash,
        policy: {
          skipHistoryDuplicates: true,
          fileConflictMode: 'skip_same_hash_rename_diff'
        },
        isHashInHistory: false,
        destFileExists: true
      })
      expect(missingHashResult.action).toBe('rename')
      expect(missingHashResult.finalDestPath).toBe('/2026/2026-11-19/ARW/DSC0001_1.ARW')
    })
  })
})
