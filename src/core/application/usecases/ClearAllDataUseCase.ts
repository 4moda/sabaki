import type { IFileRepository, IJobRepository } from '../../domain/ports'
import type { ClearAllDataResult } from '../dto/ipcContract'

/**
 * Port dependencies injected into ClearAllDataUseCase.
 */
export interface ClearAllDataDeps {
  fileRepository: IFileRepository
  jobRepository: IJobRepository
  onCleared?: () => void
}

/**
 * Clears all persisted imported media records and import job history from the local database
 * without deleting any actual photo/video files on disk.
 */
export class ClearAllDataUseCase {
  constructor(private readonly deps: ClearAllDataDeps) {}

  execute(): ClearAllDataResult {
    const { fileRepository, jobRepository, onCleared } = this.deps
    const deletedFiles = fileRepository.deleteAll()
    const deletedJobs = jobRepository.deleteAll()
    onCleared?.()

    return {
      deletedFiles,
      deletedJobs
    }
  }
}
