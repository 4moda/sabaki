import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'

interface NodeSqliteModule {
  DatabaseSync: typeof DatabaseSyncType
}

function loadNodeSqlite(): NodeSqliteModule {
  const builtinGetter = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => NodeSqliteModule | undefined
    }
  ).getBuiltinModule
  if (typeof builtinGetter === 'function') {
    const mod = builtinGetter('node:sqlite')
    if (mod?.DatabaseSync) {
      return mod
    }
  }
  const req = createRequire(import.meta.url)
  return req('node:sqlite') as NodeSqliteModule
}

const { DatabaseSync } = loadNodeSqlite()

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_dir TEXT NOT NULL,
  dest_root TEXT NOT NULL,
  path_template TEXT NOT NULL,
  conflict_policy_json TEXT NOT NULL,
  status TEXT NOT NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  copied_files INTEGER NOT NULL DEFAULT 0,
  skipped_files INTEGER NOT NULL DEFAULT 0,
  renamed_files INTEGER NOT NULL DEFAULT 0,
  overwritten_files INTEGER NOT NULL DEFAULT 0,
  error_files INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  digest_json TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS imported_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT NOT NULL,
  original_name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  dest_path TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  ext TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  captured_year INTEGER NOT NULL,
  captured_month TEXT NOT NULL,
  captured_day TEXT NOT NULL,
  captured_hour INTEGER NOT NULL,
  camera_make TEXT,
  camera_model TEXT NOT NULL,
  lens_model TEXT NOT NULL,
  focal_length REAL,
  focal_length_35mm REAL,
  f_number REAL,
  iso INTEGER,
  exposure_time REAL,
  shutter_speed_label TEXT,
  image_width INTEGER,
  image_height INTEGER,
  raw_meta_json TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  sns_caption TEXT,
  web_public INTEGER NOT NULL DEFAULT 0,
  web_synced_at TEXT,
  job_id INTEGER,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_hash ON imported_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_files_captured_day ON imported_files(captured_day);
CREATE INDEX IF NOT EXISTS idx_files_camera ON imported_files(camera_model);
CREATE INDEX IF NOT EXISTS idx_files_lens ON imported_files(lens_model);
CREATE INDEX IF NOT EXISTS idx_files_focal ON imported_files(focal_length);
CREATE INDEX IF NOT EXISTS idx_files_year ON imported_files(captured_year);
`

/**
 * Wraps Node 22 / Electron 35 built-in `DatabaseSync` (`node:sqlite`),
 * configures WAL mode for file-backed databases, and runs schema migrations.
 */
export class SqliteConnection {
  public readonly db: DatabaseSyncType
  public readonly dbPath: string
  private closed = false

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath

    if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
      mkdirSync(dirname(dbPath), { recursive: true })
    }

    this.db = new DatabaseSync(dbPath)

    if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
      this.db.exec('PRAGMA journal_mode = WAL;')
    }

    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  /**
   * Executes idempotent schema migrations creating tables and indexes.
   */
  public migrate(): void {
    this.db.exec(SCHEMA_SQL)
  }

  /**
   * Returns the underlying `DatabaseSync` instance.
   */
  public getDb(): DatabaseSyncType {
    return this.db
  }

  /**
   * Reads an application metadata value by key, or null if not set.
   */
  public getMeta(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM app_metadata WHERE key = ? LIMIT 1')
    const row = stmt.get(key)
    return row && row.value !== undefined && row.value !== null ? String(row.value) : null
  }

  /**
   * Inserts or updates an application metadata key-value entry.
   */
  public setMeta(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO app_metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    stmt.run(key, value)
  }

  /**
   * Closes the SQLite database connection if currently open.
   */
  public close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.db.isOpen !== false) {
      this.db.close()
    }
  }
}
