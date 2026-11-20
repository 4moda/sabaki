import { classifyMediaTypeByExt, type MediaType } from '../../domain/models'
import type { IFileSystemGateway } from '../../domain/ports'
import type { ScanSourceDirectoryResult } from '../dto/ipcContract'

const MAX_SAMPLE_FILES = 20

/**
 * Strips the source root prefix from a file path using pure string operations.
 */
function toRelativeSourcePath(sourceRoot: string, fullPath: string): string {
  const normalizedRoot = sourceRoot.replace(/[/\\]+$/, '')
  if (
    normalizedRoot.length > 0 &&
    fullPath.toLowerCase().startsWith(normalizedRoot.toLowerCase())
  ) {
    const rest = fullPath.slice(normalizedRoot.length).replace(/^[/\\]+/, '')
    if (rest.length > 0) {
      return rest
    }
  }
  return fullPath
}

/**
 * Normalizes a file extension to uppercase without leading dot.
 */
function normalizeExt(ext: string): string {
  const cleaned = ext.trim().replace(/^\./, '').toUpperCase()
  return cleaned.length > 0 ? cleaned : 'UNKNOWN'
}

/**
 * Scans a source directory (e.g., SD card DCIM folder) and aggregates
 * file counts, total size, media type breakdown, extension breakdown, and sample files.
 */
export class ScanSourceDirectoryUseCase {
  constructor(private readonly fileSystem: IFileSystemGateway) {}

  async execute(sourceDir: string): Promise<ScanSourceDirectoryResult> {
    const entries = await this.fileSystem.scanDirectory(sourceDir)

    const mediaTypeBreakdown: Record<MediaType, number> = {
      RAW: 0,
      JPEG: 0,
      VIDEO: 0
    }
    const extBreakdown: Record<string, number> = {}
    let totalBytes = 0

    const sampleFiles: ScanSourceDirectoryResult['sampleFiles'] = []

    for (const entry of entries) {
      const ext = normalizeExt(entry.ext)
      const mediaType = classifyMediaTypeByExt(ext)

      mediaTypeBreakdown[mediaType] += 1
      extBreakdown[ext] = (extBreakdown[ext] ?? 0) + 1
      totalBytes += entry.size

      if (sampleFiles.length < MAX_SAMPLE_FILES) {
        sampleFiles.push({
          originalName: entry.name,
          relativeSourcePath: toRelativeSourcePath(sourceDir, entry.path),
          ext,
          mediaType,
          fileSize: entry.size,
          capturedAt: entry.mtime.toISOString()
        })
      }
    }

    return {
      sourceDir,
      totalFiles: entries.length,
      totalBytes,
      rawCount: mediaTypeBreakdown.RAW,
      jpegCount: mediaTypeBreakdown.JPEG,
      videoCount: mediaTypeBreakdown.VIDEO,
      mediaTypeBreakdown,
      extBreakdown,
      sampleFiles
    }
  }
}
