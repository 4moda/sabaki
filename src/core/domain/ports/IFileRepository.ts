import type { MediaFileRecord } from '../models/MediaFile'

/**
 * Filter criteria for querying imported media file records.
 */
export interface MediaFileQueryFilter {
  limit?: number
  offset?: number
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
