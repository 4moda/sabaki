import type { ReactElement, ReactNode } from 'react'
import { clsx } from 'clsx'

export interface CardProps {
  title?: string
  subtitle?: string
  icon?: ReactNode
  headerRight?: ReactNode
  padding?: 'sm' | 'md'
  children: ReactNode
  className?: string
}

/**
 * Sleek dark card container with optional header metadata and right-aligned actions.
 */
export function Card({
  title,
  subtitle,
  icon,
  headerRight,
  padding = 'md',
  children,
  className
}: CardProps): ReactElement {
  const hasHeader = Boolean(title || subtitle || icon || headerRight)

  return (
    <section
      className={clsx(
        'rounded-xl border border-slate-800 bg-slate-900/80 shadow-lg',
        padding === 'sm' ? 'p-4' : 'p-5',
        className
      )}
    >
      {hasHeader && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && (
              <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="truncate text-sm font-semibold text-slate-100">{title}</h3>
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
