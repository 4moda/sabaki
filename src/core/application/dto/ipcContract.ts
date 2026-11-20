import type {
  AppSettings,
  ConflictPolicyConfig,
  DashboardFilter,
  DashboardStatsResult,
  ImportJobRecord,
  ImportProgressEvent,
  ImportScanPreview,
  MediaFileRecord,
  PathPreset,
  SessionDigest
} from '../../domain/models'
import type {
  DistinctFilterOptions,
  MediaFileQueryFilter
} from '../../domain/ports'

/**
 * Request payload for generating real-time path template previews.
 */
export interface PreviewTargetPathsRequest {
  destRoot: string
  template: string
  sampleDate?: string | Date
}

/**
 * Response payload containing sample destination paths and available presets.
 */
export interface PreviewTargetPathsResult {
  previews: Array<{ label: string; ext: string; fullPath: string }>
  presets: PathPreset[]
}

/**
 * Extended scan preview including flat media type counts alongside the domain breakdown.
 */
export interface ScanSourceDirectoryResult extends ImportScanPreview {
  rawCount: number
  jpegCount: number
  videoCount: number
}

/**
 * Request payload for executing an SD card import job.
 */
export interface ExecuteImportJobRequest {
  sourceDir: string
  destRoot: string
  pathTemplate: string
  conflictPolicy: ConflictPolicyConfig
  onProgress?: (event: ImportProgressEvent) => void
}

/**
 * Result returned after an import job completes.
 */
export interface ExecuteImportJobResult {
  job: ImportJobRecord
  digest: SessionDigest
}

/**
 * Request payload for exporting privacy-safe public web portfolio JSON.
 */
export interface ExportPublicWebJsonRequest {
  outputPath?: string
  filter?: DashboardFilter
  includePublicFiles?: boolean
}

/**
 * Result returned by the public web JSON export use case.
 */
export interface ExportPublicWebJsonResult {
  payload: Record<string, unknown>
  outputPath?: string
  exportedFileCount: number
  canceled?: boolean
}

/**
 * Options for seeding realistic 52-week demo photography data.
 */
export interface SeedDemoDataOptions {
  /** Number of demo shots to generate (default: 180). */
  shotCount?: number
  /** Reference end date for the 52-week window (default: today). */
  referenceDate?: string | Date
}

/**
 * Result returned after seeding demo records and an accompanying import job.
 */
export interface SeedDemoDataResult {
  insertedFiles: number
  job: ImportJobRecord
  digest: SessionDigest
}

/**
 * Result returned after clearing persisted media file and import job records.
 */
export interface ClearAllDataResult {
  deletedFiles: number
  deletedJobs: number
}

/**
 * Canonical IPC channel names shared between Main process handlers and Preload bridge.
 */
export const IPC_CHANNELS = {
  GET_APP_INFO: 'app:get-info',
  PREVIEW_TARGET_PATHS: 'sabaki:preview-target-paths',
  SCAN_SOURCE_DIRECTORY: 'sabaki:scan-source-directory',
  EXECUTE_IMPORT_JOB: 'sabaki:execute-import-job',
  IMPORT_PROGRESS: 'sabaki:import-progress',
  GET_DASHBOARD_STATS: 'sabaki:get-dashboard-stats',
  GET_FILTER_OPTIONS: 'sabaki:get-filter-options',
  GET_RECENT_FILES: 'sabaki:get-recent-files',
  GET_RECENT_JOBS: 'sabaki:get-recent-jobs',
  TOGGLE_FAVORITE: 'sabaki:toggle-favorite',
  FORMAT_PHOTO_CAPTION: 'sabaki:format-photo-caption',
  EXPORT_PUBLIC_WEB_JSON: 'sabaki:export-public-web-json',
  SEED_DEMO_DATA: 'sabaki:seed-demo-data',
  CLEAR_ALL_DATA: 'sabaki:clear-all-data',
  GET_SETTINGS: 'sabaki:get-settings',
  SAVE_SETTINGS: 'sabaki:save-settings',
  SELECT_DIRECTORY: 'sabaki:select-directory'
} as const

/**
 * Strongly-typed IPC API contract exposed via Preload (`window.sabaki`) and consumed by Renderer hooks.
 */
export interface SabakiApi {
  getAppInfo?: () => Promise<{ name: string; version: string }>
  previewTargetPaths: (
    request: PreviewTargetPathsRequest
  ) => Promise<PreviewTargetPathsResult>
  scanSourceDirectory: (sourceDir: string) => Promise<ScanSourceDirectoryResult>
  executeImportJob: (
    request: Omit<ExecuteImportJobRequest, 'onProgress'>
  ) => Promise<ExecuteImportJobResult>
  onImportProgress: (listener: (event: ImportProgressEvent) => void) => () => void
  getDashboardStats: (filter?: DashboardFilter) => Promise<DashboardStatsResult>
  getFilterOptions: () => Promise<DistinctFilterOptions>
  getRecentFiles: (filter?: MediaFileQueryFilter) => Promise<MediaFileRecord[]>
  getRecentJobs: (limit?: number) => Promise<ImportJobRecord[]>
  toggleFavorite: (fileId: number) => Promise<boolean>
  formatPhotoCaption: (
    fileId: number,
    options?: { includeHashtags?: boolean }
  ) => Promise<string>
  exportPublicWebJson: (
    request?: ExportPublicWebJsonRequest
  ) => Promise<ExportPublicWebJsonResult>
  seedDemoData: (options?: SeedDemoDataOptions) => Promise<SeedDemoDataResult>
  clearAllData: () => Promise<ClearAllDataResult>
  getSettings: () => Promise<AppSettings>
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  selectDirectory: (options?: {
    title?: string
    defaultPath?: string
  }) => Promise<string | null>
}
