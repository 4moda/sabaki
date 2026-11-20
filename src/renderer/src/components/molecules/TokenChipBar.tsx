import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import { SUPPORTED_PATH_TOKENS } from '@core/domain/models/PathTemplate'
import { TokenChip } from '../atoms'

export interface TokenChipBarProps {
  onSelectToken: (token: string) => void
  label?: string
  className?: string
}

/**
 * Interactive bar of all supported path template tokens for one-click insertion.
 */
export function TokenChipBar({
  onSelectToken,
  label = '挿入可能なトークン（クリックで追加）',
  className
}: TokenChipBarProps): ReactElement {
  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {label && <span className="text-xs font-medium text-slate-400">{label}</span>}
      <div className="flex flex-wrap gap-1.5">
        {SUPPORTED_PATH_TOKENS.map((meta) => (
          <TokenChip
            key={meta.token}
            token={meta.token}
            example={meta.example}
            label={meta.label}
            description={meta.description}
            onClick={onSelectToken}
          />
        ))}
      </div>
    </div>
  )
}
