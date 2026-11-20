import type { ReactElement, ReactNode } from 'react'
import { clsx } from 'clsx'

export interface ImportSplitTemplateProps {
  leftColumn: ReactNode
  rightColumn: ReactNode
  header?: ReactNode
  className?: string
}

/**
 * 2-column responsive layout template for the Import view
 * (left: folders, path builder & conflict policy; right: scan preview, progress & session digest).
 */
export function ImportSplitTemplate({
  leftColumn,
  rightColumn,
  header,
  className
}: ImportSplitTemplateProps): ReactElement {
  return (
    <div className={clsx('flex flex-col gap-6', className)}>
      {header && <div>{header}</div>}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-6">{leftColumn}</div>
        <div className="flex flex-col gap-6 xl:col-span-6">{rightColumn}</div>
      </div>
    </div>
  )
}
