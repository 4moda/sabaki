import type { MediaType } from './MediaFile'

/**
 * Automatically detected shooting style badge for an import session.
 */
export interface ShootingStyleTag {
  id: string
  emoji: string
  label: string
  description: string
}

/**
 * Analytical summary generated after an import session completes.
 */
export interface SessionDigest {
  jobId?: number
  totalFiles: number
  copiedFiles: number
  skippedFiles: number
  renamedFiles: number
  overwrittenFiles: number
  errorFiles: number
  totalBytes: number
  extBreakdown: Record<string, number>
  mediaTypeBreakdown: Record<MediaType, number>
  topCamera?: { model: string; count: number; ratio: number }
  topLens?: { model: string; count: number; ratio: number }
  topFocalLengths: Array<{ focalLength: number; count: number; ratio: number }>
  wideApertureRatio: number
  styleTags: ShootingStyleTag[]
  headlineSummary: string
  snsShareText: string
}
