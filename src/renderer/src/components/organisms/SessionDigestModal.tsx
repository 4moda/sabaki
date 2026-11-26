import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
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
import { useModalDialog } from '../../hooks'
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
  const isModal = variant === 'modal'
  const titleId = useId()
  const { dialogRef, overlayProps } = useModalDialog({ enabled: isModal, onClose: onDismiss })
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

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

  // Modal is compacted so the whole report fits a 1280x840 window; panel keeps the roomier layout.
  const statTileClass = clsx(
    'rounded-lg border border-slate-800 bg-slate-950/60',
    isModal ? 'px-3 py-2.5' : 'p-3.5'
  )

  const cardContent = (
    <Card
      title="今回の撮影属性アナライズレポート"
      titleId={titleId}
      padding={isModal ? 'sm' : 'md'}
      subtitle="Session Attribute Digest"
      icon={<Sparkles className="h-4 w-4" />}
      headerRight={
        onDismiss ? (
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
      }
      className={clsx(
        'border-emerald-500/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95',
        // Modal: header stays put while only the body scrolls within the viewport
        isModal && 'flex min-h-0 flex-col',
        className
      )}
    >
      <div
        className={clsx(
          'flex flex-col',
          isModal ? '-mr-2 min-h-0 flex-1 gap-3 overflow-y-auto pr-2' : 'gap-5'
        )}
      >
        {/* Headline summary banner (headlineSummary already leads with its own emoji) */}
        <div
          className={clsx(
            'rounded-xl border border-emerald-500/30 bg-emerald-500/10',
            isModal ? 'px-3.5 py-2.5' : 'p-4'
          )}
        >
          <p className="text-sm font-semibold leading-relaxed text-emerald-100">
            {digest.headlineSummary}
          </p>
        </div>

        {/* Shooting style tags */}
        {digest.styleTags.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-slate-400">検出された撮影スタイル傾向</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {digest.styleTags.map((tag) => (
                <div
                  key={tag.id}
                  className={clsx(
                    'flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-950/70',
                    isModal ? 'px-3 py-2' : 'p-3'
                  )}
                >
                  <span className="text-lg leading-none" aria-hidden="true">
                    {tag.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100">{tag.label}</p>
                    <p
                      className={clsx(
                        'mt-0.5 text-[11px] leading-relaxed text-slate-400',
                        isModal && 'line-clamp-1'
                      )}
                      title={isModal ? tag.description : undefined}
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
        <div className={clsx('grid grid-cols-1 sm:grid-cols-2', isModal ? 'gap-2' : 'gap-3')}>
          {/* Main Camera */}
          <div className={statTileClass}>
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
            <p className={clsx('truncate text-sm font-semibold text-slate-100', isModal ? 'mt-1' : 'mt-1.5')}>
              {digest.topCamera?.model ?? 'Exif情報なし'}
            </p>
          </div>

          {/* Main Lens */}
          <div className={statTileClass}>
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
            <p className={clsx('truncate text-sm font-semibold text-slate-100', isModal ? 'mt-1' : 'mt-1.5')}>
              {digest.topLens?.model ?? 'Exif情報なし'}
            </p>
          </div>

          {/* Sweet-spot Focal Lengths */}
          <div className={statTileClass}>
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
              <p className={clsx('text-xs text-slate-500', isModal ? 'mt-1' : 'mt-1.5')}>データなし</p>
            )}
          </div>

          {/* Wide-aperture usage ratio */}
          <div className={statTileClass}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Aperture className="h-3.5 w-3.5 text-amber-400" />
              <span>大口径・開放撮影率（F2.8以下）</span>
            </div>
            <div className={clsx('flex items-baseline gap-2', isModal ? 'mt-1' : 'mt-1.5')}>
              <span
                className={clsx(
                  'font-bold tabular-nums text-amber-300',
                  isModal ? 'text-lg' : 'text-xl'
                )}
              >
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
            isModal ? 'gap-2 px-3 py-2.5' : 'gap-2.5 p-3.5'
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
            isModal ? 'gap-2 p-3' : 'gap-2.5 p-4'
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
            tabIndex={0}
            aria-label="SNSシェアテキスト"
            className={clsx(
              'overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800/90 bg-slate-950/80 font-sans text-xs leading-relaxed text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
              isModal ? 'max-h-32 px-3 py-2' : 'max-h-40 p-3'
            )}
          >
            {digest.snsShareText}
          </pre>
        </div>
      </div>
    </Card>
  )

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
        {...overlayProps}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="flex max-h-full w-full max-w-2xl flex-col focus:outline-none"
        >
          {cardContent}
        </div>
      </div>
    )
  }

  return cardContent
}
