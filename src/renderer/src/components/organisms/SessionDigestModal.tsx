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

  const cardContent = (
    <Card
      title="今回の撮影属性アナライズレポート"
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
        className
      )}
    >
      <div className="flex flex-col gap-5">
        {/* Headline summary banner */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-sm font-semibold leading-relaxed text-emerald-100">
              {digest.headlineSummary}
            </p>
          </div>
        </div>

        {/* Shooting style tags */}
        {digest.styleTags.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-slate-400">検出された撮影スタイル傾向</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {digest.styleTags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                >
                  <span className="text-lg leading-none" aria-hidden="true">
                    {tag.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100">{tag.label}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                      {tag.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Camera / Lens / Focal Length / Wide Aperture highlights */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Main Camera */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
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
            <p className="mt-1.5 truncate text-sm font-semibold text-slate-100">
              {digest.topCamera?.model ?? 'Exif情報なし'}
            </p>
          </div>

          {/* Main Lens */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
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
            <p className="mt-1.5 truncate text-sm font-semibold text-slate-100">
              {digest.topLens?.model ?? 'Exif情報なし'}
            </p>
          </div>

          {/* Sweet-spot Focal Lengths */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Focus className="h-3.5 w-3.5 text-sky-400" />
              <span>主力焦点距離（スイートスポット）</span>
            </div>
            {digest.topFocalLengths.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
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
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Aperture className="h-3.5 w-3.5 text-amber-400" />
              <span>大口径・開放撮影率（F2.8以下）</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
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
        <div className="flex flex-col gap-2.5 rounded-lg border border-slate-800 bg-slate-950/50 p-3.5">
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
        <div className="flex flex-col gap-2.5 rounded-xl border border-indigo-500/25 bg-indigo-950/20 p-4">
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
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800/90 bg-slate-950/80 p-3 font-sans text-xs leading-relaxed text-slate-200">
            {digest.snsShareText}
          </pre>
        </div>
      </div>
    </Card>
  )

  if (variant === 'modal') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="今回の撮影属性アナライズレポート"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      >
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">{cardContent}</div>
      </div>
    )
  }

  return cardContent
}
