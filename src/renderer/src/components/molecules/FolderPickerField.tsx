import { useId, type ReactElement } from 'react'
import { clsx } from 'clsx'
import { FolderOpen } from 'lucide-react'
import { Button, Input } from '../atoms'

export interface FolderPickerFieldProps {
  label: string
  value: string
  placeholder?: string
  helperText?: string
  onChange: (value: string) => void
  onBrowse: () => void
  disabled?: boolean
  className?: string
}

/**
 * Folder selection input combining a text Input and a browse Button ("参照...").
 */
export function FolderPickerField({
  label,
  value,
  placeholder,
  helperText,
  onChange,
  onBrowse,
  disabled = false,
  className
}: FolderPickerFieldProps): ReactElement {
  const inputId = useId()

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-xs font-medium text-slate-300">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            id={inputId}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          icon={<FolderOpen className="h-4 w-4" />}
          onClick={onBrowse}
          disabled={disabled}
          className="shrink-0"
        >
          参照...
        </Button>
      </div>
      {helperText && <p className="text-xs text-slate-400">{helperText}</p>}
    </div>
  )
}
