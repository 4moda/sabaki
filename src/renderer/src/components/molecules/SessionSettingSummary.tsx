import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import { RotateCcw } from 'lucide-react'
import { Badge, Button } from '../atoms'

export interface SessionSettingSummaryProps {
  /** One-line description of the currently applied value. */
  text: string
  /** True when the value was changed on the Import page (temporary, not persisted). */
  isOverridden: boolean
  onRestoreDefault?: () => void
  disabled?: boolean
  monospace?: boolean
  className?: string
}

/**
 * One-line summary of an import-time setting, showing whether the applied value is the
 * persisted default (「常駐・設定」) or a temporary override for the current import only.
 */
export function SessionSettingSummary({
  text,
  isOverridden,
  onRestoreDefault,
  disabled = false,
  monospace = false,
  className
}: SessionSettingSummaryProps): ReactElement {
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs', className)}>
      <span
        className={clsx('min-w-0 break-all text-slate-200', monospace && 'font-mono')}
        title={text}
      >
        {text}
      </span>
      {isOverridden ? (
        <Badge variant="amber">今回の取込のみ（未保存）</Badge>
      ) : (
        <Badge variant="default">既定値（常駐・設定）</Badge>
      )}
      {isOverridden && onRestoreDefault && (
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={onRestoreDefault}
          disabled={disabled}
        >
          既定値に戻す
        </Button>
      )}
    </div>
  )
}
