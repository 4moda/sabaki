import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { clsx } from 'clsx'
import {
  Aperture,
  Camera,
  Check,
  Copy,
  Focus,
  Share2,
  Sparkles,
  X
} from 'lucide-react'
import type { SessionDigest } from '@core/domain/models'
import { Badge, Button, Card } from '../atoms'
import { formatBytes } from './ImportProgressPanel'

export interface SessionDigestModalProps {
  digest: SessionDigest
  onDismiss?: () => void
  variant?: 'panel' | 'modal'
  className?: string
}

function formatRatioPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0%'
  const normalized = ratio <= 1 ? ratio * 100 : ratio
  return `${Math.round(normalized)}%`
}

/**
 * Strips leading camera/sparkle emojis from the headline banner text so the
 * adjacent <Sparkles /> icon is not visually duplicated.
 */
function formatHeadlineForDisplay(headlineSummary: string): string {
  return headlineSummary
    .replace(/^(?:[\u{1F4F7}\u{1F4F8}\u{1F3A5}\u{1F4F9}\u2728]\uFE0F?\s*)+/u, '')
    .trimStart()
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const hasLayout = document.documentElement.getBoundingClientRect().width > 0
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
        return false
      }
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false
      }
      return hasLayout ? el.getClientRects().length > 0 : true
    }
  )
}

/**
 * Post-import "Session Attribute Digest" report card / modal displaying
 * shooting style tags, main camera & lens shares, focal length sweet spots,
 * wide-aperture ratio, import outcome counts, and one-click SNS caption copy.
 */
export function SessionDigestModal({
  digest,
  onDismiss,
  variant = 'panel',
  className
}: SessionDigestModalProps): ReactElement {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const pointerDownInsideRef = useRef(false)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  const isModal = variant === 'modal'

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isModal) {
      return
    }
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    const activeBeforeOpen = document.activeElement
    if (activeBeforeOpen instanceof HTMLElement && !dialog.contains(activeBeforeOpen)) {
      previouslyFocusedRef.current = activeBeforeOpen
    }

    const closeButton = dialog.querySelector<HTMLButtonElement>(
      'button[aria-label="レポートを閉じる"]'
    )
    const initialTarget = closeButton ?? getFocusableElements(dialog)[0] ?? dialog
    initialTarget.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (event.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        onDismissRef.current?.()
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        const focusables = getFocusableElements(dialog)
        if (focusables.length === 0) {
          dialog.focus({ preventScroll: true })
          return
        }

        const current = document.activeElement as HTMLElement | null
        const currentIndex = current ? focusables.indexOf(current) : -1
        const nextIndex = event.shiftKey
          ? currentIndex <= 0
            ? focusables.length - 1
            : currentIndex - 1
          : currentIndex === -1 || currentIndex >= focusables.length - 1
            ? 0
            : currentIndex + 1

        focusables[nextIndex].focus()
      }
    }

    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target as Node | null
      if (target && !dialog.contains(target)) {
        const focusables = getFocusableElements(dialog)
        ;(focusables[0] ?? dialog).focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
      const prev = previouslyFocusedRef.current
      previouslyFocusedRef.current = null
      if (prev && prev.isConnected && typeof prev.focus === 'function') {
        prev.focus({ preventScroll: true })
      }
    }
  }, [isModal])

  const handleCopySnsText = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(digest.snsShareText)
      }
      setCopied(true)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch {
      // Fallback: keep UI responsive even if clipboard permission is unavailable
      setCopied(false)
    }
  }, [digest.snsShareText])

  const sortedExtensions = Object.entries(digest.extBreakdown).sort((a, b) => b[1] - a[1])
  const displayHeadline = formatHeadlineForDisplay(digest.headlineSummary)

  const dismissButton = onDismiss ? (
    <Button
      variant="ghost"
      size="sm"
      icon={<X className="h-3.5 w-3.5" />}
      onClick={onDismiss}
      aria-label="レポートを閉じる"
    >
      閉じる
    </Button>
  ) : undefined

  const digestBody = (
    <div className={clsx('flex flex-col', isModal ? 'gap-3' : 'gap-5')}>
      {/* Headline summary banner */}
      <div
        className={clsx(
          'rounded-xl border border-emerald-500/30 bg-emerald-500/10',
          isModal ? 'px-3.5 py-2.5' : 'p-4'
        )}
      >
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <p
            className={clsx(
              'text-sm font-semibold text-emerald-100',
              isModal ? 'leading-snug' : 'leading-relaxed'
            )}
          >
            {displayHeadline}
          </p>
        </div>
      </div>

      {/* Shooting style tags */}
      {digest.styleTags.length > 0 && (
        <div className={clsx('flex flex-col', isModal ? 'gap-1.5' : 'gap-2')}>
          <h4 className="text-xs font-medium text-slate-400">検出された撮影スタイル傾向</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {digest.styleTags.map((tag) => (
              <div
                key={tag.id}
                className={clsx(
                  'flex items-start rounded-lg border border-slate-800 bg-slate-950/70',
                  isModal ? 'gap-2 px-3 py-2' : 'gap-2.5 p-3'
                )}
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {tag.emoji}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100">{tag.label}</p>
                  <p
                    className={clsx(
                      'mt-0.5 text-[11px] text-slate-400',
                      isModal ? 'leading-snug' : 'leading-relaxed'
                    )}
                  >
                    {tag.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Camera / Lens / Focal Length / Wide Aperture highlights */}
      <div className={clsx('grid grid-cols-1 sm:grid-cols-2', isModal ? 'gap-2.5' : 'gap-3')}>
        {/* Main Camera */}
        <div
          className={clsx(
            'rounded-lg border border-slate-800 bg-slate-950/60',
            isModal ? 'px-3 py-2.5' : 'p-3.5'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Camera className="h-3.5 w-3.5 text-emerald-400" />
              メインカメラ
            </span>
            {digest.topCamera && (
              <Badge variant="emerald">
                {formatRatioPercent(digest.topCamera.ratio)} ({digest.topCamera.count}枚)
              </Badge>
            )}
          </div>
          <p
            className={clsx(
              'truncate text-sm font-semibold text-slate-100',
              isModal ? 'mt-1' : 'mt-1.5'
            )}
          >
            {digest.topCamera?.model ?? 'Exif情報なし'}
          </p>
        </div>

        {/* Main Lens */}
        <div
          className={clsx(
            'rounded-lg border border-slate-800 bg-slate-950/60',
            isModal ? 'px-3 py-2.5' : 'p-3.5'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Aperture className="h-3.5 w-3.5 text-indigo-400" />
              メインレンズ
            </span>
            {digest.topLens && (
              <Badge variant="indigo">
                {formatRatioPercent(digest.topLens.ratio)} ({digest.topLens.count}枚)
              </Badge>
            )}
          </div>
          <p
            className={clsx(
              'truncate text-sm font-semibold text-slate-100',
              isModal ? 'mt-1' : 'mt-1.5'
            )}
          >
            {digest.topLens?.model ?? 'Exif情報なし'}
          </p>
        </div>

        {/* Sweet-spot Focal Lengths */}
        <div
          className={clsx(
            'rounded-lg border border-slate-800 bg-slate-950/60',
            isModal ? 'px-3 py-2.5' : 'p-3.5'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Focus className="h-3.5 w-3.5 text-sky-400" />
            <span>主力焦点距離（スイートスポット）</span>
          </div>
          {digest.topFocalLengths.length > 0 ? (
            <div className={clsx('flex flex-wrap gap-1.5', isModal ? 'mt-1.5' : 'mt-2')}>
              {digest.topFocalLengths.map((item) => (
                <Badge key={item.focalLength} variant="sky" className="font-mono">
                  {item.focalLength}mm ({formatRatioPercent(item.ratio)})
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">データなし</p>
          )}
        </div>

        {/* Wide-aperture usage ratio */}
        <div
          className={clsx(
            'rounded-lg border border-slate-800 bg-slate-950/60',
            isModal ? 'px-3 py-2.5' : 'p-3.5'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Aperture className="h-3.5 w-3.5 text-amber-400" />
            <span>大口径・開放撮影率（F2.8以下）</span>
          </div>
          <div className={clsx('flex items-baseline gap-2', isModal ? 'mt-1' : 'mt-1.5')}>
            <span className="text-xl font-bold tabular-nums text-amber-300">
              {formatRatioPercent(digest.wideApertureRatio)}
            </span>
            <span className="text-xs text-slate-400">
              合計 {digest.totalFiles.toLocaleString()}件 / {formatBytes(digest.totalBytes)}
            </span>
          </div>
        </div>
      </div>

      {/* Copy / Skip / Rename / Overwrite summary & extension breakdown */}
      <div
        className={clsx(
          'flex flex-col rounded-lg border border-slate-800 bg-slate-950/50',
          isModal ? 'gap-1.5 px-3 py-2.5' : 'gap-2.5 p-3.5'
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="emerald">コピー {digest.copiedFiles.toLocaleString()}</Badge>
          <Badge variant="sky">スキップ {digest.skippedFiles.toLocaleString()}</Badge>
          <Badge variant="amber">リネーム {digest.renamedFiles.toLocaleString()}</Badge>
          <Badge variant="indigo">上書き {digest.overwrittenFiles.toLocaleString()}</Badge>
          {digest.errorFiles > 0 && (
            <Badge variant="rose">エラー {digest.errorFiles.toLocaleString()}</Badge>
          )}
        </div>

        {sortedExtensions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400">拡張子:</span>
            {sortedExtensions.map(([ext, count]) => (
              <Badge key={ext} variant="default" className="font-mono">
                .{ext} {count.toLocaleString()}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* One-click SNS share text preview & copy button */}
      <div
        className={clsx(
          'flex flex-col rounded-xl border border-indigo-500/25 bg-indigo-950/20',
          isModal ? 'gap-2 px-3.5 py-2.5' : 'gap-2.5 p-4'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200">
            <Share2 className="h-3.5 w-3.5 text-indigo-400" />
            今日の撮影ログをSNS用にワンクリックコピー
          </span>
          <Button
            variant={copied ? 'primary' : 'secondary'}
            size="sm"
            icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            onClick={handleCopySnsText}
          >
            {copied ? 'コピーしました！' : 'SNSテキストをコピー'}
          </Button>
        </div>
        <pre
          className={clsx(
            'overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800/90 bg-slate-950/80 font-sans text-xs text-slate-200',
            isModal ? 'max-h-36 px-3 py-2 leading-snug' : 'max-h-40 p-3 leading-relaxed'
          )}
        >
          {digest.snsShareText}
        </pre>
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="今回の撮影属性アナライズレポート"
        tabIndex={-1}
        onMouseDown={(event) => {
          pointerDownInsideRef.current = event.target !== event.currentTarget
        }}
        onClick={(event) => {
          const startedInside = pointerDownInsideRef.current
          pointerDownInsideRef.current = false
          if (!startedInside && event.target === event.currentTarget) {
            onDismiss?.()
          }
        }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm focus:outline-none"
      >
        <section
          className={clsx(
            'flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-2xl',
            className
          )}
        >
          <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/95 px-5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0 text-emerald-400" aria-hidden="true">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-100">
                  今回の撮影属性アナライズレポート
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">Session Attribute Digest</p>
              </div>
            </div>
            {dismissButton && <div className="shrink-0">{dismissButton}</div>}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3.5">{digestBody}</div>
        </section>
      </div>
    )
  }

  return (
    <Card
      title="今回の撮影属性アナライズレポート"
      subtitle="Session Attribute Digest"
      icon={<Sparkles className="h-4 w-4" />}
      headerRight={dismissButton}
      className={clsx(
        'border-emerald-500/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95',
        className
      )}
    >
      {digestBody}
    </Card>
  )
}
