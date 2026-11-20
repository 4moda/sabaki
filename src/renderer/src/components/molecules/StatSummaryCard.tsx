import type { ReactElement, ReactNode } from 'react'
import { Card, StatValue, type StatAccent } from '../atoms'

export interface StatSummaryCardProps {
  label: string
  value: string | number
  subValue?: string
  icon?: ReactNode
  accent?: StatAccent
  className?: string
}

/**
 * KPI summary card combining Card and StatValue atoms.
 */
export function StatSummaryCard({
  label,
  value,
  subValue,
  icon,
  accent = 'emerald',
  className
}: StatSummaryCardProps): ReactElement {
  return (
    <Card padding="sm" className={className}>
      <StatValue
        label={label}
        value={value}
        subValue={subValue}
        icon={icon}
        accent={accent}
      />
    </Card>
  )
}
