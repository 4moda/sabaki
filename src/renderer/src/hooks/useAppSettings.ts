import { useCallback, useEffect, useRef, useState } from 'react'
import type { SabakiApi } from '@core/application/dto'
import type { AppSettings } from '@core/domain/models'
import { DEFAULT_CONFLICT_POLICY, DEFAULT_PATH_TEMPLATE } from './useImportSession'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultSourceDir: '',
  defaultDestRoot: 'D:/Photos',
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
  isSaving: boolean
  savedMessage: string | null
  error: string | null
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  resetSettings: () => Promise<void>
  resetFilter: () => Promise<void>
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

function mergeAppSettings(
  base: AppSettings,
  patch?: Partial<AppSettings>
): AppSettings {
  if (!patch) {
    return {
      ...base,
      conflictPolicy: { ...base.conflictPolicy }
    }
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

function dispatchSettingsUpdated(next: AppSettings): void {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(
    new CustomEvent<AppSettings>('sabaki:settings-updated', { detail: next })
  )
}

/**
 * Custom hook managing persisted application settings (tray residency, OS notifications,
 * default destination folder, path template, and conflict policy).
 */
export function useAppSettings(): UseAppSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const settingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
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
          const next = mergeAppSettings(DEFAULT_APP_SETTINGS, loaded)
          settingsRef.current = next
          setSettings(next)
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
      const optimistic = mergeAppSettings(settingsRef.current, patch)
      settingsRef.current = optimistic
      setSettings(optimistic)
      setError(null)

      const api = getSabakiApi()
      if (!api?.saveSettings) {
        dispatchSettingsUpdated(optimistic)
        showSavedFeedback('設定を更新しました（プレビューモード）')
        return
      }

      setIsSaving(true)
      try {
        const persisted = await api.saveSettings(patch)
        const next = mergeAppSettings(DEFAULT_APP_SETTINGS, persisted)
        settingsRef.current = next
        setSettings(next)
        dispatchSettingsUpdated(next)
        showSavedFeedback('設定を保存しました')
      } catch (err) {
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
      await updateSettings(DEFAULT_APP_SETTINGS)
      return
    }

    setIsSaving(true)
    try {
      const persisted = await api.resetSettings()
      const next = mergeAppSettings(DEFAULT_APP_SETTINGS, persisted)
      settingsRef.current = next
      setSettings(next)
      dispatchSettingsUpdated(next)
      showSavedFeedback('初期設定に戻しました')
    } catch (err) {
      setError(toErrorMessage(err, '初期設定へのリセットに失敗しました。'))
    } finally {
      setIsSaving(false)
    }
  }, [showSavedFeedback, updateSettings])

  return {
    settings,
    isLoading,
    isSaving,
    savedMessage,
    error,
    updateSettings,
    resetSettings,
    resetFilter: resetSettings
  }
}
