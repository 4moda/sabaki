import { Fragment, type ReactElement, type ReactNode } from 'react'
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

interface SplitPreviewPath {
  rootPart: string
  relativePart: string
  fileName: string
}

/**
 * Splits a resolved preview path into root prefix, relative template path, and filename
 * while keeping the concatenated text identical to `fullPath`.
 */
function splitPreviewPath(fullPath: string, destRoot: string): SplitPreviewPath {
  const lastSepIndex = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'))
  const dirWithSep = lastSepIndex >= 0 ? fullPath.slice(0, lastSepIndex + 1) : ''
  const fileName = lastSepIndex >= 0 ? fullPath.slice(lastSepIndex + 1) : fullPath
  const trimmedRoot = destRoot.replace(/[/\\]+$/, '')

  if (trimmedRoot.length > 0 && dirWithSep.startsWith(trimmedRoot)) {
    const nextChar = dirWithSep[trimmedRoot.length]
    if (nextChar === '/' || nextChar === '\\') {
      return {
        rootPart: dirWithSep.slice(0, trimmedRoot.length + 1),
        relativePart: dirWithSep.slice(trimmedRoot.length + 1),
        fileName
      }
    }
  }

  return {
    rootPart: '',
    relativePart: dirWithSep,
    fileName
  }
}

function renderWithSeparatorBreaks(text: string): ReactNode {
  const parts = text.split(/([/\\])/)
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {(part === '/' || part === '\\') && <wbr />}
    </Fragment>
  ))
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
        {previews.map((item) => {
          const { rootPart, relativePart, fileName } = splitPreviewPath(
            item.fullPath,
            effectiveRoot
          )
          return (
            <li key={item.ext} className="flex items-start gap-2.5 text-xs">
              <Badge
                variant={BADGE_VARIANT_BY_LABEL[item.label] ?? 'default'}
                className="mt-0.5 w-16 shrink-0 justify-center"
              >
                {item.label}
              </Badge>
              <code
                className="min-w-0 flex-1 [overflow-wrap:anywhere] font-mono text-xs leading-relaxed text-slate-200"
                title={item.fullPath}
              >
                {rootPart && (
                  <span className="text-slate-400">
                    {renderWithSeparatorBreaks(rootPart)}
                  </span>
                )}
                {relativePart && (
                  <span className="text-emerald-300">
                    {renderWithSeparatorBreaks(relativePart)}
                  </span>
                )}
                <span className="font-semibold text-slate-100">{fileName}</span>
              </code>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
