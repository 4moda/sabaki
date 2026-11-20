import type { ConflictPolicyConfig } from './ConflictPolicy'
import type { MediaType } from './MediaFile'

/**
 * Lifecycle state of an import job.
 */
export type ImportJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * Persisted record of an import job execution.
 */
export interface ImportJobRecord {
  id?: number
  sourceDir: string
  destRoot: string
  pathTemplate: string
  conflictPolicy: ConflictPolicyConfig
  status: ImportJobStatus
  totalFiles: number
  copiedFiles: number
  skippedFiles: number
  renamedFiles: number
  overwrittenFiles: number
  errorFiles: number
  totalBytes: number
  startedAt: string
  completedAt?: string
  digestJson?: string
  errorMessage?: string
}

/**
 * Preview result returned when scanning a source directory before import.
 */
export interface ImportScanPreview {
  sourceDir: string
  totalFiles: number
  totalBytes: number
  mediaTypeBreakdown: Record<MediaType, number>
  extBreakdown: Record<string, number>
  sampleFiles: Array<{
    originalName: string
    relativeSourcePath: string
    ext: string
    mediaType: MediaType
    fileSize: number
    capturedAt: string
  }>
}

/**
 * Real-time progress payload emitted during an active import job.
 */
export interface ImportProgressEvent {
  jobId?: number
  phase: 'scanning' | 'copying' | 'analyzing' | 'completed' | 'failed'
  processedFiles: number
  totalFiles: number
  currentFileName?: string
  copiedFiles: number
  skippedFiles: number
  renamedFiles: number
  overwrittenFiles: number
  errorFiles: number
  percentage: number
}

/**
 * Persistent application preferences.
 */
export interface AppSettings {
  defaultSourceDir?: string
  defaultDestRoot: string
  pathTemplate: string
  conflictPolicy: ConflictPolicyConfig
  minimizeToTray: boolean
  enableOsNotifications: boolean
  autoOpenDigestModal: boolean
  fastHashMode: boolean
  theme: 'system' | 'light' | 'dark'
}
