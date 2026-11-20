import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import { RotateCcw, X } from 'lucide-react'
import type { DashboardFilter } from '@core/domain/models/DashboardAnalytics'
import type { MediaType } from '@core/domain/models/MediaFile'
import { Badge, Button, Select, Switch, type SelectOption } from '../atoms'

export interface FilterBarGroupProps {
  years: number[]
  cameras: string[]
  lenses: string[]
  selectedYear?: number
  selectedCamera?: string
  selectedLens?: string
  selectedMediaType?: MediaType
  use35mmEquivalent: boolean
  specificDay?: string
  onFilterChange: (patch: Partial<DashboardFilter>) => void
  onReset: () => void
  className?: string
}

const MEDIA_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'すべて' },
  { value: 'RAW', label: 'RAW' },
  { value: 'JPEG', label: 'JPEG' },
  { value: 'VIDEO', label: 'VIDEO' }
]

/**
 * Multi-dimensional filter bar for the Exif Analytics Dashboard.
 */
export function FilterBarGroup({
  years,
  cameras,
  lenses,
  selectedYear,
  selectedCamera,
  selectedLens,
  selectedMediaType,
  use35mmEquivalent,
  specificDay,
  onFilterChange,
  onReset,
  className
}: FilterBarGroupProps): ReactElement {
  const yearOptions: SelectOption[] = [
    { value: '', label: '全期間' },
    ...years.map((y) => ({ value: String(y), label: `${y}年` }))
  ]

  const cameraOptions: SelectOption[] = [
    { value: '', label: 'すべてのカメラ' },
    ...cameras.map((cam) => ({ value: cam, label: cam }))
  ]

  const lensOptions: SelectOption[] = [
    { value: '', label: 'すべてのレンズ' },
    ...lenses.map((lens) => ({ value: lens, label: lens }))
  ]

  return (
    <div
      className={clsx(
        'flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg',
        className
      )}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="撮影年"
          value={selectedYear !== undefined ? String(selectedYear) : ''}
          options={yearOptions}
          onChange={(val) =>
            onFilterChange({ year: val ? Number(val) : undefined })
          }
        />
        <Select
          label="カメラボディ"
          value={selectedCamera ?? ''}
          options={cameraOptions}
          onChange={(val) =>
            onFilterChange({ cameraModel: val || undefined })
          }
        />
        <Select
          label="レンズ"
          value={selectedLens ?? ''}
          options={lensOptions}
          onChange={(val) =>
            onFilterChange({ lensModel: val || undefined })
          }
        />
        <Select
          label="メディア種別"
          value={selectedMediaType ?? ''}
          options={MEDIA_TYPE_OPTIONS}
          onChange={(val) =>
            onFilterChange({
              mediaType: (val || undefined) as MediaType | undefined
            })
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
        <div className="flex flex-wrap items-center gap-4">
          <Switch
            checked={use35mmEquivalent}
            onChange={(checked) =>
              onFilterChange({ use35mmEquivalent: checked })
            }
            label="35mm換算焦点距離で集計"
          />
          {specificDay && (
            <Badge variant="amber" className="gap-1.5">
              <span>日付指定: {specificDay}</span>
              <button
                type="button"
                onClick={() => onFilterChange({ specificDay: undefined })}
                aria-label="日付指定を解除"
                className="rounded-full p-0.5 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={onReset}
        >
          フィルタをリセット
        </Button>
      </div>
    </div>
  )
}
