import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'

export interface CardProps {
  title?: string
  /** Optional id for the title heading (e.g. for `aria-labelledby`). */
  titleId?: string
  subtitle?: string
  icon?: ReactNode
  headerRight?: ReactNode
  padding?: 'sm' | 'md'
  /**
   * Renders the title as a disclosure toggle. While collapsed, the subtitle,
   * `headerRight`, and children are hidden and only `summary` is shown.
   */
  collapsible?: boolean
  defaultExpanded?: boolean
  /** Always-visible one-line summary shown under the header (used with `collapsible`). */
  summary?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Sleek dark card container with optional header metadata, right-aligned actions,
 * and an optional collapsible (disclosure) mode with a persistent summary line.
 */
export function Card({
  title,
  titleId,
  subtitle,
  icon,
  headerRight,
  padding = 'md',
  collapsible = false,
  defaultExpanded = false,
  summary,
  children,
  className
}: CardProps): ReactElement {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded)
  const contentId = useId()
  const hasHeader = Boolean(title || subtitle || icon || headerRight)
  const sectionClass = clsx(
    'rounded-xl border border-slate-800 bg-slate-900/80 shadow-lg',
    padding === 'sm' ? 'p-4' : 'p-5',
    className
  )
  const iconNode = icon && (
    <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true">
      {icon}
    </span>
  )

  if (collapsible) {
    return (
      <section className={sectionClass}>
        <header className="flex items-start justify-between gap-3">
          <h3 id={titleId} className="min-w-0 flex-1 text-sm font-semibold text-slate-100">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setExpanded((prev) => !prev)}
              className="-m-1 flex w-full min-w-0 items-start gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {iconNode}
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <ChevronDown
                className={clsx(
                  'mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform',
                  expanded && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>
          </h3>
          {headerRight && expanded && <div className="shrink-0">{headerRight}</div>}
        </header>
        {subtitle && expanded && (
          <p className={clsx('mt-1 text-xs text-slate-400', icon && 'pl-[1.625rem]')}>{subtitle}</p>
        )}
        {summary && <div className={clsx('mt-2', icon && 'pl-[1.625rem]')}>{summary}</div>}
        <div id={contentId} hidden={!expanded} className="mt-4">
          {expanded && children}
        </div>
      </section>
    )
  }

  return (
    <section className={sectionClass}>
      {hasHeader && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {iconNode}
            <div className="min-w-0">
              {title && (
                <h3 id={titleId} className="truncate text-sm font-semibold text-slate-100">{title}</h3>
              )}
              {subtitle && (
                <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
              )}
            </div>
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
