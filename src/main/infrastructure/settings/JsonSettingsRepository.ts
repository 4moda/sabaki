import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AppSettings } from '@core/domain/models'
import type { ISettingsRepository } from '@core/domain/ports'

/**
 * Builds the default application preferences for the given user home directory.
 * This is the single source of truth for defaults; the Renderer obtains them via IPC.
 */
export function createDefaultAppSettings(homeDir: string): AppSettings {
  return {
    defaultDestRoot: join(homeDir, 'Pictures', 'Sabaki'),
    pathTemplate: '{YYYY}/{YYYY-MM-DD}/{Ext}',
    conflictPolicy: {
      skipHistoryDuplicates: true,
      fileConflictMode: 'skip_same_hash_rename_diff'
    },
    minimizeToTray: true,
    enableOsNotifications: true,
    autoOpenDigestModal: true,
    fastHashMode: true,
    theme: 'dark'
  }
}

/**
 * Default application preferences for Sabaki on the current OS user.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = createDefaultAppSettings(homedir())

/**
 * JSON file (or in-memory) implementation of `ISettingsRepository`.
 */
export class JsonSettingsRepository implements ISettingsRepository {
  private cachedSettings: AppSettings
  private readonly defaultSettings: AppSettings

  constructor(
    private readonly filePath?: string,
    initialOverrides?: Partial<AppSettings>
  ) {
    this.defaultSettings = this.mergeSettings(
      DEFAULT_APP_SETTINGS,
      initialOverrides
    )
    this.cachedSettings = this.cloneSettings(this.defaultSettings)

    if (this.isFileBacked()) {
      this.cachedSettings = this.loadFromFile()
    }
  }

  public getSettings(): AppSettings {
    if (this.isFileBacked()) {
      this.cachedSettings = this.loadFromFile()
    }
    return this.cloneSettings(this.cachedSettings)
  }

  public saveSettings(patch: Partial<AppSettings>): AppSettings {
    const current = this.getSettings()
    return this.persist(this.mergeSettings(current, patch))
  }

  public resetSettings(): AppSettings {
    return this.persist(this.cloneSettings(this.defaultSettings))
  }

  private persist(settings: AppSettings): AppSettings {
    this.cachedSettings = settings

    if (this.isFileBacked() && this.filePath) {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf-8')
    }

    return this.cloneSettings(settings)
  }

  private isFileBacked(): boolean {
    return Boolean(this.filePath && this.filePath !== ':memory:')
  }

  private loadFromFile(): AppSettings {
    if (!this.filePath || !existsSync(this.filePath)) {
      return this.cloneSettings(this.cachedSettings)
    }

    try {
      const content = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(content) as Partial<AppSettings>
      return this.mergeSettings(this.cachedSettings, parsed)
    } catch {
      return this.cloneSettings(this.cachedSettings)
    }
  }

  private mergeSettings(
    base: AppSettings,
    patch?: Partial<AppSettings>
  ): AppSettings {
    if (!patch) {
      return this.cloneSettings(base)
    }

    return {
      ...base,
      ...patch,
      conflictPolicy: {
        ...base.conflictPolicy,
        ...(patch.conflictPolicy ?? {})
      }
    }
  }

  private cloneSettings(settings: AppSettings): AppSettings {
    return {
      ...settings,
      conflictPolicy: {
        ...settings.conflictPolicy
      }
    }
  }
}
