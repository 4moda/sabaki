import type { ImportJobStatus } from '@core/domain/models'
import type { BadgeVariant } from '../components/atoms/Badge'

export interface StatusDisplay {
  label: string
  variant: BadgeVariant
}

const IMPORT_JOB_STATUS_DISPLAY: Record<ImportJobStatus, StatusDisplay> = {
  pending: { label: '待機中', variant: 'amber' },
  running: { label: '実行中', variant: 'amber' },
  completed: { label: '完了', variant: 'emerald' },
  failed: { label: '失敗', variant: 'rose' },
  cancelled: { label: 'キャンセル', variant: 'amber' }
}

/**
 * Maps an import job status to its Japanese badge label and color variant.
 * Unknown values (e.g. from an older database) fall back to the raw string.
 */
export function getImportJobStatusDisplay(status: ImportJobStatus | string): StatusDisplay {
  return (
    IMPORT_JOB_STATUS_DISPLAY[status as ImportJobStatus] ?? {
      label: status,
      variant: 'default'
    }
  )
}

export interface TrayStatusDisplay {
  label: string
  /** True when the app keeps running in the system tray after the window is closed. */
  isResident: boolean
}

/**
 * Sidebar tray badge text derived from the `minimizeToTray` setting.
 * `null` means the settings are still loading and yields a neutral (non-pulsing) badge.
 */
export function getTrayStatusDisplay(minimizeToTray: boolean | null): TrayStatusDisplay {
  if (minimizeToTray === null) {
    return { label: 'トレイ設定を確認中', isResident: false }
  }
  return minimizeToTray
    ? { label: 'タスクトレイ常駐中', isResident: true }
    : { label: 'タスクトレイ常駐オフ', isResident: false }
}
