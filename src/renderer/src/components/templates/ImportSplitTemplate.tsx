import type { ReactElement, ReactNode } from 'react'
import { clsx } from 'clsx'

export interface ImportSplitTemplateProps {
  leftColumn: ReactNode
  rightColumn: ReactNode
  /**
   * Optional content placed under `leftColumn` in the 2-column layout.
   * In the 1-column layout it is rendered after `rightColumn`, so the primary
   * execution panel stays right below the folder inputs on narrow windows.
   */
  leftColumnSecondary?: ReactNode
  header?: ReactNode
  className?: string
}

/**
 * 2-column responsive layout template for the Import view
 * (left: folders & advanced settings; right: scan preview, progress & session digest).
 *
 * Below `xl` (the window minimum is 960px and the sidebar takes 256px) the layout collapses
 * to a single column ordered as: leftColumn -> rightColumn -> leftColumnSecondary.
 */
export function ImportSplitTemplate({
  leftColumn,
  rightColumn,
  leftColumnSecondary,
  header,
  className
}: ImportSplitTemplateProps): ReactElement {
  return (
    <div className={clsx('flex flex-col gap-6', className)}>
      {header && <div>{header}</div>}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2 xl:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">
          {leftColumn}
        </div>
        <div className="flex min-w-0 flex-col gap-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {rightColumn}
        </div>
        {leftColumnSecondary && (
          <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-2">
            {leftColumnSecondary}
          </div>
        )}
      </div>
    </div>
  )
}
