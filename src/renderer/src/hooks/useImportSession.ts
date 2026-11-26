import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ExecuteImportJobResult,
  PreviewTargetPathsResult,
  SabakiApi
} from '@core/application/dto'
import type {
  AppSettings,
  ConflictPolicyConfig,
  ImportProgressEvent,
  ImportScanPreview,
  PathPreset
} from '@core/domain/models'
import {
  PATH_PRESETS,
  generateRealtimePreviews
} from '@core/domain/services/PathBuilderDomainService'
import {
  DEFAULT_CONFLICT_POLICY,
  DEFAULT_PATH_TEMPLATE,
  INITIAL_SESSION_DEFAULTS,
  syncSessionWithDefaults,
  toSessionDefaults,
  type ImportSessionDefaults
} from './importSessionDefaults'

export { DEFAULT_CONFLICT_POLICY, DEFAULT_PATH_TEMPLATE } from './importSessionDefaults'
export const DEFAULT_PREVIEW_ROOT = 'D:/Photos'

export type PathPreviewItem = PreviewTargetPathsResult['previews'][number]

export interface UseImportSessionOptions {
  initialSourceRoot?: string
  initialDestRoot?: string
  initialPathTemplate?: string
  initialConflictPolicy?: ConflictPolicyConfig
  onImportCompleted?: (result: ExecuteImportJobResult) => void
}

export interface UseImportSessionReturn {
  sourceRoot: string
  setSourceRoot: (value: string) => void
  destRoot: string
  setDestRoot: (value: string) => void
  pathTemplate: string
  setPathTemplate: (value: string) => void
  conflictPolicy: ConflictPolicyConfig
  setConflictPolicy: (policy: ConflictPolicyConfig) => void
  fastHashMode: boolean
  setFastHashMode: (value: boolean) => void
  autoOpenDigestModal: boolean
  /** Last loaded persisted defaults (「常駐・設定」) used to detect temporary overrides. */
  persistedDefaults: ImportSessionDefaults
  isDigestVisible: boolean
  previews: PathPreviewItem[]
  presets: PathPreset[]
  scanPreview: ImportScanPreview | null
  isScanning: boolean
  isImporting: boolean
  progress: ImportProgressEvent | null
  completedResult: ExecuteImportJobResult | null
  error: string | null
  browseSource: () => Promise<void>
  browseDest: () => Promise<void>
  insertToken: (token: string) => void
  selectPreset: (template: string) => void
  runScan: () => Promise<void>
  runImport: () => Promise<void>
  openDigest: () => void
  dismissDigest: () => void
  clearError: () => void
  /**
   * Reloads persisted settings and applies changed defaults to fields the user has not
   * temporarily overridden. Skipped while a scan or import is running.
   */
  refreshPersistedDefaults: () => Promise<void>
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
 * Custom hook managing SD card import workflow state, real-time path previews,
 * pre-scan summary, live IPC progress events, and Session Attribute Digest results.
 */
export function useImportSession(
  options: UseImportSessionOptions = {}
): UseImportSessionReturn {
  const { onImportCompleted } = options
  const [sourceRoot, setSourceRootState] = useState<string>(options.initialSourceRoot ?? '')
  const [destRoot, setDestRootState] = useState<string>(options.initialDestRoot ?? '')
  const [pathTemplate, setPathTemplate] = useState<string>(
    options.initialPathTemplate ?? DEFAULT_PATH_TEMPLATE
  )
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicyConfig>(
    options.initialConflictPolicy ?? DEFAULT_CONFLICT_POLICY
  )
  const [fastHashMode, setFastHashMode] = useState<boolean>(true)
  const [autoOpenDigestModal, setAutoOpenDigestModal] = useState<boolean>(true)
  const [isDigestVisible, setIsDigestVisible] = useState<boolean>(false)
  const [scanPreview, setScanPreview] = useState<ImportScanPreview | null>(null)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [isImporting, setIsImporting] = useState<boolean>(false)
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null)
  const [completedResult, setCompletedResult] = useState<ExecuteImportJobResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setSourceRoot = useCallback((value: string) => {
    setSourceRootState(value)
    setScanPreview(null)
    setError(null)
  }, [])

  const setDestRoot = useCallback((value: string) => {
    setDestRootState(value)
    setError(null)
  }, [])

  const [persistedDefaults, setPersistedDefaults] =
    useState<ImportSessionDefaults>(INITIAL_SESSION_DEFAULTS)
  const persistedDefaultsRef = useRef<ImportSessionDefaults>(INITIAL_SESSION_DEFAULTS)
  const latestSessionRef = useRef<ImportSessionDefaults>({
    sourceRoot,
    destRoot,
    pathTemplate,
    conflictPolicy
  })
  const isBusyRef = useRef<boolean>(false)

  useEffect(() => {
    latestSessionRef.current = { sourceRoot, destRoot, pathTemplate, conflictPolicy }
    isBusyRef.current = isImporting || isScanning
  })

  const refreshPersistedDefaults = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.getSettings) {
      return
    }

    let settings: AppSettings | null = null
    try {
      settings = await api.getSettings()
    } catch {
      // Ignore settings load failures and keep the current session values
      return
    }
    if (!settings || isBusyRef.current) {
      return
    }

    const previousDefaults = persistedDefaultsRef.current
    const nextDefaults = toSessionDefaults(settings, previousDefaults)
    const current = latestSessionRef.current
    const synced = syncSessionWithDefaults(current, previousDefaults, nextDefaults)

    persistedDefaultsRef.current = nextDefaults
    latestSessionRef.current = synced
    setPersistedDefaults(nextDefaults)
    if (synced.sourceRoot !== current.sourceRoot) {
      setSourceRootState(synced.sourceRoot)
      setScanPreview(null)
    }
    setDestRootState(synced.destRoot)
    setPathTemplate(synced.pathTemplate)
    setConflictPolicy(synced.conflictPolicy)

    if (typeof settings.fastHashMode === 'boolean') {
      setFastHashMode(settings.fastHashMode)
    }
    if (typeof settings.autoOpenDigestModal === 'boolean') {
      setAutoOpenDigestModal(settings.autoOpenDigestModal)
    }
  }, [])

  // Load persisted default settings from Electron main process if available
  useEffect(() => {
    void refreshPersistedDefaults()
  }, [refreshPersistedDefaults])

  // Refreshes skipped during a scan / import are retried once the session becomes idle
  const isBusy = isImporting || isScanning
  const wasBusyRef = useRef<boolean>(false)
  useEffect(() => {
    if (wasBusyRef.current && !isBusy) {
      void refreshPersistedDefaults()
    }
    wasBusyRef.current = isBusy
  }, [isBusy, refreshPersistedDefaults])

  // Subscribe to real-time import progress events from main process
  useEffect(() => {
    const api = getSabakiApi()
    if (!api?.onImportProgress) {
      return
    }
    const unsubscribe = api.onImportProgress((event) => {
      setProgress(event)
    })
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  // Compute real-time destination path previews synchronously via domain service
  const previews = useMemo<PathPreviewItem[]>(() => {
    const effectiveRoot = destRoot.trim() || DEFAULT_PREVIEW_ROOT
    const effectiveTemplate = pathTemplate.trim() || DEFAULT_PATH_TEMPLATE
    return generateRealtimePreviews(effectiveRoot, effectiveTemplate)
  }, [destRoot, pathTemplate])

  const browseSource = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.selectDirectory) {
      setError('フォルダ選択ダイアログはElectron環境でのみ利用できます。')
      return
    }

    try {
      const selected = await api.selectDirectory({
        title: 'SDカード / コピー元フォルダを選択',
        defaultPath: sourceRoot.trim() || undefined
      })
      if (selected) {
        setSourceRoot(selected)
      }
    } catch (err) {
      setError(toErrorMessage(err, 'コピー元フォルダの選択に失敗しました。'))
    }
  }, [sourceRoot, setSourceRoot])

  const browseDest = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.selectDirectory) {
      setError('フォルダ選択ダイアログはElectron環境でのみ利用できます。')
      return
    }

    try {
      const selected = await api.selectDirectory({
        title: 'HDD / SSD コピー先ルートフォルダを選択',
        defaultPath: destRoot.trim() || undefined
      })
      if (selected) {
        setDestRoot(selected)
      }
    } catch (err) {
      setError(toErrorMessage(err, 'コピー先フォルダの選択に失敗しました。'))
    }
  }, [destRoot, setDestRoot])

  const insertToken = useCallback((token: string) => {
    setPathTemplate((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) {
        return token
      }
      if (trimmed.endsWith('/') || trimmed.endsWith('\\')) {
        return `${trimmed}${token}`
      }
      return `${trimmed}/${token}`
    })
  }, [])

  const selectPreset = useCallback((template: string) => {
    setPathTemplate(template)
  }, [])

  const runScan = useCallback(async () => {
    const trimmedSource = sourceRoot.trim()
    if (!trimmedSource) {
      setError('コピー元（SDカード）フォルダを指定してください。')
      return
    }

    const api = getSabakiApi()
    if (!api?.scanSourceDirectory) {
      setError('事前スキャンAPIが利用できません。')
      return
    }

    setIsScanning(true)
    setError(null)
    try {
      const preview = await api.scanSourceDirectory(trimmedSource)
      setScanPreview(preview)
    } catch (err) {
      setError(toErrorMessage(err, 'コピー元フォルダのスキャンに失敗しました。'))
    } finally {
      setIsScanning(false)
    }
  }, [sourceRoot])

  const runImport = useCallback(async () => {
    const trimmedSource = sourceRoot.trim()
    const trimmedDest = destRoot.trim()
    const effectiveTemplate = pathTemplate.trim() || DEFAULT_PATH_TEMPLATE

    if (!trimmedSource) {
      setError('コピー元（SDカード）フォルダを指定してください。')
      return
    }
    if (!trimmedDest) {
      setError('コピー先（HDD / SSD）ルートフォルダを指定してください。')
      return
    }

    const api = getSabakiApi()
    if (!api?.executeImportJob) {
      setError('インポート実行APIが利用できません。')
      return
    }

    setIsImporting(true)
    setError(null)
    setCompletedResult(null)
    setIsDigestVisible(false)
    setProgress({
      phase: 'scanning',
      processedFiles: 0,
      totalFiles: scanPreview?.totalFiles ?? 0,
      copiedFiles: 0,
      skippedFiles: 0,
      renamedFiles: 0,
      overwrittenFiles: 0,
      errorFiles: 0,
      percentage: 0
    })

    let shouldAutoOpenDigest = autoOpenDigestModal
    if (api.getSettings) {
      try {
        const latestSettings = await api.getSettings()
        if (typeof latestSettings?.autoOpenDigestModal === 'boolean') {
          shouldAutoOpenDigest = latestSettings.autoOpenDigestModal
          setAutoOpenDigestModal(shouldAutoOpenDigest)
        }
      } catch {
        // Fallback to cached setting value
      }
    }

    try {
      const result = await api.executeImportJob({
        sourceDir: trimmedSource,
        destRoot: trimmedDest,
        pathTemplate: effectiveTemplate,
        conflictPolicy
      })

      setCompletedResult(result)
      setIsDigestVisible(shouldAutoOpenDigest)
      setProgress({
        jobId: result.job.id,
        phase: result.job.status === 'failed' ? 'failed' : 'completed',
        processedFiles: result.job.totalFiles,
        totalFiles: result.job.totalFiles,
        copiedFiles: result.job.copiedFiles,
        skippedFiles: result.job.skippedFiles,
        renamedFiles: result.job.renamedFiles,
        overwrittenFiles: result.job.overwrittenFiles,
        errorFiles: result.job.errorFiles,
        percentage: 100
      })

      onImportCompleted?.(result)
    } catch (err) {
      setError(toErrorMessage(err, 'インポート処理中にエラーが発生しました。'))
      setProgress((prev) => (prev ? { ...prev, phase: 'failed' } : null))
    } finally {
      setIsImporting(false)
    }
  }, [
    sourceRoot,
    destRoot,
    pathTemplate,
    conflictPolicy,
    autoOpenDigestModal,
    scanPreview?.totalFiles,
    onImportCompleted
  ])

  const openDigest = useCallback(() => {
    if (completedResult) {
      setIsDigestVisible(true)
    }
  }, [completedResult])

  const dismissDigest = useCallback(() => {
    setIsDigestVisible(false)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    sourceRoot,
    setSourceRoot,
    destRoot,
    setDestRoot,
    pathTemplate,
    setPathTemplate,
    conflictPolicy,
    setConflictPolicy,
    fastHashMode,
    setFastHashMode,
    autoOpenDigestModal,
    persistedDefaults,
    isDigestVisible,
    previews,
    presets: PATH_PRESETS,
    scanPreview,
    isScanning,
    isImporting,
    progress,
    completedResult,
    error,
    browseSource,
    browseDest,
    insertToken,
    selectPreset,
    runScan,
    runImport,
    openDigest,
    dismissDigest,
    clearError,
    refreshPersistedDefaults
  }
}
