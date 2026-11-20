import { useId, type InputHTMLAttributes, type ReactNode, type ReactElement } from 'react'
import { clsx } from 'clsx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helperText?: string
  rightElement?: ReactNode
}

/**
 * Styled dark text input with optional label, helper text, and trailing element.
 */
export function Input({
  label,
  helperText,
  rightElement,
  className,
  id,
  ...rest
}: InputProps): ReactElement {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-slate-300">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={inputId}
          className={clsx(
            'h-9 w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50',
            rightElement && 'pr-20',
            className
          )}
          {...rest}
        />
        {rightElement && (
          <div className="absolute right-2 flex items-center">{rightElement}</div>
        )}
      </div>
      {helperText && <p className="text-xs text-slate-400">{helperText}</p>}
    </div>
  )
}
