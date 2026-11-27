import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { MediaFileRecord, MediaType } from '@core/domain/models'
import type { IFileRepository, MediaFileQueryFilter } from '@core/domain/ports'
import { SqliteConnection } from './SqliteConnection'

/**
 * Extended filter options for searching imported media files, supporting optional `mediaType`.
 */
export interface FileSearchFilter extends MediaFileQueryFilter {
  mediaType?: MediaType
}

const UPSERT_FILE_SQL = `
INSERT INTO imported_files (
  file_hash,
  original_name,
  source_path,
  dest_path,
  file_size,
  media_type,
  ext,
  captured_at,
  captured_year,
  captured_month,
  captured_day,
  captured_hour,
  camera_make,
  camera_model,
  lens_model,
  focal_length,
  focal_length_35mm,
  f_number,
  iso,
  exposure_time,
  shutter_speed_label,
  image_width,
  image_height,
  raw_meta_json,
  favorite,
  sns_caption,
  web_public,
  web_synced_at,
  job_id,
  imported_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
ON CONFLICT(dest_path) DO UPDATE SET
  file_hash = excluded.file_hash,
  original_name = excluded.original_name,
  source_path = excluded.source_path,
  file_size = excluded.file_size,
  media_type = excluded.media_type,
  ext = excluded.ext,
  captured_at = excluded.captured_at,
  captured_year = excluded.captured_year,
  captured_month = excluded.captured_month,
  captured_day = excluded.captured_day,
  captured_hour = excluded.captured_hour,
  camera_make = excluded.camera_make,
  camera_model = excluded.camera_model,
  lens_model = excluded.lens_model,
  focal_length = excluded.focal_length,
  focal_length_35mm = excluded.focal_length_35mm,
  f_number = excluded.f_number,
  iso = excluded.iso,
  exposure_time = excluded.exposure_time,
  shutter_speed_label = excluded.shutter_speed_label,
  image_width = excluded.image_width,
  image_height = excluded.image_height,
  raw_meta_json = excluded.raw_meta_json,
  favorite = excluded.favorite,
  sns_caption = excluded.sns_caption,
  web_public = excluded.web_public,
  web_synced_at = excluded.web_synced_at,
  job_id = excluded.job_id,
  imported_at = excluded.imported_at
`

function mapRowToMediaFileRecord(row: Record<string, SQLOutputValue>): MediaFileRecord {
  const capturedAt = String(row.captured_at)
  return {
    id: Number(row.id),
    fileHash: String(row.file_hash),
    originalName: String(row.original_name),
    sourcePath: String(row.source_path),
    destPath: String(row.dest_path),
    fileSize: Number(row.file_size),
    mediaType: String(row.media_type) as MediaType,
    ext: String(row.ext),
    capturedAt,
    capturedYear: Number(row.captured_year),
    capturedMonth: String(row.captured_month),
    capturedDay: String(row.captured_day),
    capturedHour: Number(row.captured_hour),
    exif: {
      capturedAt,
      ...(row.camera_make !== null ? { cameraMake: String(row.camera_make) } : {}),
      cameraModel: String(row.camera_model),
      lensModel: String(row.lens_model),
      ...(row.focal_length !== null ? { focalLength: Number(row.focal_length) } : {}),
      ...(row.focal_length_35mm !== null
        ? { focalLength35mm: Number(row.focal_length_35mm) }
        : {}),
      ...(row.f_number !== null ? { fNumber: Number(row.f_number) } : {}),
      ...(row.iso !== null ? { iso: Number(row.iso) } : {}),
      ...(row.exposure_time !== null ? { exposureTime: Number(row.exposure_time) } : {}),
      ...(row.shutter_speed_label !== null
        ? { shutterSpeedLabel: String(row.shutter_speed_label) }
        : {}),
      ...(row.image_width !== null ? { imageWidth: Number(row.image_width) } : {}),
      ...(row.image_height !== null ? { imageHeight: Number(row.image_height) } : {}),
      ...(row.raw_meta_json !== null ? { rawMetaJson: String(row.raw_meta_json) } : {})
    },
    favorite: Number(row.favorite) === 1,
    ...(row.sns_caption !== null ? { snsCaption: String(row.sns_caption) } : {}),
    webPublic: Number(row.web_public) === 1,
    ...(row.web_synced_at !== null ? { webSyncedAt: String(row.web_synced_at) } : {}),
    ...(row.job_id !== null ? { jobId: Number(row.job_id) } : {}),
    ...(row.imported_at !== null ? { importedAt: String(row.imported_at) } : {})
  }
}

/**
 * SQLite implementation of `IFileRepository` backed by `node:sqlite`.
 */
export class SqliteFileRepository implements IFileRepository {
  private readonly db: DatabaseSync

  constructor(connection: SqliteConnection | DatabaseSync) {
    this.db = connection instanceof SqliteConnection ? connection.getDb() : connection
  }

  public existsByHash(hash: string): boolean {
    const stmt = this.db.prepare(
      'SELECT 1 AS found FROM imported_files WHERE file_hash = ? LIMIT 1'
    )
    const row = stmt.get(hash)
    return row !== undefined
  }

  public findById(id: number): MediaFileRecord | null {
    const stmt = this.db.prepare('SELECT * FROM imported_files WHERE id = ? LIMIT 1')
    const row = stmt.get(id)
    if (!row) {
      return null
    }
    return mapRowToMediaFileRecord(row)
  }

  public save(file: MediaFileRecord): MediaFileRecord {
    const importedAt = file.importedAt ?? new Date().toISOString()
    const upsertStmt = this.db.prepare(UPSERT_FILE_SQL)
    upsertStmt.run(...this.buildBindParams(file, importedAt))

    const selectByDestStmt = this.db.prepare(
      'SELECT * FROM imported_files WHERE dest_path = ? LIMIT 1'
    )
    const savedRow = selectByDestStmt.get(file.destPath)
    if (savedRow) {
      return mapRowToMediaFileRecord(savedRow)
    }

    return {
      ...file,
      importedAt
    }
  }

  public saveBatch(files: MediaFileRecord[]): void {
    if (files.length === 0) {
      return
    }

    const defaultImportedAt = new Date().toISOString()
    const upsertStmt = this.db.prepare(UPSERT_FILE_SQL)

    this.db.exec('BEGIN TRANSACTION')
    try {
      for (const file of files) {
        const importedAt = file.importedAt ?? defaultImportedAt
        const res = upsertStmt.run(...this.buildBindParams(file, importedAt))
        if (file.id === undefined && Number(res.lastInsertRowid) > 0) {
          file.id = Number(res.lastInsertRowid)
        }
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  public findRecent(filter?: FileSearchFilter): MediaFileRecord[] {
    const conditions: string[] = []
    const params: Array<string | number> = []

    if (filter?.search && filter.search.trim().length > 0) {
      const pattern = `%${filter.search.trim()}%`
      conditions.push(
        '(original_name LIKE ? COLLATE NOCASE OR camera_model LIKE ? COLLATE NOCASE OR lens_model LIKE ? COLLATE NOCASE OR captured_day LIKE ? COLLATE NOCASE OR COALESCE(sns_caption, \'\') LIKE ? COLLATE NOCASE OR dest_path LIKE ? COLLATE NOCASE)'
      )
      params.push(pattern, pattern, pattern, pattern, pattern, pattern)
    }

    if (filter?.favoriteOnly) {
      conditions.push('favorite = 1')
    }

    if (filter?.cameraModel && filter.cameraModel.trim().length > 0) {
      conditions.push('camera_model = ?')
      params.push(filter.cameraModel.trim())
    }

    if (filter?.lensModel && filter.lensModel.trim().length > 0) {
      conditions.push('lens_model = ?')
      params.push(filter.lensModel.trim())
    }

    if (filter?.specificDay && filter.specificDay.trim().length > 0) {
      conditions.push('captured_day = ?')
      params.push(filter.specificDay.trim())
    }

    if (filter?.mediaType && filter.mediaType.trim().length > 0) {
      conditions.push('media_type = ?')
      params.push(filter.mediaType.trim())
    }

    if (filter?.after) {
      conditions.push('(captured_at < ? OR (captured_at = ? AND id < ?))')
      params.push(filter.after.capturedAt, filter.after.capturedAt, filter.after.id)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit =
      filter?.limit !== undefined ? Math.max(1, Math.floor(filter.limit)) : 100
    const offset =
      filter?.offset !== undefined ? Math.max(0, Math.floor(filter.offset)) : 0

    const sql = `
      SELECT *
      FROM imported_files
      ${whereClause}
      ORDER BY captured_at DESC, id DESC
      LIMIT ? OFFSET ?
    `
    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params, limit, offset)
    return rows.map(mapRowToMediaFileRecord)
  }

  public toggleFavorite(id: number): boolean {
    const currentStmt = this.db.prepare(
      'SELECT favorite FROM imported_files WHERE id = ? LIMIT 1'
    )
    const row = currentStmt.get(id)
    if (!row) {
      return false
    }

    const nextValue = Number(row.favorite) === 1 ? 0 : 1
    const updateStmt = this.db.prepare(
      'UPDATE imported_files SET favorite = ? WHERE id = ?'
    )
    updateStmt.run(nextValue, id)
    return nextValue === 1
  }

  public countAll(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) AS cnt FROM imported_files')
    const row = stmt.get()
    return Number(row?.cnt ?? 0)
  }

  public deleteAll(): number {
    const stmt = this.db.prepare('DELETE FROM imported_files')
    const res = stmt.run()
    return Number(res.changes ?? 0)
  }

  private buildBindParams(
    file: MediaFileRecord,
    importedAt: string
  ): Array<string | number | null> {
    return [
      file.fileHash,
      file.originalName,
      file.sourcePath,
      file.destPath,
      file.fileSize,
      file.mediaType,
      file.ext,
      file.capturedAt,
      file.capturedYear,
      file.capturedMonth,
      file.capturedDay,
      file.capturedHour,
      file.exif.cameraMake ?? null,
      file.exif.cameraModel,
      file.exif.lensModel,
      file.exif.focalLength ?? null,
      file.exif.focalLength35mm ?? null,
      file.exif.fNumber ?? null,
      file.exif.iso ?? null,
      file.exif.exposureTime ?? null,
      file.exif.shutterSpeedLabel ?? null,
      file.exif.imageWidth ?? null,
      file.exif.imageHeight ?? null,
      file.exif.rawMetaJson ?? null,
      file.favorite ? 1 : 0,
      file.snsCaption ?? null,
      file.webPublic ? 1 : 0,
      file.webSyncedAt ?? null,
      file.jobId ?? null,
      importedAt
    ]
  }
}
