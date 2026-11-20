import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { RefreshCw, Search, Star } from 'lucide-react'
import type { SabakiApi } from '@core/application/dto'
import type {
  ImportJobRecord,
  MediaFileRecord,
  SessionDigest
} from '@core/domain/models'
import { Button, Input, Switch } from '../atoms'
import { HistoryFileTable, SessionDigestModal } from '../organisms'

export interface HistoryPageProps {
  className?: string
}

function getSabakiApi(): SabakiApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as Window & { sabaki?: SabakiApi }).sabaki
}

/**
 * Import History & SNS Exif Caption Generator Page.
 * Displays recent import jobs (clickable to inspect Session Attribute Digest)
 * and searchable imported photo/video records with favorite filtering and one-click Exif copy.
 */
export function HistoryPage({ className }: HistoryPageProps): ReactElement {
  const [search, setSearch] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [jobs, setJobs] = useState<ImportJobRecord[]>([])
  const [files, setFiles] = useState<MediaFileRecord[]>([])
  const [selectedDigest, setSelectedDigest] = useState<SessionDigest | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.getRecentJobs || !api?.getRecentFiles) {
      setJobs([])
      setFiles([])
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const [recentJobs, recentFiles] = await Promise.all([
        api.getRecentJobs(12),
        api.getRecentFiles({
          search: search.trim() || undefined,
          favoriteOnly: favoriteOnly || undefined,
          limit: 100
        })
      ])
      setJobs(recentJobs)
      setFiles(recentFiles)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : '取り込み履歴の読み込みに失敗しました。'
      )
    } finally {
      setIsLoading(false)
    }
  }, [search, favoriteOnly])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleToggleFavorite = useCallback(async (fileId: number) => {
    const api = getSabakiApi()
    if (!api?.toggleFavorite) return

    try {
      const nextFav = await api.toggleFavorite(fileId)
      setFiles((prev) =>
        prev.map((file) => (file.id === fileId ? { ...file, favorite: nextFav } : file))
      )
    } catch {
      // Ignore transient toggle errors
    }
  }, [])

  const handleViewJobDigest = useCallback((job: ImportJobRecord) => {
    if (!job.digestJson) return
    try {
      const parsed = JSON.parse(job.digestJson) as SessionDigest
      setSelectedDigest(parsed)
    } catch {
      setError('セッションレポートの読み込みに失敗しました。')
    }
  }, [])

  return (
    <div className={className ? `flex flex-col gap-6 ${className}` : 'flex flex-col gap-6'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            取り込み履歴 &amp; SNS Exifキャプション生成
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            過去のインポートセッションレポートの再閲覧と、取り込み済み写真のExifクレジットコピーが行えます。
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          loading={isLoading}
          onClick={() => void loadHistory()}
        >
          最新を取得
        </Button>
      </div>

      {/* Search & Favorite filter bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
        <div className="min-w-[240px] flex-1">
          <Input
            label="ファイル名・カメラ・レンズ検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="例: ILCE-7M4, 35mm, DSC0001..."
            rightElement={<Search className="h-4 w-4 text-slate-500" />}
          />
        </div>

        <div className="flex items-center gap-2 pb-1">
          <Star className="h-4 w-4 text-amber-400" />
          <Switch
            checked={favoriteOnly}
            onChange={setFavoriteOnly}
            label="お気に入り（★）のみ表示"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      <HistoryFileTable
        jobs={jobs}
        files={files}
        onToggleFavorite={(id) => void handleToggleFavorite(id)}
        onViewJobDigest={handleViewJobDigest}
      />

      {selectedDigest && (
        <SessionDigestModal
          digest={selectedDigest}
          variant="modal"
          onDismiss={() => setSelectedDigest(null)}
        />
      )}
    </div>
  )
}
