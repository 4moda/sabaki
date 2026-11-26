import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultAppSettings,
  DEFAULT_APP_SETTINGS,
  JsonSettingsRepository
} from '@main/infrastructure/settings'

describe('Settings defaults (Main process single source of truth)', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'sabaki-settings-defaults-'))
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('derives the default destination root from the OS user home Pictures folder', () => {
    const defaults = createDefaultAppSettings(join('/home', 'alice'))
    expect(defaults.defaultDestRoot).toBe(join('/home', 'alice', 'Pictures', 'Sabaki'))
    expect(defaults.minimizeToTray).toBe(true)
    expect(defaults.conflictPolicy.fileConflictMode).toBe('skip_same_hash_rename_diff')
  })

  it('uses the current user home for DEFAULT_APP_SETTINGS (never a hard-coded drive)', () => {
    expect(DEFAULT_APP_SETTINGS.defaultDestRoot).toBe(join(homedir(), 'Pictures', 'Sabaki'))
    expect(DEFAULT_APP_SETTINGS.defaultDestRoot).not.toBe('D:/Photos')
  })

  it('resetSettings restores and persists defaults after user changes', () => {
    const settingsFile = join(tempRoot, 'settings.json')
    const repo = new JsonSettingsRepository(settingsFile)
    repo.saveSettings({
      defaultSourceDir: 'E:/DCIM',
      defaultDestRoot: 'D:/Photos',
      minimizeToTray: false,
      pathTemplate: '{YYYY}/{Ext}',
      conflictPolicy: { skipHistoryDuplicates: false, fileConflictMode: 'overwrite' }
    })

    const restored = repo.resetSettings()
    expect(restored).toEqual(DEFAULT_APP_SETTINGS)
    expect(restored.defaultSourceDir).toBeUndefined()

    const persisted = JSON.parse(readFileSync(settingsFile, 'utf-8')) as Record<string, unknown>
    expect(persisted.defaultDestRoot).toBe(DEFAULT_APP_SETTINGS.defaultDestRoot)
    expect(persisted.minimizeToTray).toBe(true)
    expect(persisted).not.toHaveProperty('defaultSourceDir')

    const reloaded = new JsonSettingsRepository(settingsFile).getSettings()
    expect(reloaded).toEqual(DEFAULT_APP_SETTINGS)
  })

  it('resetSettings honours constructor overrides as the baseline defaults', () => {
    const repo = new JsonSettingsRepository(':memory:', { defaultDestRoot: '/mnt/library' })
    repo.saveSettings({ defaultDestRoot: '/tmp/other', fastHashMode: false })

    const restored = repo.resetSettings()
    expect(restored.defaultDestRoot).toBe('/mnt/library')
    expect(restored.fastHashMode).toBe(true)
  })
})
