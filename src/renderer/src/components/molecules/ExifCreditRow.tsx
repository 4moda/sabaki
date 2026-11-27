import { useEffect, useRef, useState, type ReactElement } from 'react'
import { clsx } from 'clsx'
import { Check, Copy } from 'lucide-react'
import { Button } from '../atoms'

export interface ExifCreditRowProps {
  creditText: string
  fileName?: string
  onCopy?: (text: string) => void | Promise<void>
  className?: string
}

/**
 * Displays a formatted SNS Exif credit string with a one-click copy button and feedback state.
 */
export function ExifCreditRow({
  creditText,
  fileName,
  onCopy,
  className
}: ExifCreditRowProps): ReactElement {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleCopy = async (): Promise<void> => {
    try {
      if (onCopy) {
        await onCopy(creditText)
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(creditText)
      }
      setCopied(true)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write may be unavailable in restricted contexts
    }
  }

  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {fileName && (
          <p className="mb-0.5 truncate text-[11px] font-medium text-slate-400">
            {fileName}
          </p>
        )}
        <p className="truncate font-mono text-xs text-slate-200" title={creditText}>
          {creditText}
        </p>
      </div>
      <Button
        variant={copied ? 'secondary' : 'outline'}
        size="sm"
        icon={
          copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )
        }
        onClick={handleCopy}
        className="shrink-0"
      >
        {copied ? 'コピーしました！' : 'コピー'}
      </Button>
    </div>
  )
}
