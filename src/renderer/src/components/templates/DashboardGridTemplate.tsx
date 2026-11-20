import type { ReactElement, ReactNode } from 'react'
import { clsx } from 'clsx'

export interface DashboardGridTemplateProps {
  filterBar: ReactNode
  kpiRow: ReactNode
  heatmapSection: ReactNode
  gearSection: ReactNode
  opticalSection: ReactNode
  exportSection?: ReactNode
  className?: string
}

/**
 * Structured layout template for the Exif Analytics Dashboard.
 */
export function DashboardGridTemplate({
  filterBar,
  kpiRow,
  heatmapSection,
  gearSection,
  opticalSection,
  exportSection,
  className
}: DashboardGridTemplateProps): ReactElement {
  return (
    <div className={clsx('flex flex-col gap-6', className)}>
      <section aria-label="分析フィルタ">{filterBar}</section>
      <section aria-label="KPIサマリー">{kpiRow}</section>
      <section aria-label="撮影アクティビティヒートマップ">{heatmapSection}</section>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section aria-label="機材統計">{gearSection}</section>
        <section aria-label="光学統計">{opticalSection}</section>
      </div>
      {exportSection && (
        <section aria-label="SNS・Webエクスポート">{exportSection}</section>
      )}
    </div>
  )
}
