import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import {
  CONFLICT_MODES_META,
  type ConflictPolicyConfig,
  type ConflictResolutionMode
} from '@core/domain/models'
import { Badge, Card, Switch } from '../atoms'

export interface ConflictPolicySelectorProps {
  policy: ConflictPolicyConfig
  onChange: (policy: ConflictPolicyConfig) => void
  disabled?: boolean
  /** Collapses the section behind a disclosure toggle with an always-visible summary. */
  collapsible?: boolean
  summary?: ReactNode
  className?: string
}

/**
 * Duplicate & filename collision policy selector with DB history skip toggle
 * and selectable cards for all 4 conflict resolution modes.
 */
export function ConflictPolicySelector({
  policy,
  onChange,
  disabled = false,
  collapsible = false,
  summary,
  className
}: ConflictPolicySelectorProps): ReactElement {
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectedIndex = CONFLICT_MODES_META.findIndex(
    (meta) => meta.mode === policy.fileConflictMode
  )
  const activeTabIndex = selectedIndex >= 0 ? selectedIndex : 0

  const handleToggleHistory = (checked: boolean) => {
    onChange({
      ...policy,
      skipHistoryDuplicates: checked
    })
  }

  const handleSelectMode = (mode: ConflictResolutionMode) => {
    if (disabled) return
    onChange({
      ...policy,
      fileConflictMode: mode
    })
  }

  const handleRadioKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (disabled) return

    let targetIndex: number | null = null
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      targetIndex = (index + 1) % CONFLICT_MODES_META.length
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      targetIndex = (index - 1 + CONFLICT_MODES_META.length) % CONFLICT_MODES_META.length
    }

    if (targetIndex === null) return

    event.preventDefault()
    const targetMeta = CONFLICT_MODES_META[targetIndex]
    handleSelectMode(targetMeta.mode)
    radioRefs.current[targetIndex]?.focus()
  }

  return (
    <Card
      title="重複検知・競合解決ポリシー"
      subtitle="二重取り込みの防止と、保存先に同名ファイルが存在した場合の挙動を設定します"
      collapsible={collapsible}
      summary={summary}
      icon={<ShieldCheck className="h-4 w-4" />}
      className={className}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
          <Switch
            checked={policy.skipHistoryDuplicates}
            onChange={handleToggleHistory}
            disabled={disabled}
            label="DB履歴による重複スキップ（過去に取り込み済みのハッシュを自動スキップ）"
            description="過去にSabakiで取り込んだ同一SHA-256ハッシュのファイルを自動検出し、SDカード差し直し時の重複コピーを防ぎます。"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-300">
            同名ファイル競合時の処理モード（4種類）
          </span>

          <div role="radiogroup" aria-label="同名ファイル競合時の処理モード" className="grid grid-cols-1 gap-2.5">
            {CONFLICT_MODES_META.map((meta, index) => {
              const isSelected = policy.fileConflictMode === meta.mode
              const isOverwrite = meta.mode === 'overwrite'

              return (
                <button
                  key={meta.mode}
                  ref={(el) => {
                    radioRefs.current[index] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={index === activeTabIndex ? 0 : -1}
                  disabled={disabled}
                  onClick={() => handleSelectMode(meta.mode)}
                  onKeyDown={(e) => handleRadioKeyDown(e, index)}
                  className={clsx(
                    'flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50',
                    isSelected
                      ? isOverwrite
                        ? 'border-rose-500/70 bg-rose-950/25'
                        : 'border-emerald-500/70 bg-emerald-950/25'
                      : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      isSelected
                        ? isOverwrite
                          ? 'border-rose-400 bg-rose-500/20 text-rose-300'
                          : 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : 'border-slate-600 bg-slate-900'
                    )}
                    aria-hidden="true"
                  >
                    {isSelected && <CheckCircle2 className="h-3 w-3" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-pretty text-slate-100">{meta.title}</span>
                      {meta.recommended && <Badge variant="emerald">推奨</Badge>}
                      {isOverwrite && (
                        <Badge variant="rose">
                          <AlertTriangle className="h-3 w-3" />
                          注意
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {meta.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}
