import { describe, expect, it } from 'vitest'
import { captureRollbackPatch, DEFAULT_APP_SETTINGS } from '../useAppSettings'

describe('captureRollbackPatch', () => {
  it('captures only the current values of the patched keys', () => {
    const current = { ...DEFAULT_APP_SETTINGS, minimizeToTray: true, defaultDestRoot: '/pics' }
    const rollback = captureRollbackPatch(current, {
      minimizeToTray: false,
      defaultDestRoot: '/other'
    })
    expect(rollback).toEqual({ minimizeToTray: true, defaultDestRoot: '/pics' })
  })

  it('keeps nested conflictPolicy as the previous object and records missing optional keys', () => {
    const current = { ...DEFAULT_APP_SETTINGS, defaultSourceDir: undefined }
    const rollback = captureRollbackPatch(current, {
      conflictPolicy: { skipHistoryDuplicates: false, fileConflictMode: 'overwrite' },
      defaultSourceDir: 'E:/DCIM'
    })
    expect(rollback.conflictPolicy).toEqual(DEFAULT_APP_SETTINGS.conflictPolicy)
    expect(rollback).toHaveProperty('defaultSourceDir', undefined)
  })

  it('returns an empty patch for an empty update', () => {
    expect(captureRollbackPatch(DEFAULT_APP_SETTINGS, {})).toEqual({})
  })
})
