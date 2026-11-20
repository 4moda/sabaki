import {
  classifyMediaTypeByExt,
  type MediaFileRecord
} from '../../domain/models'
import type { IFileRepository, IJobRepository } from '../../domain/ports'
import {
  analyzeSessionDigest,
  formatPhotoExifCaption
} from '../../domain/services'
import type {
  SeedDemoDataOptions,
  SeedDemoDataResult
} from '../dto/ipcContract'

/**
 * Port dependencies injected into SeedDemoDataUseCase.
 */
export interface SeedDemoDataDeps {
  fileRepository: IFileRepository
  jobRepository: IJobRepository
}

interface GearProfile {
  cameraMake: string
  cameraModel: string
  lensModel: string
  rawExt: string
  focalLengths: number[]
  fNumbers: number[]
  weight: number
}

const DEMO_GEAR_PROFILES: readonly GearProfile[] = [
  {
    cameraMake: 'SONY',
    cameraModel: 'ILCE-7M4',
    lensModel: 'FE 35mm F1.4 GM',
    rawExt: 'ARW',
    focalLengths: [35],
    fNumbers: [1.4, 1.8, 2.0, 2.8, 4.0],
    weight: 42
  },
  {
    cameraMake: 'SONY',
    cameraModel: 'ILCE-7M4',
    lensModel: 'FE 24-70mm F2.8 GM II',
    rawExt: 'ARW',
    focalLengths: [24, 28, 35, 50, 70],
    fNumbers: [2.8, 4.0, 5.6, 8.0],
    weight: 26
  },
  {
    cameraMake: 'SONY',
    cameraModel: 'ILCE-7CR',
    lensModel: 'FE 85mm F1.4 GM II',
    rawExt: 'ARW',
    focalLengths: [85],
    fNumbers: [1.4, 1.8, 2.0, 2.8],
    weight: 18
  },
  {
    cameraMake: 'Canon',
    cameraModel: 'EOS R5',
    lensModel: 'RF 28-70mm F2L',
    rawExt: 'CR3',
    focalLengths: [28, 35, 50, 70],
    fNumbers: [2.0, 2.8, 4.0, 5.6],
    weight: 14
  }
]

const DEMO_EXPOSURE_TIMES = [
  1 / 4000,
  1 / 2000,
  1 / 1000,
  1 / 500,
  1 / 250,
  1 / 125,
  1 / 60
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Simple deterministic PRNG (Mulberry32) so seeded demo data is rich and reproducible.
 */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeightedProfile(rand: () => number): GearProfile {
  const totalWeight = DEMO_GEAR_PROFILES.reduce((sum, p) => sum + p.weight, 0)
  let roll = rand() * totalWeight
  for (const profile of DEMO_GEAR_PROFILES) {
    roll -= profile.weight
    if (roll <= 0) {
      return profile
    }
  }
  return DEMO_GEAR_PROFILES[0]
}

function parseReferenceDateMs(referenceDate?: string | Date): number {
  if (!referenceDate) {
    const now = new Date()
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  }
  if (typeof referenceDate === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate.trim())
    if (match) {
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
    const parsed = new Date(referenceDate)
    if (!Number.isNaN(parsed.getTime())) {
      return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    }
  } else if (!Number.isNaN(referenceDate.getTime())) {
    return Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate()
    )
  }
  const now = new Date()
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * Generates realistic multi-month / 52-week photography demo records and an accompanying
 * completed import job with a computed SessionDigest for instant onboarding.
 */
export class SeedDemoDataUseCase {
  constructor(private readonly deps: SeedDemoDataDeps) {}

  execute(options?: SeedDemoDataOptions): SeedDemoDataResult {
    const { fileRepository, jobRepository } = this.deps
    const shotCount = Math.max(1, Math.floor(options?.shotCount ?? 180))
    const refUtcMs = parseReferenceDateMs(options?.referenceDate)
    const rand = createSeededRng(20261119)

    // Pre-build a set of realistic active shooting days spread across 52 weeks,
    // including a 4-day recent streak ending on referenceDate for the heatmap.
    const activeDayOffsets: number[] = [0, 1, 2, 3]
    for (let week = 1; week < 52; week += 1) {
      const baseOffset = week * 7
      activeDayOffsets.push(baseOffset)
      if (rand() < 0.65) {
        activeDayOffsets.push(baseOffset + 1)
      }
      if (rand() < 0.35) {
        activeDayOffsets.push(baseOffset + 3)
      }
    }

    const nowIso = options?.referenceDate
      ? new Date(refUtcMs + 12 * 60 * 60 * 1000).toISOString()
      : new Date().toISOString()
    const createdJob = jobRepository.createJob({
      sourceDir: '/DEMO_SD/DCIM/100MSDCF',
      destRoot: '/DemoLibrary/Photos',
      pathTemplate: '{YYYY}/{YYYY-MM-DD}/{Ext}',
      conflictPolicy: {
        skipHistoryDuplicates: true,
        fileConflictMode: 'skip_same_hash_rename_diff'
      },
      status: 'running',
      totalFiles: shotCount,
      copiedFiles: shotCount,
      skippedFiles: 0,
      renamedFiles: 0,
      overwrittenFiles: 0,
      errorFiles: 0,
      totalBytes: 0,
      startedAt: nowIso
    })

    const records: MediaFileRecord[] = []
    let totalBytes = 0

    for (let i = 0; i < shotCount; i += 1) {
      const profile = pickWeightedProfile(rand)
      const dayOffset =
        i < 16
          ? activeDayOffsets[i % 4] // Ensure recent streak days have multiple shots
          : activeDayOffsets[Math.floor(rand() * activeDayOffsets.length)]

      const dayDate = new Date(refUtcMs - dayOffset * MS_PER_DAY)
      const y = String(dayDate.getUTCFullYear()).padStart(4, '0')
      const m = String(dayDate.getUTCMonth() + 1).padStart(2, '0')
      const d = String(dayDate.getUTCDate()).padStart(2, '0')
      const capturedDay = `${y}-${m}-${d}`
      const capturedMonth = `${y}-${m}`

      // Mix golden hour (16..18), night (19..22), and daytime (9..15) sessions
      const sessionRoll = rand()
      let capturedHour: number
      if (sessionRoll < 0.38) {
        capturedHour = 16 + Math.floor(rand() * 3) // 16..18 golden hour
      } else if (sessionRoll < 0.68) {
        capturedHour = 19 + Math.floor(rand() * 4) // 19..22 night
      } else {
        capturedHour = 9 + Math.floor(rand() * 7) // 9..15 daytime
      }

      const minute = String(Math.floor(rand() * 60)).padStart(2, '0')
      const second = String(Math.floor(rand() * 60)).padStart(2, '0')
      const hourStr = String(capturedHour).padStart(2, '0')
      const capturedAt = `${capturedDay}T${hourStr}:${minute}:${second}`

      // Mix RAW (~65%), JPEG (~27%), and VIDEO (~8%)
      const typeRoll = rand()
      let ext: string
      let fileSize: number
      if (typeRoll < 0.65) {
        ext = profile.rawExt
        fileSize = 28_000_000 + Math.floor(rand() * 18_000_000)
      } else if (typeRoll < 0.92) {
        ext = 'JPG'
        fileSize = 6_000_000 + Math.floor(rand() * 8_000_000)
      } else {
        ext = 'MP4'
        fileSize = 45_000_000 + Math.floor(rand() * 60_000_000)
      }

      const mediaType = classifyMediaTypeByExt(ext)
      const focalLength =
        profile.focalLengths[Math.floor(rand() * profile.focalLengths.length)]
      const fNumber =
        profile.fNumbers[Math.floor(rand() * profile.fNumbers.length)]
      const iso =
        capturedHour >= 19
          ? [1600, 3200, 6400][Math.floor(rand() * 3)]
          : [100, 200, 400, 800][Math.floor(rand() * 4)]
      const exposureTime =
        DEMO_EXPOSURE_TIMES[Math.floor(rand() * DEMO_EXPOSURE_TIMES.length)]

      const seqNum = String(i + 1).padStart(4, '0')
      const originalName = mediaType === 'VIDEO' ? `C${seqNum}.${ext}` : `DSC${seqNum}.${ext}`

      const exif = {
        capturedAt,
        cameraMake: profile.cameraMake,
        cameraModel: profile.cameraModel,
        lensModel: profile.lensModel,
        focalLength,
        focalLength35mm: focalLength,
        fNumber,
        iso,
        exposureTime,
        imageWidth: mediaType === 'VIDEO' ? 3840 : 7008,
        imageHeight: mediaType === 'VIDEO' ? 2160 : 4672
      }

      const favorite = i % 10 === 0
      const webPublic = i % 12 === 0

      records.push({
        fileHash: `demo-sha256-${seqNum}-${capturedDay}`,
        originalName,
        sourcePath: `/DEMO_SD/DCIM/100MSDCF/${originalName}`,
        destPath: `/DemoLibrary/Photos/${y}/${capturedDay}/${ext}/${originalName}`,
        fileSize,
        mediaType,
        ext,
        capturedAt,
        capturedYear: dayDate.getUTCFullYear(),
        capturedMonth,
        capturedDay,
        capturedHour,
        exif,
        favorite,
        snsCaption: formatPhotoExifCaption({ exif, capturedDay }),
        webPublic,
        webSyncedAt: webPublic ? nowIso : undefined,
        jobId: createdJob.id,
        importedAt: nowIso
      })

      totalBytes += fileSize
    }

    fileRepository.saveBatch(records)

    const digest = analyzeSessionDigest(records, {
      jobId: createdJob.id,
      totalFiles: records.length,
      copiedFiles: records.length,
      skippedFiles: 0,
      renamedFiles: 0,
      overwrittenFiles: 0,
      errorFiles: 0,
      totalBytes
    })

    const completedAt = options?.referenceDate
      ? new Date(refUtcMs + 12 * 60 * 60 * 1000 + 30_000).toISOString()
      : new Date().toISOString()
    const jobPatch = {
      status: 'completed' as const,
      totalBytes,
      completedAt,
      digestJson: JSON.stringify(digest)
    }

    if (createdJob.id !== undefined) {
      jobRepository.updateJob(createdJob.id, jobPatch)
    }

    return {
      insertedFiles: records.length,
      job: {
        ...createdJob,
        ...jobPatch
      },
      digest
    }
  }
}
