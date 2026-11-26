import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Check, Copy, Globe, Share2, Sparkles } from 'lucide-react'
import { Badge, Button, Card } from '../atoms'

export interface SnsShareExportCardProps {
  insights: string[]
  snsSummaryText: string
  isExporting?: boolean
  exportStatus?: string | null
  onExportWebJson: () => void
  className?: string
}

/**
 * Automated photographer insights, one-click SNS summary copy,
 * and privacy-safe Web portfolio clean JSON (stats-public.json) export panel.
 */
export function SnsShareExportCard({
  insights,
  snsSummaryText,
  isExporting = false,
  exportStatus,
  onExportWebJson,
  className
}: SnsShareExportCardProps): ReactElement {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleCopySummary = useCallback(async () => {
    if (!snsSummaryText) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snsSummaryText)
      }
      setCopied(true)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [snsSummaryText])

  return (
    <Card
      title="機材・撮影インサイト & SNS / Webポートフォリオ連携"
      subtitle="自動分析コメントの閲覧、SNSシェア用サマリーコピー、プライバシー保護済みクリーンJSON書き出し"
      icon={<Share2 className="h-4 w-4" />}
      className={className}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Automated Photographer Insights */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            機材・撮影インサイト
          </h4>

          {insights.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">
              写真を取り込むと、撮影傾向やメイン機材のインサイトが自動生成されます。
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {insights.map((insight, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-xs leading-relaxed text-slate-200"
                >
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* SNS summary & Web JSON export */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="flex flex-col gap-2 rounded-xl border border-indigo-500/25 bg-indigo-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-indigo-200">
                SNSシェア用統計サマリーテキスト
              </span>
              <Button
                variant={copied ? 'primary' : 'secondary'}
                size="sm"
                icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                onClick={handleCopySummary}
                disabled={!snsSummaryText}
              >
                {copied ? 'コピーしました！' : 'サマリーをコピー'}
              </Button>
            </div>
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800/90 bg-slate-950/80 p-3 font-sans text-xs leading-relaxed text-slate-200">
              {snsSummaryText || '統計データがありません'}
            </pre>
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  Webサイト / ポートフォリオ連携用クリーンJSON
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  ローカルパス（sourcePath / destPath）や生Exifを自動除去した安全な{' '}
                  <code className="font-mono text-emerald-300">stats-public.json</code>{' '}
                  をエクスポートします。
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Globe className="h-3.5 w-3.5" />}
                loading={isExporting}
                onClick={onExportWebJson}
                className="shrink-0"
              >
                stats-public.json 出力
              </Button>
            </div>
            {exportStatus && (
              <div className="pt-1">
                <Badge variant="emerald" className="max-w-full truncate">
                  {exportStatus}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
