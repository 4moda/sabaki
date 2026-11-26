import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Copy,
  FileWarning,
  Film,
  HardDriveDownload,
  Image as ImageIcon,
  Play,
  RefreshCw,
  Search,
  SkipForward,
  X
} from 'lucide-react'
import type { ImportProgressEvent, ImportScanPreview } from '@core/domain/models'
import { Badge, Button, Card, ProgressBar } from '../atoms'

export interface ImportProgressPanelProps {
  scanPreview: ImportScanPreview | null
  progress: ImportProgressEvent | null
  isScanning: boolean
  isImporting: boolean
  canScan: boolean
  canImport: boolean
  error?: string | null
  onScan: () => void
  onStartImport: () => void
  onClearError?: () => void
  className?: string
}

const PHASE_LABELS: Record<ImportProgressEvent['phase'], string> = {
  scanning: 'スキャン中...',
  copying: '振り分けコピー中...',
  analyzing: 'Exif解析・セッションレポート生成中...',
  completed: 'インポート完了',
  failed: 'エラーにより中断'
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const decimals = unitIndex >= 2 ? (value >= 100 ? 1 : 2) : unitIndex === 1 ? 1 : 0
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

/**
 * Pre-scan summary, primary import execution controls, and real-time progress / counter panel.
 */
export function ImportProgressPanel({
  scanPreview,
  progress,
  isScanning,
  isImporting,
  canScan,
  canImport,
  error,
  onScan,
  onStartImport,
  onClearError,
  className
}: ImportProgressPanelProps): ReactElement {
  const sortedExtensions = scanPreview
    ? Object.entries(scanPreview.extBreakdown).sort((a, b) => b[1] - a[1])
    : []

  const progressColor =
    progress?.phase === 'failed'
      ? 'amber'
      : progress?.phase === 'completed'
        ? 'emerald'
        : 'indigo'

  return (
    <Card
      title="スキャン結果 & インポート実行"
      subtitle="事前スキャンでメディア内訳を確認してから安全に振り分けコピーを開始できます"
      icon={<HardDriveDownload className="h-4 w-4" />}
      className={className}
    >
      <div className="flex flex-col gap-5">
        {/* Primary action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            icon={<Search className="h-4 w-4" />}
            loading={isScanning}
            disabled={!canScan || isImporting}
            onClick={onScan}
          >
            事前スキャン
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<Play className="h-4 w-4" />}
            loading={isImporting}
            disabled={!canImport || isScanning}
            onClick={onStartImport}
            className="flex-1 sm:flex-initial"
          >
            振り分けコピー開始
          </Button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
            {onClearError && (
              <button
                type="button"
                onClick={onClearError}
                aria-label="エラーを閉じる"
                className="rounded p-0.5 text-rose-300 transition-colors hover:bg-rose-900/50 hover:text-rose-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Pre-scan summary */}
        {scanPreview ? (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-400">事前スキャン結果</p>
                <p className="mt-0.5 text-lg font-bold text-slate-100">
                  {scanPreview.totalFiles.toLocaleString()} ファイル
                  <span className="ml-2 text-sm font-medium text-emerald-400">
                    ({formatBytes(scanPreview.totalBytes)})
                  </span>
                </p>
              </div>
              <Badge variant="emerald">スキャン完了</Badge>
            </div>

            {/* RAW / JPEG / VIDEO breakdown cards */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                  <Camera className="h-3.5 w-3.5" />
                  <span>RAW</span>
                </div>
                <p className="mt-1 text-xl font-bold tabular-nums text-amber-200">
                  {(scanPreview.mediaTypeBreakdown.RAW ?? 0).toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>JPEG</span>
                </div>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-200">
                  {(scanPreview.mediaTypeBreakdown.JPEG ?? 0).toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-sky-300">
                  <Film className="h-3.5 w-3.5" />
                  <span>VIDEO</span>
                </div>
                <p className="mt-1 text-xl font-bold tabular-nums text-sky-200">
                  {(scanPreview.mediaTypeBreakdown.VIDEO ?? 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Extension chips */}
            {sortedExtensions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="mr-1 text-xs text-slate-400">拡張子内訳:</span>
                {sortedExtensions.map(([ext, count]) => (
                  <Badge key={ext} variant="default" className="font-mono">
                    .{ext} <span className="text-slate-100">{count.toLocaleString()}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-400">
            コピー元フォルダを指定して「事前スキャン」を押すと、RAW / JPEG / VIDEO
            の件数と合計容量を確認できます。
          </div>
        )}

        {/* Real-time progress & live counter grid */}
        {(isImporting || progress) && progress && (
          <div className="@container flex flex-col gap-3.5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <ProgressBar
              percent={progress.percentage}
              color={progressColor}
              label={PHASE_LABELS[progress.phase]}
              sublabel={
                progress.totalFiles > 0
                  ? `${progress.processedFiles.toLocaleString()} / ${progress.totalFiles.toLocaleString()} (${Math.round(progress.percentage)}%)`
                  : `${Math.round(progress.percentage)}%`
              }
            />

            {progress.currentFileName && (
              <div className="flex items-center gap-2 rounded-md border border-slate-800/80 bg-slate-900/70 px-2.5 py-1.5 text-xs">
                <span className="shrink-0 text-slate-400">処理中:</span>
                <code
                  className="min-w-0 truncate font-mono text-slate-200"
                  title={progress.currentFileName}
                >
                  {progress.currentFileName}
                </code>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 @md:grid-cols-5">
              <CounterTile
                label="コピー"
                value={progress.copiedFiles}
                icon={<CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                valueClass="text-emerald-300"
              />
              <CounterTile
                label="スキップ"
                value={progress.skippedFiles}
                icon={<SkipForward className="h-3 w-3 text-sky-400" />}
                valueClass="text-sky-300"
              />
              <CounterTile
                label="リネーム"
                value={progress.renamedFiles}
                icon={<Copy className="h-3 w-3 text-amber-400" />}
                valueClass="text-amber-300"
              />
              <CounterTile
                label="上書き"
                value={progress.overwrittenFiles}
                icon={<RefreshCw className="h-3 w-3 text-indigo-400" />}
                valueClass="text-indigo-300"
              />
              <CounterTile
                label="エラー"
                value={progress.errorFiles}
                icon={<FileWarning className="h-3 w-3 text-rose-400" />}
                valueClass={progress.errorFiles > 0 ? 'text-rose-300' : 'text-slate-400'}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

interface CounterTileProps {
  label: string
  value: number
  icon: ReactElement
  valueClass: string
}

/**
 * Live counter tile: icon + short label on the first row, the value alone on the second row.
 * The grid switches to 5 columns only when the progress container is at least 28rem (`@md`)
 * wide (tiles >= ~83px); the value uses `text-sm` below 32rem (`@lg`) so 6-7 character values
 * such as `12,345` or `123,456` still fit. Below 28rem the tiles wrap into 3 columns.
 */
function CounterTile({ label, value, icon, valueClass }: CounterTileProps): ReactElement {
  return (
    <div
      data-testid="import-counter-tile"
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-800/90 bg-slate-900/70 px-2 py-2"
    >
      <div className="flex items-center gap-1 text-[11px] leading-tight text-slate-400">
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span data-testid="import-counter-label" className="whitespace-nowrap">
          {label}
        </span>
      </div>
      <span
        data-testid="import-counter-value"
        className={clsx('text-sm font-bold tabular-nums whitespace-nowrap @lg:text-base', valueClass)}
      >
        {value.toLocaleString()}
      </span>
    </div>
  )
}
