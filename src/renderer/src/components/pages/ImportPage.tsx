import { useEffect, type ReactElement } from 'react'
import { CheckCircle2, FolderInput, Sparkles } from 'lucide-react'
import {
  getSessionOverrides,
  summarizeConflictPolicy,
  summarizePathTemplate,
  useImportSessionContext
} from '../../hooks'
import { Button, Card } from '../atoms'
import { FolderPickerField, SessionSettingSummary } from '../molecules'
import {
  ConflictPolicySelector,
  ImportProgressPanel,
  PathBuilderSection,
  SessionDigestModal
} from '../organisms'
import { ImportSplitTemplate } from '../templates'

export interface ImportPageProps {
  className?: string
}

/**
 * Full SD card import page combining folder selection, pre-scan / live progress panel,
 * post-import Session Attribute Digest report, and collapsible advanced settings
 * (PathBuilder & 4-mode ConflictPolicySelector) that apply to the current import only.
 *
 * Session state comes from {@link useImportSessionContext} (provided above the tab switch),
 * so inputs, scan results, progress, and reports survive tab navigation.
 */
export function ImportPage({ className }: ImportPageProps): ReactElement {
  const {
    sourceRoot,
    setSourceRoot,
    destRoot,
    setDestRoot,
    pathTemplate,
    setPathTemplate,
    conflictPolicy,
    setConflictPolicy,
    persistedDefaults,
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
    clearError,
    refreshPersistedDefaults
  } = useImportSessionContext()

  // Pick up defaults changed in 「常駐・設定」 while away (temporary overrides are kept)
  useEffect(() => {
    void refreshPersistedDefaults()
  }, [refreshPersistedDefaults])

  const overrides = getSessionOverrides({ pathTemplate, conflictPolicy }, persistedDefaults)

  const canScan = sourceRoot.trim().length > 0
  const canImport = sourceRoot.trim().length > 0 && destRoot.trim().length > 0

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
    </>
  )

  const advancedSettings = (
    <>
      <p className="-mb-3 px-1 text-xs text-slate-400">
        詳細設定：ここでの変更は今回の取込にのみ適用され、保存されません。既定値は「常駐・設定」で変更できます。
      </p>

      <PathBuilderSection
        destRoot={destRoot}
        pathTemplate={pathTemplate}
        presets={presets}
        onChangeTemplate={setPathTemplate}
        onSelectPreset={selectPreset}
        onInsertToken={insertToken}
        disabled={isImporting}
        collapsible
        summary={
          <SessionSettingSummary
            text={summarizePathTemplate(pathTemplate, presets)}
            isOverridden={overrides.pathTemplate}
            onRestoreDefault={() => setPathTemplate(persistedDefaults.pathTemplate)}
            disabled={isImporting}
            monospace
          />
        }
      />

      <ConflictPolicySelector
        policy={conflictPolicy}
        onChange={setConflictPolicy}
        disabled={isImporting}
        collapsible
        summary={
          <SessionSettingSummary
            text={summarizeConflictPolicy(conflictPolicy)}
            isOverridden={overrides.conflictPolicy}
            onRestoreDefault={() => setConflictPolicy(persistedDefaults.conflictPolicy)}
            disabled={isImporting}
          />
        }
      />
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
      leftColumnSecondary={advancedSettings}
      className={className}
    />
  )
}
