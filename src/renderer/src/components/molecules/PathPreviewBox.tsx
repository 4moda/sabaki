import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import { generateRealtimePreviews } from '@core/domain/services/PathBuilderDomainService'
import { Badge, type BadgeVariant } from '../atoms'

export interface PathPreviewBoxProps {
  destRoot: string
  template: string
  sampleDate?: Date
  className?: string
}

const BADGE_VARIANT_BY_LABEL: Record<string, BadgeVariant> = {
  RAW: 'amber',
  JPEG: 'emerald',
  VIDEO: 'sky'
}

/**
 * Live realtime preview box showing resolved destination paths for RAW, JPEG, and VIDEO files.
 */
export function PathPreviewBox({
  destRoot,
  template,
  sampleDate,
  className
}: PathPreviewBoxProps): ReactElement {
  const effectiveRoot = destRoot.trim() || 'D:/Photos'
  const effectiveTemplate = template.trim() || '{YYYY}/{YYYY-MM-DD}/{Ext}'
  const previews = generateRealtimePreviews(effectiveRoot, effectiveTemplate, sampleDate)

  return (
    <div
      className={clsx(
        'rounded-lg border border-slate-800 bg-slate-950/70 p-3',
        className
      )}
    >
      <p className="mb-2 text-xs font-medium text-slate-400">出力パスプレビュー</p>
      <ul className="flex flex-col gap-2">
        {previews.map((item) => (
          <li key={item.ext} className="flex items-center gap-2.5 text-xs">
            <Badge variant={BADGE_VARIANT_BY_LABEL[item.label] ?? 'default'} className="w-16 justify-center shrink-0">
              {item.label}
            </Badge>
            <code className="min-w-0 truncate font-mono text-slate-200" title={item.fullPath}>
              {item.fullPath}
            </code>
          </li>
        ))}
      </ul>
    </div>
  )
}
