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
 * The shared destination root is shown once in the header, and each row shows only the
 * template-expanded part (date folders, extension folder, file name) in full, wrapping
 * instead of eliding, so RAW / JPEG / VIDEO routing stays distinguishable.
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

  const { rootPath, separator } = splitTargetPathForDisplay(
    effectiveRoot,
    previews[0]?.fullPath ?? ''
  )

  return (
    <div
      className={clsx(
        'rounded-lg border border-slate-800 bg-slate-950/70 p-3',
        className
      )}
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        <p className="shrink-0 font-medium text-slate-400">出力パスプレビュー</p>
        {rootPath && (
          <p className="min-w-0 break-all text-slate-500">
            <code data-testid="path-preview-root" className="font-mono">
              {rootPath}
              {separator}
            </code>{' '}
            配下
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {previews.map((item) => {
          const { relativePath } = splitTargetPathForDisplay(
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
                data-testid="path-preview-relative"
                className="min-w-0 break-all pt-0.5 font-mono leading-relaxed text-slate-100"
                title={item.fullPath}
              >
                {relativePath}
              </code>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
