import type { AppSettings } from '../models/ImportJob'

/**
 * Persistence port for reading and updating application settings.
 */
export interface ISettingsRepository {
  getSettings(): AppSettings
  saveSettings(patch: Partial<AppSettings>): AppSettings
}
