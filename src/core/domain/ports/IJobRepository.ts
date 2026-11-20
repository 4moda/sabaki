import type { ImportJobRecord } from '../models/ImportJob'

/**
 * Persistence port for import job execution records.
 */
export interface IJobRepository {
  createJob(job: Omit<ImportJobRecord, 'id'>): ImportJobRecord
  updateJob(id: number, patch: Partial<ImportJobRecord>): void
  findRecentJobs(limit?: number): ImportJobRecord[]
  findById(id: number): ImportJobRecord | null
  deleteAll(): number
}
