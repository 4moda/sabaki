import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type RefObject
} from 'react'
import {
  Bell,
  Database,
  Globe,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { SabakiApi } from '@core/application/dto'
import { useAppSettings } from '../../hooks'
import { Badge, Button, Card, Switch } from '../atoms'
import { FolderPickerField } from '../molecules'
import { ConflictPolicySelector, PathBuilderSection } from '../organisms'

export interface SettingsPageProps {
  className?: string
}

function getSabakiApi(): SabakiApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as Window & { sabaki?: SabakiApi }).sabaki
}

interface ConfirmDialogA11y {
  dialogRef: RefObject<HTMLDivElement | null>
  descriptionId: string
  /** Stores the element to restore focus to when the dialog closes. */
  rememberTrigger: (trigger?: Element | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

/**
 * Inline confirm panel focus management: focuses the safe button (`data-confirm-safe`) on open,
 * closes on Escape, and returns focus to the element that opened it.
 */
function useConfirmDialogA11y(isOpen: boolean, onDismiss: () => void): ConfirmDialogA11y {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const descriptionId = useId()

  useEffect(() => {
    if (!isOpen) return
    dialogRef.current?.querySelector<HTMLElement>('[data-confirm-safe]')?.focus()
    return () => {
      const trigger = triggerRef.current
      triggerRef.current = null
      if (trigger?.isConnected) {
        trigger.focus()
      }
    }
  }, [isOpen])

  const rememberTrigger = useCallback((trigger?: Element | null) => {
    const target = trigger ?? document.activeElement
    triggerRef.current = target instanceof HTMLElement ? target : null
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onDismiss()
      }
    },
    [onDismiss]
  )

  return { dialogRef, descriptionId, rememberTrigger, onKeyDown }
}

/**
 * Application Settings Page managing resident system tray behavior, OS completion notifications,
 * default destination folder, path template, 4-mode conflict policy, fast hash toggle,
 * and Web portfolio JSON export / demo data controls.
 */
export function SettingsPage({ className }: SettingsPageProps): ReactElement {
  const {
    settings,
    isSaving,
    savedMessage,
    error,
    updateSettings,
    resetSettings
  } = useAppSettings()

  const [toolMessage, setToolMessage] = useState<string | null>(null)
  const [isRunningTool, setIsRunningTool] = useState(false)
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const [isConfirmingSeed, setIsConfirmingSeed] = useState(false)
  const [isConfirmingReset, setIsConfirmingReset] = useState(false)

  const resetDialog = useConfirmDialogA11y(isConfirmingReset, () => {
    if (!isSaving) setIsConfirmingReset(false)
  })
  const seedDialog = useConfirmDialogA11y(isConfirmingSeed, () => {
    if (!isRunningTool) setIsConfirmingSeed(false)
  })
  const clearDialog = useConfirmDialogA11y(isConfirmingClear, () => {
    if (!isRunningTool) setIsConfirmingClear(false)
  })

  const handleResetSettings = useCallback(async () => {
    await resetSettings()
    setIsConfirmingReset(false)
  }, [resetSettings])

  const handleBrowseDefaultDest = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.selectDirectory) return
    const selected = await api.selectDirectory({
      title: 'デフォルトの保存先ルートフォルダを選択',
      defaultPath: settings.defaultDestRoot || undefined
    })
    if (selected) {
      await updateSettings({ defaultDestRoot: selected })
    }
  }, [settings.defaultDestRoot, updateSettings])

  const handleInsertToken = useCallback(
    (token: string) => {
      const trimmed = settings.pathTemplate.trim()
      const next = !trimmed
        ? token
        : trimmed.endsWith('/') || trimmed.endsWith('\\')
          ? `${trimmed}${token}`
          : `${trimmed}/${token}`
      void updateSettings({ pathTemplate: next })
    },
    [settings.pathTemplate, updateSettings]
  )

  const handleExportWebJson = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.exportPublicWebJson) {
      setToolMessage('Web公開用JSONエクスポートはElectron環境で利用できます。')
      return
    }
    setIsRunningTool(true)
    try {
      const result = await api.exportPublicWebJson({ includePublicFiles: true })
      if (result.canceled) {
        setToolMessage('stats-public.json の書き出しをキャンセルしました。')
        return
      }
      setToolMessage(
        result.outputPath
          ? `stats-public.json を書き出しました: ${result.outputPath}`
          : 'stats-public.json を生成しました。'
      )
    } catch (err) {
      setToolMessage(
        err instanceof Error ? err.message : 'JSONエクスポートに失敗しました。'
      )
    } finally {
      setIsRunningTool(false)
    }
  }, [])

  const handleSeedDemoData = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.seedDemoData) {
      setIsConfirmingSeed(false)
      setToolMessage('サンプルデータ投入はElectron環境で利用できます。')
      return
    }
    setIsRunningTool(true)
    try {
      const result = await api.seedDemoData({ shotCount: 180 })
      setIsConfirmingSeed(false)
      setToolMessage(
        `サンプル撮影データ ${result.insertedFiles.toLocaleString()}件 を投入しました。`
      )
    } catch (err) {
      setToolMessage(
        err instanceof Error ? err.message : 'サンプルデータの投入に失敗しました。'
      )
    } finally {
      setIsRunningTool(false)
    }
  }, [])

  const handleClearAllData = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.clearAllData) {
      setIsConfirmingClear(false)
      setToolMessage('履歴・デモデータの初期化はElectron環境で利用できます。')
      return
    }
    setIsRunningTool(true)
    try {
      const result = await api.clearAllData()
      setIsConfirmingClear(false)
      setToolMessage(
        `履歴・デモデータを初期化しました（ファイル ${result.deletedFiles.toLocaleString()}件 / ジョブ ${result.deletedJobs.toLocaleString()}件を削除）。`
      )
    } catch (err) {
      setToolMessage(
        err instanceof Error ? err.message : '履歴・デモデータの初期化に失敗しました。'
      )
    } finally {
      setIsRunningTool(false)
    }
  }, [])

  return (
    <div className={className ? `flex flex-col gap-6 ${className}` : 'flex flex-col gap-6'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            常駐動作 &amp; アプリケーション設定
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            タスクトレイ常駐、OS完了通知、デフォルトの振り分け構成と競合解決ポリシーを設定します。
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedMessage && <Badge variant="emerald">{savedMessage}</Badge>}
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            disabled={isSaving}
            onClick={(event) => {
              resetDialog.rememberTrigger(event.currentTarget)
              setIsConfirmingReset(true)
            }}
          >
            初期設定に戻す
          </Button>
        </div>
      </div>

      {isConfirmingReset && (
        <div
          ref={resetDialog.dialogRef}
          role="alertdialog"
          aria-label="初期設定へのリセット確認"
          aria-describedby={resetDialog.descriptionId}
          onKeyDown={resetDialog.onKeyDown}
          className="flex flex-col gap-2.5 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-100"
        >
          <p id={resetDialog.descriptionId} className="leading-relaxed">
            常駐・通知の各設定、デフォルト保存先、パステンプレート、競合解決ポリシーをすべて初期値に戻します。取り込み履歴や写真・動画ファイルは変更されません。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              loading={isSaving}
              onClick={() => void handleResetSettings()}
            >
              初期値に戻す
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isSaving}
              data-confirm-safe
              onClick={() => setIsConfirmingReset(false)}
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Resident Tray, Notifications & Performance */}
        <Card
          title="常駐・通知・パフォーマンス"
          subtitle="デスクトップ常駐アプリとしての基本挙動をカスタマイズします"
          icon={<Bell className="h-4 w-4" />}
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
              <Switch
                checked={settings.minimizeToTray}
                onChange={(checked) => void updateSettings({ minimizeToTray: checked })}
                label="ウィンドウを閉じた時にタスクトレイへ常駐"
                description="×ボタンで閉じてもプロセスを終了せず、タスクトレイからワンクリックで再表示できます。"
              />
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
              <Switch
                checked={settings.enableOsNotifications}
                onChange={(checked) =>
                  void updateSettings({ enableOsNotifications: checked })
                }
                label="インポート完了時にOSネイティブ通知を表示"
                description="大量のRAWコピー完了時やエラー発生時にWindows/macOSの通知センターへお知らせします。"
              />
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
              <Switch
                checked={settings.autoOpenDigestModal}
                onChange={(checked) =>
                  void updateSettings({ autoOpenDigestModal: checked })
                }
                label="インポート完了後に撮影属性アナライズレポートを自動表示"
                description="取り込み完了直後にメインカメラ・レンズやSNSシェアテキストをすぐ確認できます。"
              />
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
              <Switch
                checked={settings.fastHashMode}
                onChange={(checked) => void updateSettings({ fastHashMode: checked })}
                label="高速ハッシュモード（大容量動画ファイル向け）"
                description="数GB級のMP4/MOV動画に対して先頭・末尾チャンクを用いた高速ハッシュ判定を優先します。"
              />
            </div>
          </div>
        </Card>

        {/* Default Destination & Data Tools */}
        <div className="flex flex-col gap-6">
          <Card
            title="デフォルト保存先ルート"
            subtitle="SD取り込み画面を開いた時に初期入力される保存先フォルダ"
            icon={<Settings className="h-4 w-4" />}
          >
            <FolderPickerField
              label="デフォルト保存先 (HDD / SSD)"
              value={settings.defaultDestRoot}
              placeholder="例: D:/Photos"
              onChange={(value) => void updateSettings({ defaultDestRoot: value })}
              onBrowse={() => void handleBrowseDefaultDest()}
            />
          </Card>

          <Card
            title="ポートフォリオ連携 & テストデータ管理"
            subtitle="Webサイト用クリーンJSONの書き出しや、52週間デモデータの投入を行います"
            icon={<Database className="h-4 w-4" />}
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2.5">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Globe className="h-3.5 w-3.5" />}
                  loading={isRunningTool}
                  onClick={() => void handleExportWebJson()}
                >
                  stats-public.json を書き出す
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Sparkles className="h-3.5 w-3.5 text-amber-400" />}
                  disabled={isRunningTool}
                  onClick={(event) => {
                    seedDialog.rememberTrigger(event.currentTarget)
                    setIsConfirmingClear(false)
                    setIsConfirmingSeed(true)
                  }}
                >
                  サンプル撮影データを投入
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
                  disabled={isRunningTool}
                  onClick={(event) => {
                    clearDialog.rememberTrigger(event.currentTarget)
                    setIsConfirmingSeed(false)
                    setIsConfirmingClear(true)
                  }}
                  className="border-rose-500/40 text-rose-300 hover:border-rose-400/60 hover:bg-rose-950/40 hover:text-rose-200"
                >
                  履歴・デモデータを初期化
                </Button>
              </div>
              {isConfirmingSeed && (
                <div
                  ref={seedDialog.dialogRef}
                  role="alertdialog"
                  aria-label="サンプル撮影データの投入確認"
                  aria-describedby={seedDialog.descriptionId}
                  onKeyDown={seedDialog.onKeyDown}
                  className="flex flex-col gap-2.5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-100"
                >
                  <p id={seedDialog.descriptionId} className="leading-relaxed">
                    52週間分のサンプル撮影データ（180件）を履歴・撮影分析に追加します。実際の取り込み履歴と混在して集計されます。
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={isRunningTool}
                      onClick={() => void handleSeedDemoData()}
                    >
                      投入する
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isRunningTool}
                      data-confirm-safe
                      onClick={() => setIsConfirmingSeed(false)}
                    >
                      キャンセル
                    </Button>
                  </div>
                </div>
              )}
              {isConfirmingClear && (
                <div
                  ref={clearDialog.dialogRef}
                  role="alertdialog"
                  aria-label="履歴・デモデータの初期化確認"
                  aria-describedby={clearDialog.descriptionId}
                  onKeyDown={clearDialog.onKeyDown}
                  className="flex flex-col gap-2.5 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-100"
                >
                  <p id={clearDialog.descriptionId} className="leading-relaxed">
                    アプリ内のデモデータ・取り込み履歴（SQLiteレコード）をすべて削除します。HDD/SSD
                    上に保存された写真・動画ファイル自体は削除されません。
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={isRunningTool}
                      onClick={() => void handleClearAllData()}
                    >
                      すべて削除する
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isRunningTool}
                      data-confirm-safe
                      onClick={() => setIsConfirmingClear(false)}
                    >
                      キャンセル
                    </Button>
                  </div>
                </div>
              )}
              {toolMessage && (
                <p className="text-xs text-emerald-300">{toolMessage}</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Default Path Builder & Conflict Policy */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PathBuilderSection
          destRoot={settings.defaultDestRoot}
          pathTemplate={settings.pathTemplate}
          onChangeTemplate={(template) => void updateSettings({ pathTemplate: template })}
          onSelectPreset={(template) => void updateSettings({ pathTemplate: template })}
          onInsertToken={handleInsertToken}
        />

        <ConflictPolicySelector
          policy={settings.conflictPolicy}
          onChange={(conflictPolicy) => void updateSettings({ conflictPolicy })}
        />
      </div>
    </div>
  )
}
