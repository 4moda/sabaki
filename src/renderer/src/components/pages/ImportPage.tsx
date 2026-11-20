import { useId, useState, type ReactElement } from 'react'
import { clsx } from 'clsx'
import { CheckCircle2, ChevronDown, FolderInput, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { ExecuteImportJobResult } from '@core/application/dto'
import type { ConflictResolutionMode } from '@core/domain/models'
import { DEFAULT_PATH_TEMPLATE, useImportSession } from '../../hooks'
import { Button, Card } from '../atoms'
import { FolderPickerField } from '../molecules'
import {
  ConflictPolicySelector,
  ImportProgressPanel,
  PathBuilderSection,
  SessionDigestModal
} from '../organisms'
import { ImportSplitTemplate } from '../templates'

export interface ImportPageProps {
  onImportCompleted?: (result: ExecuteImportJobResult) => void
  className?: string
}

const CONFLICT_MODE_SUMMARY_LABELS: Record<ConflictResolutionMode, string> = {
  skip_same_hash_rename_diff: '同一スキップ・別物リネーム',
  skip: '常にスキップ',
  rename: '常に連番リネーム',
  overwrite: '上書き'
}

/**
 * Full SD card import page combining folder selection, collapsible PathBuilder &
 * 4-mode ConflictPolicySelector, pre-scan / live progress panel,
 * and post-import Session Attribute Digest report.
 */
export function ImportPage({
  onImportCompleted,
  className
}: ImportPageProps): ReactElement {
  const {
    sourceRoot,
    setSourceRoot,
    destRoot,
    setDestRoot,
    pathTemplate,
    setPathTemplate,
    conflictPolicy,
    setConflictPolicy,
    presets,
    scanPreview,
    isScanning,
    isImporting,
    progress,
    completedResult,
    isDigestVisible,
    error,
    browseSource,
    browseDest,
    insertToken,
    selectPreset,
    runScan,
    runImport,
    openDigest,
    dismissDigest,
    clearError
  } = useImportSession({ onImportCompleted })

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const advancedPanelId = useId()

  const canScan = sourceRoot.trim().length > 0
  const canImport = sourceRoot.trim().length > 0 && destRoot.trim().length > 0
  const activeTemplateSummary = pathTemplate.trim() || DEFAULT_PATH_TEMPLATE
  const activeConflictLabel = CONFLICT_MODE_SUMMARY_LABELS[conflictPolicy.fileConflictMode]

  const header = (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-bold tracking-tight text-slate-100">
        SDカード取り込み &amp; 振り分けコピー
      </h2>
      <p className="text-xs text-slate-400">
        撮影日（Exif）と拡張子をもとにフォルダを自動整理し、完了後に撮影属性アナライズレポートを生成します。
      </p>
    </div>
  )

  const leftColumn = (
    <>
      <Card
        title="入出力フォルダ設定"
        subtitle="取り込み元のSDカードと、保存先のHDD / SSDルートを指定してください"
        icon={<FolderInput className="h-4 w-4" />}
      >
        <div className="flex flex-col gap-4">
          <FolderPickerField
            label="SDカード / コピー元フォルダ"
            value={sourceRoot}
            placeholder="例: E:/DCIM"
            helperText="サブフォルダ内のRAW・JPEG・動画ファイルを再帰的に探索します"
            onChange={setSourceRoot}
            onBrowse={browseSource}
            disabled={isImporting || isScanning}
          />
          <FolderPickerField
            label="HDD / SSD コピー先ルート"
            value={destRoot}
            placeholder="例: D:/Photos"
            helperText="このルート配下にビルダーのパターン構成で自動振り分けされます"
            onChange={setDestRoot}
            onBrowse={browseDest}
            disabled={isImporting}
          />
        </div>
      </Card>

      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
        <button
          type="button"
          aria-expanded={isAdvancedOpen}
          aria-controls={advancedPanelId}
          onClick={() => setIsAdvancedOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 rounded-lg text-left transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-100">
            <SlidersHorizontal
              className="h-4 w-4 shrink-0 text-emerald-400"
              aria-hidden="true"
            />
            <span>詳細設定（振り分けルール・競合解決）</span>
          </span>
          <span
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-slate-400"
            aria-hidden="true"
          >
            <span>{isAdvancedOpen ? '閉じる' : '開く'}</span>
            <ChevronDown
              className={clsx(
                'h-4 w-4 transition-transform duration-150',
                isAdvancedOpen && 'rotate-180'
              )}
            />
          </span>
        </button>

        <div className="mt-2.5 flex flex-col gap-1 border-t border-slate-800/80 pt-2.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
            <span className="text-slate-400">適用中:</span>
            <code className="rounded bg-slate-950/90 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
              {activeTemplateSummary}
            </code>
            <span className="text-slate-600" aria-hidden="true">
              /
            </span>
            <span>{activeConflictLabel}</span>
          </p>
          <p className="text-[11px] text-slate-400">
            ※ ここでの変更は今回の取り込みのみ適用（既定値は「常駐・設定」で変更可）
          </p>
        </div>

        <div
          id={advancedPanelId}
          hidden={!isAdvancedOpen}
          className={clsx(
            isAdvancedOpen && 'mt-4 flex flex-col gap-4 border-t border-slate-800/80 pt-4'
          )}
        >
          {isAdvancedOpen && (
            <>
              <PathBuilderSection
                destRoot={destRoot}
                pathTemplate={pathTemplate}
                presets={presets}
                onChangeTemplate={setPathTemplate}
                onSelectPreset={selectPreset}
                onInsertToken={insertToken}
                disabled={isImporting}
                className="bg-slate-950/50 shadow-none"
              />

              <ConflictPolicySelector
                policy={conflictPolicy}
                onChange={setConflictPolicy}
                disabled={isImporting}
                className="bg-slate-950/50 shadow-none"
              />
            </>
          )}
        </div>
      </section>
    </>
  )

  const rightColumn = (
    <>
      <ImportProgressPanel
        scanPreview={scanPreview}
        progress={progress}
        isScanning={isScanning}
        isImporting={isImporting}
        canScan={canScan}
        canImport={canImport}
        error={error}
        onScan={runScan}
        onStartImport={runImport}
        onClearError={clearError}
      />

      {completedResult && isDigestVisible && (
        <SessionDigestModal
          digest={completedResult.digest}
          onDismiss={dismissDigest}
        />
      )}

      {completedResult && !isDigestVisible && (
        <Card
          title="インポートが完了しました"
          subtitle="自動レポート表示がオフ、またはレポートを閉じた状態です"
          icon={<CheckCircle2 className="h-4 w-4" />}
          className="border-emerald-500/30"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-300">
              {completedResult.digest.headlineSummary}
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<Sparkles className="h-3.5 w-3.5 text-emerald-400" />}
              onClick={openDigest}
              className="shrink-0"
            >
              撮影属性レポートを表示
            </Button>
          </div>
        </Card>
      )}
    </>
  )

  return (
    <ImportSplitTemplate
      header={header}
      leftColumn={leftColumn}
      rightColumn={rightColumn}
      className={className}
    />
  )
}
