import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { RefreshCw, Search, Star, X } from 'lucide-react'
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

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250

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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [jobs, setJobs] = useState<ImportJobRecord[]>([])
  const [files, setFiles] = useState<MediaFileRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [selectedDigest, setSelectedDigest] = useState<SessionDigest | null>(null)
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const requestSeqRef = useRef(0)
  const jobsSeqRef = useRef(0)
  const offsetRef = useRef(0)

  useEffect(() => {
    if (search === debouncedSearch) return
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search, debouncedSearch])

  const loadJobs = useCallback(async () => {
    const api = getSabakiApi()
    if (!api?.getRecentJobs) {
      setJobs([])
      return
    }

    const seq = ++jobsSeqRef.current
    setIsLoadingJobs(true)
    try {
      const recentJobs = await api.getRecentJobs(12)
      if (seq !== jobsSeqRef.current) return
      setJobs(recentJobs)
    } catch (err) {
      if (seq !== jobsSeqRef.current) return
      setError(
        err instanceof Error && err.message
          ? err.message
          : '取り込み履歴の読み込みに失敗しました。'
      )
    } finally {
      if (seq === jobsSeqRef.current) {
        setIsLoadingJobs(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs, refreshTick])

  const loadFirstPage = useCallback(async (query: string, onlyFav: boolean) => {
    const api = getSabakiApi()
    if (!api?.getRecentFiles) {
      setFiles([])
      setHasMore(false)
      offsetRef.current = 0
      return
    }

    const seq = ++requestSeqRef.current
    setIsLoadingFiles(true)
    setIsLoadingMore(false)
    setError(null)

    try {
      const recentFiles = await api.getRecentFiles({
        search: query.trim() || undefined,
        favoriteOnly: onlyFav || undefined,
        limit: PAGE_SIZE + 1,
        offset: 0
      })
      if (seq !== requestSeqRef.current) return
      setFiles(recentFiles.slice(0, PAGE_SIZE))
      setHasMore(recentFiles.length > PAGE_SIZE)
      offsetRef.current = PAGE_SIZE
    } catch (err) {
      if (seq !== requestSeqRef.current) return
      setError(
        err instanceof Error && err.message
          ? err.message
          : '取り込み履歴の読み込みに失敗しました。'
      )
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoadingFiles(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadFirstPage(debouncedSearch, favoriteOnly)
  }, [debouncedSearch, favoriteOnly, refreshTick, loadFirstPage])

  const handleLoadMore = useCallback(async () => {
    if (isLoadingFiles || isLoadingMore || !hasMore) return
    const api = getSabakiApi()
    if (!api?.getRecentFiles) return

    const seq = requestSeqRef.current
    const nextOffset = offsetRef.current
    setIsLoadingMore(true)
    setError(null)

    try {
      const nextPage = await api.getRecentFiles({
        search: debouncedSearch.trim() || undefined,
        favoriteOnly: favoriteOnly || undefined,
        limit: PAGE_SIZE + 1,
        offset: nextOffset
      })
      if (seq !== requestSeqRef.current) return

      const sliced = nextPage.slice(0, PAGE_SIZE)
      setFiles((prev) => {
        const existingIds = new Set(
          prev.map((item) => item.id).filter((id): id is number => id !== undefined)
        )
        const deduped = sliced.filter(
          (item) => item.id === undefined || !existingIds.has(item.id)
        )
        return [...prev, ...deduped]
      })
      setHasMore(nextPage.length > PAGE_SIZE)
      offsetRef.current = nextOffset + PAGE_SIZE
    } catch (err) {
      if (seq !== requestSeqRef.current) return
      setError(
        err instanceof Error && err.message
          ? err.message
          : '追加履歴の読み込みに失敗しました。'
      )
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoadingMore(false)
      }
    }
  }, [debouncedSearch, favoriteOnly, hasMore, isLoadingFiles, isLoadingMore])

  const handleRefresh = useCallback(() => {
    if (debouncedSearch !== search) {
      setDebouncedSearch(search)
    }
    setRefreshTick((prev) => prev + 1)
  }, [debouncedSearch, search])

  const handleClearSearch = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    searchInputRef.current?.focus()
  }, [])

  const handleToggleFavorite = useCallback(
    async (fileId: number) => {
      const api = getSabakiApi()
      if (!api?.toggleFavorite) return

      try {
        const nextFav = await api.toggleFavorite(fileId)
        if (favoriteOnly && !nextFav) {
          offsetRef.current = Math.max(0, offsetRef.current - 1)
        }
        setFiles((prev) => {
          if (favoriteOnly && !nextFav) {
            return prev.filter((file) => file.id !== fileId)
          }
          return prev.map((file) =>
            file.id === fileId ? { ...file, favorite: nextFav } : file
          )
        })
      } catch {
        // Ignore transient toggle errors
      }
    },
    [favoriteOnly]
  )

  const handleViewJobDigest = useCallback((job: ImportJobRecord) => {
    if (!job.digestJson) return
    try {
      const parsed = JSON.parse(job.digestJson) as SessionDigest
      setSelectedDigest(parsed)
    } catch {
      setError('セッションレポートの読み込みに失敗しました。')
    }
  }, [])

  const isLoading = isLoadingJobs || isLoadingFiles

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
          onClick={handleRefresh}
        >
          最新を取得
        </Button>
      </div>

      {/* Search & Favorite filter bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
        <div className="min-w-[240px] flex-1">
          <Input
            ref={searchInputRef}
            label="ファイル名・カメラ・レンズ検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="例: ILCE-7M4, 35mm, DSC0001..."
            rightPaddingClass={search.length > 0 ? 'pr-16' : 'pr-10'}
            rightElement={
              <div className="flex items-center gap-1">
                {search.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label="検索をクリア"
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <Search
                  className="pointer-events-none h-4 w-4 text-slate-500"
                  aria-hidden="true"
                />
              </div>
            }
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
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => void handleLoadMore()}
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
