import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@core/domain/models'
import {
  captureRollbackPatch,
  DEFAULT_APP_SETTINGS,
  resolveSettingsAfterSaveFailure
} from '../useAppSettings'

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

describe('resolveSettingsAfterSaveFailure', () => {
  it('restores the persisted value when overlapping saves (old -> A -> B) both fail', async () => {
    const disk: AppSettings = { ...DEFAULT_APP_SETTINGS, defaultDestRoot: '/old' }
    const api = { getSettings: async () => ({ ...disk }) }

    // Optimistic UI state while both saves are in flight
    let ui: AppSettings = { ...disk }
    const rollbackA = captureRollbackPatch(ui, { defaultDestRoot: '/A' })
    ui = { ...ui, defaultDestRoot: '/A' }
    const rollbackB = captureRollbackPatch(ui, { defaultDestRoot: '/B' })
    ui = { ...ui, defaultDestRoot: '/B' }

    // Failures resolve in order A, then B
    for (const rollback of [rollbackA, rollbackB]) {
      const recovered = await resolveSettingsAfterSaveFailure(api, rollback)
      expect(recovered.confirmed).toBe(true)
      ui = { ...ui, ...recovered.patch }
    }

    expect(ui.defaultDestRoot).toBe('/old')
    // The naive rollback of B alone would have left the never-persisted value on screen
    expect(rollbackB.defaultDestRoot).toBe('/A')
  })

  it('falls back to the captured rollback when re-reading settings also fails', async () => {
    const api = {
      getSettings: async (): Promise<AppSettings> => {
        throw new Error('ipc down')
      }
    }
    const recovered = await resolveSettingsAfterSaveFailure(api, { minimizeToTray: true })
    expect(recovered).toEqual({ patch: { minimizeToTray: true }, confirmed: false })
  })

  it('falls back to the rollback when no API is available', async () => {
    const recovered = await resolveSettingsAfterSaveFailure(undefined, { fastHashMode: false })
    expect(recovered).toEqual({ patch: { fastHashMode: false }, confirmed: false })
  })
})
