import type { MediaFileRecord } from '../models/MediaFile'

/**
 * Keyset pagination cursor: the last record of the previously loaded page.
 * Records are ordered by `capturedAt DESC, id DESC`, so the next page starts strictly after it.
 */
export interface MediaFileCursor {
  capturedAt: string
  id: number
}

/**
 * Filter criteria for querying imported media file records.
 */
export interface MediaFileQueryFilter {
  limit?: number
  offset?: number
  /**
   * Return only records ordered after this cursor (stable against inserts/removals).
   * When combined with `offset`, the offset is applied after the cursor condition.
   */
  after?: MediaFileCursor
  search?: string
  favoriteOnly?: boolean
  cameraModel?: string
  lensModel?: string
  specificDay?: string
}

/**
 * Persistence port for imported media file records.
 */
export interface IFileRepository {
  existsByHash(hash: string): boolean
  findById(id: number): MediaFileRecord | null
  save(file: MediaFileRecord): MediaFileRecord
  saveBatch(files: MediaFileRecord[]): void
  findRecent(filter?: MediaFileQueryFilter): MediaFileRecord[]
  toggleFavorite(id: number): boolean
  countAll(): number
  deleteAll(): number
}
