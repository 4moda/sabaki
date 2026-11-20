import {
  classifyMediaTypeByExt,
  type ImportJobRecord,
  type ImportProgressEvent,
  type MediaFileRecord
} from '../../domain/models'
import type {
  IExifParserGateway,
  IFileRepository,
  IFileSystemGateway,
  IJobRepository,
  INotificationGateway
} from '../../domain/ports'
import {
  analyzeSessionDigest,
  buildTargetFilePath,
  formatPhotoExifCaption,
  resolveFileImportAction
} from '../../domain/services'
import type {
  ExecuteImportJobRequest,
  ExecuteImportJobResult
} from '../dto/ipcContract'

/**
 * Port dependencies injected into ExecuteImportJobUseCase.
 */
export interface ExecuteImportJobDeps {
  fileSystem: IFileSystemGateway
  exifParser: IExifParserGateway
  fileRepository: IFileRepository
  jobRepository: IJobRepository
  notificationGateway: INotificationGateway
}

interface ParsedCaptureFields {
  capturedYear: number
  capturedMonth: string
  capturedDay: string
  capturedHour: number
}

/**
 * Extracts year, month, day, and local hour fields from an ISO-like capture timestamp.
 */
function extractCaptureFields(capturedAt: string, fallbackDate: Date): ParsedCaptureFields {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}))?/.exec(capturedAt.trim())
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = isoMatch[2]
    const day = isoMatch[3]
    const hour = isoMatch[4] !== undefined ? Number(isoMatch[4]) : 0
    return {
      capturedYear: year,
      capturedMonth: `${isoMatch[1]}-${month}`,
      capturedDay: `${isoMatch[1]}-${month}-${day}`,
      capturedHour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 0
    }
  }

  const parsed = new Date(capturedAt)
  const date = Number.isNaN(parsed.getTime()) ? fallbackDate : parsed
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return {
    capturedYear: date.getFullYear(),
    capturedMonth: `${y}-${m}`,
    capturedDay: `${y}-${m}-${d}`,
    capturedHour: date.getHours()
  }
}

/**
 * Normalizes a file extension to uppercase without leading dot.
 */
function normalizeExt(ext: string): string {
  const cleaned = ext.trim().replace(/^\./, '').toUpperCase()
  return cleaned.length > 0 ? cleaned : 'UNKNOWN'
}

/**
 * Orchestrates a complete media import session from scan through conflict resolution,
 * file copy, repository persistence, session digest generation, and OS notification.
 */
export class ExecuteImportJobUseCase {
  constructor(private readonly deps: ExecuteImportJobDeps) {}

  async execute(request: ExecuteImportJobRequest): Promise<ExecuteImportJobResult> {
    const {
      fileSystem,
      exifParser,
      fileRepository,
      jobRepository,
      notificationGateway
    } = this.deps

    const emitProgress = (event: ImportProgressEvent): void => {
      request.onProgress?.(event)
    }

    emitProgress({
      phase: 'scanning',
      processedFiles: 0,
      totalFiles: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      renamedFiles: 0,
      overwrittenFiles: 0,
      errorFiles: 0,
      percentage: 0
    })

    const entries = await fileSystem.scanDirectory(request.sourceDir)
    const startedAt = new Date().toISOString()

    const createdJob = jobRepository.createJob({
      sourceDir: request.sourceDir,
      destRoot: request.destRoot,
      pathTemplate: request.pathTemplate,
      conflictPolicy: request.conflictPolicy,
      status: 'running',
      totalFiles: entries.length,
      copiedFiles: 0,
      skippedFiles: 0,
      renamedFiles: 0,
      overwrittenFiles: 0,
      errorFiles: 0,
      totalBytes: 0,
      startedAt
    })

    let copiedFiles = 0
    let skippedFiles = 0
    let renamedFiles = 0
    let overwrittenFiles = 0
    let errorFiles = 0
    let totalBytes = 0

    const importedFiles: MediaFileRecord[] = []
    const reservedDestPaths = new Set<string>()
    const knownExistingPaths = new Set<string>()
    const seenSessionHashes = new Set<string>()

    try {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i]
        try {
          const sourceHash = await fileSystem.computeFileHash(entry.path)
          const isHashInHistory =
            seenSessionHashes.has(sourceHash) || fileRepository.existsByHash(sourceHash)

          const exif = await exifParser.parseExif(entry.path, entry.mtime)
          const normalizedExt = normalizeExt(entry.ext)
          const targetPath = buildTargetFilePath(
            request.destRoot,
            request.pathTemplate,
            {
              capturedAt: exif.capturedAt,
              originalName: entry.name,
              ext: normalizedExt
            }
          )

          const existsOnDisk = await fileSystem.fileExists(targetPath)
          if (existsOnDisk) {
            knownExistingPaths.add(targetPath)
          }
          const destFileExists = reservedDestPaths.has(targetPath) || existsOnDisk

          let existingDestHash: string | undefined
          if (
            existsOnDisk &&
            request.conflictPolicy.fileConflictMode === 'skip_same_hash_rename_diff'
          ) {
            existingDestHash = await fileSystem.computeFileHash(targetPath)
          }

          let resolution = resolveFileImportAction({
            targetPath,
            sourceHash,
            policy: request.conflictPolicy,
            isHashInHistory,
            destFileExists,
            existingDestHash,
            pathExistsCheck: (candidatePath) =>
              reservedDestPaths.has(candidatePath) || knownExistingPaths.has(candidatePath)
          })

          // Verify any generated renamed path does not collide with an uncached file on disk
          while (resolution.action === 'rename') {
            const candidateExistsOnDisk = await fileSystem.fileExists(
              resolution.finalDestPath
            )
            if (!candidateExistsOnDisk) {
              break
            }
            knownExistingPaths.add(resolution.finalDestPath)
            resolution = resolveFileImportAction({
              targetPath,
              sourceHash,
              policy: request.conflictPolicy,
              isHashInHistory,
              destFileExists,
              existingDestHash,
              pathExistsCheck: (candidatePath) =>
                reservedDestPaths.has(candidatePath) ||
                knownExistingPaths.has(candidatePath)
            })
          }

          if (
            resolution.action === 'skip_duplicate' ||
            resolution.action === 'skip_existing'
          ) {
            skippedFiles += 1
          } else {
            await fileSystem.copyFile(entry.path, resolution.finalDestPath)
            reservedDestPaths.add(resolution.finalDestPath)
            seenSessionHashes.add(sourceHash)

            if (resolution.action === 'copy') {
              copiedFiles += 1
            } else if (resolution.action === 'rename') {
              renamedFiles += 1
            } else if (resolution.action === 'overwrite') {
              overwrittenFiles += 1
            }

            totalBytes += entry.size

            const captureFields = extractCaptureFields(exif.capturedAt, entry.mtime)
            const mediaType = classifyMediaTypeByExt(normalizedExt)
            const snsCaption = formatPhotoExifCaption({
              exif,
              capturedDay: captureFields.capturedDay
            })

            const savedRecord = fileRepository.save({
              fileHash: sourceHash,
              originalName: entry.name,
              sourcePath: entry.path,
              destPath: resolution.finalDestPath,
              fileSize: entry.size,
              mediaType,
              ext: normalizedExt,
              capturedAt: exif.capturedAt,
              capturedYear: captureFields.capturedYear,
              capturedMonth: captureFields.capturedMonth,
              capturedDay: captureFields.capturedDay,
              capturedHour: captureFields.capturedHour,
              exif,
              favorite: false,
              snsCaption,
              webPublic: false,
              jobId: createdJob.id,
              importedAt: new Date().toISOString()
            })

            importedFiles.push(savedRecord)
          }
        } catch {
          errorFiles += 1
        }

        const processedFiles = i + 1
        const percentage =
          entries.length > 0 ? Math.round((processedFiles / entries.length) * 100) : 100

        emitProgress({
          jobId: createdJob.id,
          phase: 'copying',
          processedFiles,
          totalFiles: entries.length,
          currentFileName: entry.name,
          copiedFiles,
          skippedFiles,
          renamedFiles,
          overwrittenFiles,
          errorFiles,
          percentage
        })
      }

      emitProgress({
        jobId: createdJob.id,
        phase: 'analyzing',
        processedFiles: entries.length,
        totalFiles: entries.length,
        copiedFiles,
        skippedFiles,
        renamedFiles,
        overwrittenFiles,
        errorFiles,
        percentage: 100
      })

      const digest = analyzeSessionDigest(importedFiles, {
        jobId: createdJob.id,
        totalFiles: entries.length,
        copiedFiles,
        skippedFiles,
        renamedFiles,
        overwrittenFiles,
        errorFiles,
        totalBytes
      })

      const completedAt = new Date().toISOString()
      const digestJson = JSON.stringify(digest)

      const jobPatch: Partial<ImportJobRecord> = {
        status: 'completed',
        copiedFiles,
        skippedFiles,
        renamedFiles,
        overwrittenFiles,
        errorFiles,
        totalBytes,
        completedAt,
        digestJson
      }

      if (createdJob.id !== undefined) {
        jobRepository.updateJob(createdJob.id, jobPatch)
      }

      const completedJob: ImportJobRecord = {
        ...createdJob,
        ...jobPatch
      }

      notificationGateway.notifyImportComplete(digest)

      emitProgress({
        jobId: createdJob.id,
        phase: 'completed',
        processedFiles: entries.length,
        totalFiles: entries.length,
        copiedFiles,
        skippedFiles,
        renamedFiles,
        overwrittenFiles,
        errorFiles,
        percentage: 100
      })

      return {
        job: completedJob,
        digest
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const completedAt = new Date().toISOString()

      if (createdJob.id !== undefined) {
        jobRepository.updateJob(createdJob.id, {
          status: 'failed',
          copiedFiles,
          skippedFiles,
          renamedFiles,
          overwrittenFiles,
          errorFiles,
          totalBytes,
          completedAt,
          errorMessage
        })
      }

      emitProgress({
        jobId: createdJob.id,
        phase: 'failed',
        processedFiles: copiedFiles + skippedFiles + renamedFiles + overwrittenFiles + errorFiles,
        totalFiles: entries.length,
        copiedFiles,
        skippedFiles,
        renamedFiles,
        overwrittenFiles,
        errorFiles,
        percentage: 100
      })

      throw error
    }
  }
}
