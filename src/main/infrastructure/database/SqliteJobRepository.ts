import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type {
  ConflictPolicyConfig,
  ImportJobRecord,
  ImportJobStatus
} from '@core/domain/models'
import type { IJobRepository } from '@core/domain/ports'
import { SqliteConnection } from './SqliteConnection'

function parseConflictPolicy(jsonStr: string): ConflictPolicyConfig {
  try {
    const parsed = JSON.parse(jsonStr) as Partial<ConflictPolicyConfig>
    return {
      skipHistoryDuplicates: Boolean(parsed.skipHistoryDuplicates ?? true),
      fileConflictMode: parsed.fileConflictMode ?? 'skip_same_hash_rename_diff'
    }
  } catch {
    return {
      skipHistoryDuplicates: true,
      fileConflictMode: 'skip_same_hash_rename_diff'
    }
  }
}

function mapRowToImportJobRecord(row: Record<string, SQLOutputValue>): ImportJobRecord {
  return {
    id: Number(row.id),
    sourceDir: String(row.source_dir),
    destRoot: String(row.dest_root),
    pathTemplate: String(row.path_template),
    conflictPolicy: parseConflictPolicy(String(row.conflict_policy_json)),
    status: String(row.status) as ImportJobStatus,
    totalFiles: Number(row.total_files),
    copiedFiles: Number(row.copied_files),
    skippedFiles: Number(row.skipped_files),
    renamedFiles: Number(row.renamed_files),
    overwrittenFiles: Number(row.overwritten_files),
    errorFiles: Number(row.error_files),
    totalBytes: Number(row.total_bytes),
    startedAt: String(row.started_at),
    ...(row.completed_at !== null ? { completedAt: String(row.completed_at) } : {}),
    ...(row.digest_json !== null ? { digestJson: String(row.digest_json) } : {}),
    ...(row.error_message !== null ? { errorMessage: String(row.error_message) } : {})
  }
}

/**
 * SQLite implementation of `IJobRepository` backed by `node:sqlite`.
 */
export class SqliteJobRepository implements IJobRepository {
  private readonly db: DatabaseSync

  constructor(connection: SqliteConnection | DatabaseSync) {
    this.db = connection instanceof SqliteConnection ? connection.getDb() : connection
  }

  public createJob(job: Omit<ImportJobRecord, 'id'>): ImportJobRecord {
    const stmt = this.db.prepare(`
      INSERT INTO import_jobs (
        source_dir,
        dest_root,
        path_template,
        conflict_policy_json,
        status,
        total_files,
        copied_files,
        skipped_files,
        renamed_files,
        overwritten_files,
        error_files,
        total_bytes,
        started_at,
        completed_at,
        digest_json,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const res = stmt.run(
      job.sourceDir,
      job.destRoot,
      job.pathTemplate,
      JSON.stringify(job.conflictPolicy),
      job.status,
      job.totalFiles,
      job.copiedFiles,
      job.skippedFiles,
      job.renamedFiles,
      job.overwrittenFiles,
      job.errorFiles,
      job.totalBytes,
      job.startedAt,
      job.completedAt ?? null,
      job.digestJson ?? null,
      job.errorMessage ?? null
    )

    const id = Number(res.lastInsertRowid)
    return {
      ...job,
      id
    }
  }

  public updateJob(id: number, patch: Partial<ImportJobRecord>): void {
    const existing = this.findById(id)
    if (!existing) {
      return
    }

    const merged: ImportJobRecord = {
      ...existing,
      ...patch,
      id
    }

    const stmt = this.db.prepare(`
      UPDATE import_jobs
      SET
        source_dir = ?,
        dest_root = ?,
        path_template = ?,
        conflict_policy_json = ?,
        status = ?,
        total_files = ?,
        copied_files = ?,
        skipped_files = ?,
        renamed_files = ?,
        overwritten_files = ?,
        error_files = ?,
        total_bytes = ?,
        started_at = ?,
        completed_at = ?,
        digest_json = ?,
        error_message = ?
      WHERE id = ?
    `)

    stmt.run(
      merged.sourceDir,
      merged.destRoot,
      merged.pathTemplate,
      JSON.stringify(merged.conflictPolicy),
      merged.status,
      merged.totalFiles,
      merged.copiedFiles,
      merged.skippedFiles,
      merged.renamedFiles,
      merged.overwrittenFiles,
      merged.errorFiles,
      merged.totalBytes,
      merged.startedAt,
      merged.completedAt ?? null,
      merged.digestJson ?? null,
      merged.errorMessage ?? null,
      id
    )
  }

  public findRecentJobs(limit: number = 20): ImportJobRecord[] {
    const safeLimit = Math.max(1, Math.floor(limit))
    const stmt = this.db.prepare(`
      SELECT *
      FROM import_jobs
      ORDER BY started_at DESC, id DESC
      LIMIT ?
    `)
    const rows = stmt.all(safeLimit)
    return rows.map(mapRowToImportJobRecord)
  }

  public findById(id: number): ImportJobRecord | null {
    const stmt = this.db.prepare('SELECT * FROM import_jobs WHERE id = ? LIMIT 1')
    const row = stmt.get(id)
    if (!row) {
      return null
    }
    return mapRowToImportJobRecord(row)
  }

  public deleteAll(): number {
    const stmt = this.db.prepare('DELETE FROM import_jobs')
    const res = stmt.run()
    return Number(res.changes ?? 0)
  }
}
