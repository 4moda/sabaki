import type { ReactElement } from 'react'
import { clsx } from 'clsx'

export interface TokenChipProps {
  token: string
  example?: string
  label?: string
  description?: string
  onClick: (token: string) => void
  className?: string
}

/**
 * Interactive path-template token pill button displaying token syntax and example preview.
 */
export function TokenChip({
  token,
  example,
  label,
  description,
  onClick,
  className
}: TokenChipProps): ReactElement {
  const tooltip = description
    ? `${description}${example ? ` (例: ${example})` : ''}`
    : example
      ? `${token} (例: ${example})`
      : token

  return (
    <button
      type="button"
      onClick={() => onClick(token)}
      title={tooltip}
      className={clsx(
        'group inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1.5 text-left transition-colors hover:border-emerald-500/60 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        className
      )}
    >
      <code className="font-mono text-xs font-semibold text-emerald-300 group-hover:text-emerald-200">
        {token}
      </code>
      {(example || label) && (
        <span className="text-[11px] text-slate-400 group-hover:text-slate-300">
          {example ?? label}
        </span>
      )}
    </button>
  )
}
