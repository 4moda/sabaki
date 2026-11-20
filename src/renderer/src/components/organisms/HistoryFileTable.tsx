import type { ReactElement } from 'react'
import { clsx } from 'clsx'
import {
  Calendar,
  Camera,
  FileImage,
  History,
  Sparkles,
  Star
} from 'lucide-react'
import type { ImportJobRecord, MediaFileRecord } from '@core/domain/models'
import { formatPhotoExifCaption } from '@core/domain/services/SnsCaptionDomainService'
import { Badge, Button, Card, type BadgeVariant } from '../atoms'
import { ExifCreditRow } from '../molecules'
import { formatBytes } from './ImportProgressPanel'

export interface HistoryFileTableProps {
  jobs?: ImportJobRecord[]
  files: MediaFileRecord[]
  onToggleFavorite: (fileId: number) => void
  onViewJobDigest?: (job: ImportJobRecord) => void
  className?: string
}

const MEDIA_BADGE_VARIANT: Record<MediaFileRecord['mediaType'], BadgeVariant> = {
  RAW: 'amber',
  JPEG: 'emerald',
  VIDEO: 'sky'
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatExposureSummary(file: MediaFileRecord): string[] {
  const pills: string[] = []
  const { exif } = file
  if (exif.focalLength !== undefined && exif.focalLength > 0) {
    pills.push(`${exif.focalLength}mm`)
  }
  if (exif.fNumber !== undefined && exif.fNumber > 0) {
    pills.push(`F${exif.fNumber}`)
  }
  if (exif.shutterSpeedLabel) {
    pills.push(exif.shutterSpeedLabel)
  } else if (exif.exposureTime !== undefined && exif.exposureTime > 0) {
    pills.push(
      exif.exposureTime < 1
        ? `1/${Math.round(1 / exif.exposureTime)}s`
        : `${Number(exif.exposureTime.toFixed(1))}s`
    )
  }
  if (exif.iso !== undefined && exif.iso > 0) {
    pills.push(`ISO${exif.iso}`)
  }
  return pills
}

/**
 * Displays past import jobs (with Session Digest launcher) and imported media records
 * with favorite toggle, Exif spec pills, and one-click SNS ExifCreditRow copy.
 */
export function HistoryFileTable({
  jobs = [],
  files,
  onToggleFavorite,
  onViewJobDigest,
  className
}: HistoryFileTableProps): ReactElement {
  return (
    <div className={clsx('flex flex-col gap-6', className)}>
      {/* Past Import Jobs */}
      {jobs.length > 0 && (
        <Card
          title="最近のインポートセッション履歴"
          subtitle="完了したセッションの「撮影属性レポート」をいつでも再確認できます"
          icon={<History className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job, idx) => (
              <div
                key={job.id ?? `${job.startedAt}-${idx}`}
                className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {formatDateTime(job.startedAt)}
                    </span>
                    <Badge
                      variant={
                        job.status === 'completed'
                          ? 'emerald'
                          : job.status === 'failed'
                            ? 'rose'
                            : 'amber'
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-[11px] text-slate-400" title={job.destRoot}>
                    {job.destRoot}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="emerald">コピー {job.copiedFiles}</Badge>
                    <Badge variant="sky">スキップ {job.skippedFiles}</Badge>
                    {job.renamedFiles > 0 && (
                      <Badge variant="amber">リネーム {job.renamedFiles}</Badge>
                    )}
                    <Badge variant="default">{formatBytes(job.totalBytes)}</Badge>
                  </div>
                </div>

                {onViewJobDigest && job.digestJson && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Sparkles className="h-3.5 w-3.5 text-emerald-400" />}
                    onClick={() => onViewJobDigest(job)}
                    className="w-full"
                  >
                    撮影属性レポートを見る
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Imported Media Files List */}
      <Card
        title="取り込み済みメディア & SNS Exifキャプション一覧"
        subtitle="お気に入り（★）登録と、各写真のSNS投稿用Exifクレジットのワンクリックコピーが行えます"
        icon={<FileImage className="h-4 w-4" />}
        headerRight={<Badge variant="default">{files.length.toLocaleString()} 件表示</Badge>}
      >
        {files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-sm text-slate-400">
            条件に一致する取り込み済みファイルがありません。
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {files.map((file) => {
              const caption = file.snsCaption ?? formatPhotoExifCaption(file)
              const exposurePills = formatExposureSummary(file)

              return (
                <li
                  key={file.id ?? `${file.fileHash}-${file.originalName}`}
                  className="flex flex-col gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (file.id !== undefined) {
                            onToggleFavorite(file.id)
                          }
                        }}
                        disabled={file.id === undefined}
                        aria-label={
                          file.favorite
                            ? `${file.originalName}のお気に入りを解除`
                            : `${file.originalName}をお気に入りに追加`
                        }
                        aria-pressed={file.favorite}
                        className={clsx(
                          'rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                          file.favorite
                            ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                            : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                        )}
                      >
                        <Star
                          className={clsx('h-4 w-4', file.favorite && 'fill-amber-400')}
                        />
                      </button>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-mono text-sm font-semibold text-slate-100">
                            {file.originalName}
                          </span>
                          <Badge variant={MEDIA_BADGE_VARIANT[file.mediaType]}>
                            {file.mediaType}
                          </Badge>
                          <span className="font-mono text-xs text-slate-400">
                            {file.capturedDay}
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            {formatBytes(file.fileSize)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Exif pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {file.exif.cameraModel && file.exif.cameraModel !== 'Unknown' && (
                        <Badge variant="emerald">
                          <Camera className="h-3 w-3" />
                          {file.exif.cameraModel}
                        </Badge>
                      )}
                      {file.exif.lensModel && file.exif.lensModel !== 'Unknown' && (
                        <Badge variant="indigo">{file.exif.lensModel}</Badge>
                      )}
                      {exposurePills.map((pill) => (
                        <Badge key={pill} variant="default" className="font-mono">
                          {pill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* One-click SNS Exif caption copy row */}
                  <ExifCreditRow creditText={caption} />
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
