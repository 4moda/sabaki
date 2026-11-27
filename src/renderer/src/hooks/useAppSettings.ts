import { useCallback, useEffect, useRef, useState } from 'react'
import type { SabakiApi } from '@core/application/dto'
import type { AppSettings } from '@core/domain/models'
import { DEFAULT_CONFLICT_POLICY, DEFAULT_PATH_TEMPLATE } from './useImportSession'

/**
 * Renderer-side placeholder used until the Main process settings are loaded.
 * The OS-dependent defaults (e.g. `Pictures/Sabaki`) live in the Main process
 * settings repository and are restored via the `resetSettings` IPC call.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultSourceDir: '',
  defaultDestRoot: '',
  pathTemplate: DEFAULT_PATH_TEMPLATE,
  conflictPolicy: DEFAULT_CONFLICT_POLICY,
  minimizeToTray: true,
  enableOsNotifications: true,
  autoOpenDigestModal: true,
  fastHashMode: true,
  theme: 'dark'
}

export interface UseAppSettingsReturn {
  settings: AppSettings
  isLoading: boolean
  /**
   * True once the settings reflect the persisted state (initial load or a confirmed
   * save/reset succeeded). Stays false after a failed load so consumers can stay neutral.
   */
  isLoaded: boolean
  isSaving: boolean
  savedMessage: string | null
  error: string | null
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  resetSettings: () => Promise<void>
  resetFilter: () => Promise<void>
}

/** `confirmed` is true when the patch mirrors what the Main process has persisted. */
type SettingsListener = (patch: Partial<AppSettings>, confirmed: boolean) => void

/**
 * Every mounted `useAppSettings` instance subscribes here so that a change made on one
 * screen (e.g. the Settings page) is reflected immediately elsewhere (e.g. the sidebar).
 */
const settingsListeners = new Set<SettingsListener>()

function publishSettings(patch: Partial<AppSettings>, confirmed = false): void {
  settingsListeners.forEach((listener) => listener(patch, confirmed))
}

/**
 * Captures the current values of the keys in `patch`, so that an optimistic update
 * can be reverted when persisting fails.
 */
export function captureRollbackPatch(
  current: AppSettings,
  patch: Partial<AppSettings>
): Partial<AppSettings> {
  const rollback: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as Array<keyof AppSettings>) {
    rollback[key] = current[key]
  }
  return rollback as Partial<AppSettings>
}

/**
 * Determines what to show after a failed save. The persisted settings are re-read so that
 * overlapping failed saves (old -> A -> B) never leave a value on screen that is not on disk;
 * only if re-reading also fails does it fall back to the captured rollback patch.
 */
export async function resolveSettingsAfterSaveFailure(
  api: Pick<SabakiApi, 'getSettings'> | undefined,
  rollback: Partial<AppSettings>
): Promise<{ patch: Partial<AppSettings>; confirmed: boolean }> {
  if (api?.getSettings) {
    try {
      const persisted = await api.getSettings()
      return { patch: { ...DEFAULT_APP_SETTINGS, ...persisted }, confirmed: true }
    } catch {
      // Fall through to the optimistic rollback below
    }
  }
  return { patch: rollback, confirmed: false }
}

function getSabakiApi(): SabakiApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as Window & { sabaki?: SabakiApi }).sabaki
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err
  }
  return fallback
}

/**
 * Custom hook managing persisted application settings (tray residency, OS notifications,
 * default destination folder, path template, and conflict policy).
 */
export function useAppSettings(): UseAppSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  // True from the first render when settings will be fetched, so consumers can avoid
  // flashing placeholder values (e.g. the sidebar tray badge) before the load completes.
  const [isLoading, setIsLoading] = useState<boolean>(() =>
    Boolean(getSabakiApi()?.getSettings)
  )
  const [isLoaded, setIsLoaded] = useState<boolean>(() => !getSabakiApi()?.getSettings)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsRef = useRef<AppSettings>(settings)
  settingsRef.current = settings

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const listener: SettingsListener = (patch, confirmed) => {
      setSettings((prev) => ({ ...prev, ...patch }))
      if (confirmed) {
        setIsLoaded(true)
      }
    }
    settingsListeners.add(listener)
    return () => {
      settingsListeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    const api = getSabakiApi()
    if (!api?.getSettings) {
      return
    }

    let cancelled = false
    setIsLoading(true)
    api
      .getSettings()
      .then((loaded) => {
        if (!cancelled && loaded) {
          setSettings({ ...DEFAULT_APP_SETTINGS, ...loaded })
          setIsLoaded(true)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(toErrorMessage(err, '設定の読み込みに失敗しました。'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const showSavedFeedback = useCallback((message: string) => {
    setSavedMessage(message)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      setSavedMessage(null)
    }, 2500)
  }, [])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const rollback = captureRollbackPatch(settingsRef.current, patch)
      publishSettings(patch)
      setError(null)

      const api = getSabakiApi()
      if (!api?.saveSettings) {
        showSavedFeedback('設定を更新しました（プレビューモード）')
        return
      }

      setIsSaving(true)
      try {
        const persisted = await api.saveSettings(patch)
        publishSettings({ ...DEFAULT_APP_SETTINGS, ...persisted }, true)
        showSavedFeedback('設定を保存しました')
      } catch (err) {
        const recovered = await resolveSettingsAfterSaveFailure(api, rollback)
        publishSettings(recovered.patch, recovered.confirmed)
        setError(toErrorMessage(err, '設定の保存に失敗しました。'))
      } finally {
        setIsSaving(false)
      }
    },
    [showSavedFeedback]
  )

  const resetSettings = useCallback(async () => {
    setError(null)

    const api = getSabakiApi()
    if (!api?.resetSettings) {
      publishSettings(DEFAULT_APP_SETTINGS)
      showSavedFeedback('初期設定に戻しました（プレビューモード）')
      return
    }

    setIsSaving(true)
    try {
      const restored = await api.resetSettings()
      publishSettings({ ...DEFAULT_APP_SETTINGS, ...restored }, true)
      showSavedFeedback('初期設定に戻しました')
    } catch (err) {
      setError(toErrorMessage(err, '初期設定へのリセットに失敗しました。'))
    } finally {
      setIsSaving(false)
    }
  }, [showSavedFeedback])

  return {
    settings,
    isLoading,
    isLoaded,
    isSaving,
    savedMessage,
    error,
    updateSettings,
    resetSettings,
    resetFilter: resetSettings
  }
}
