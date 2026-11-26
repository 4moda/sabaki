import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import {
  generateRealtimePreviews,
  splitTargetPathForDisplay
} from '@core/domain/services/PathBuilderDomainService'
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
 * The shared destination root is shown once (elided when long) so the template-expanded
 * part (date folders, extension folder, file name) stays fully visible per media type.
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

  const rootPath = splitTargetPathForDisplay(effectiveRoot, previews[0]?.fullPath ?? '').rootPath

  return (
    <div
      className={clsx(
        'rounded-lg border border-slate-800 bg-slate-950/70 p-3',
        className
      )}
    >
      <div className="mb-2 flex min-w-0 items-baseline gap-2 text-xs">
        <p className="shrink-0 font-medium text-slate-400">出力パスプレビュー</p>
        {rootPath && (
          <code
            className="min-w-0 truncate font-mono text-slate-500"
            title={rootPath}
          >
            {rootPath}
          </code>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {previews.map((item) => {
          const { relativePath, separator } = splitTargetPathForDisplay(
            effectiveRoot,
            item.fullPath
          )
          return (
            <li key={item.ext} className="flex items-start gap-2.5 text-xs">
              <Badge
                variant={BADGE_VARIANT_BY_LABEL[item.label] ?? 'default'}
                className="w-16 justify-center shrink-0"
              >
                {item.label}
              </Badge>
              <code
                className="min-w-0 break-all pt-0.5 font-mono leading-relaxed text-slate-100"
                title={item.fullPath}
              >
                {rootPath && <span className="text-slate-500">…{separator}</span>}
                {relativePath}
              </code>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
