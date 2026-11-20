import type { ConflictPolicyConfig } from '../models/ConflictPolicy'

/**
 * Resolved action to perform for a candidate file during import.
 */
export type FileImportAction =
  | 'copy'
  | 'skip_duplicate'
  | 'skip_existing'
  | 'rename'
  | 'overwrite'

/**
 * Input parameters for pure conflict resolution logic.
 */
export interface ConflictResolutionInput {
  targetPath: string
  sourceHash: string
  policy: ConflictPolicyConfig
  isHashInHistory: boolean
  destFileExists: boolean
  existingDestHash?: string
  pathExistsCheck?: (candidatePath: string) => boolean
}

/**
 * Result of resolving a file import conflict.
 */
export interface ConflictResolutionResult {
  action: FileImportAction
  finalDestPath: string
  reason: string
}

const MAX_RENAME_ATTEMPTS = 100_000

/**
 * Splits a file path into directory prefix (including trailing separator if present),
 * file stem, and extension (including leading dot if present).
 */
function splitFilePathParts(targetPath: string): {
  dirPrefix: string
  stem: string
  extWithDot: string
} {
  const lastSlash = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'))
  const dirPrefix = lastSlash >= 0 ? targetPath.slice(0, lastSlash + 1) : ''
  const fileName = lastSlash >= 0 ? targetPath.slice(lastSlash + 1) : targetPath

  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return { dirPrefix, stem: fileName, extWithDot: '' }
  }

  return {
    dirPrefix,
    stem: fileName.slice(0, lastDot),
    extWithDot: fileName.slice(lastDot)
  }
}

/**
 * Generates a unique renamed path by appending `_1`, `_2`, etc. before the file extension
 * until `existsPredicate(candidatePath)` returns false.
 *
 * Example: `/2026/2026-11-19/ARW/DSC0001.ARW` -> `/2026/2026-11-19/ARW/DSC0001_1.ARW`
 */
export function generateUniqueRenamedPath(
  targetPath: string,
  existsPredicate: (candidatePath: string) => boolean
): string {
  const { dirPrefix, stem, extWithDot } = splitFilePathParts(targetPath)

  for (let suffix = 1; suffix <= MAX_RENAME_ATTEMPTS; suffix += 1) {
    const candidate = `${dirPrefix}${stem}_${suffix}${extWithDot}`
    if (!existsPredicate(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `Unable to find an available renamed path for "${targetPath}" after ${MAX_RENAME_ATTEMPTS} attempts`
  )
}

/**
 * Compares two content hashes case-insensitively after trimming whitespace.
 */
function hashesMatch(hashA: string, hashB?: string): boolean {
  if (!hashB) {
    return false
  }
  const normalizedA = hashA.trim().toLowerCase()
  const normalizedB = hashB.trim().toLowerCase()
  return normalizedA.length > 0 && normalizedA === normalizedB
}

/**
 * Pure domain service that resolves the import action for a file based on
 * history deduplication and the 4-mode file conflict policy.
 */
export function resolveFileImportAction(
  params: ConflictResolutionInput
): ConflictResolutionResult {
  const {
    targetPath,
    sourceHash,
    policy,
    isHashInHistory,
    destFileExists,
    existingDestHash,
    pathExistsCheck
  } = params

  if (policy.skipHistoryDuplicates && isHashInHistory) {
    return {
      action: 'skip_duplicate',
      finalDestPath: targetPath,
      reason: 'File content hash already exists in import history'
    }
  }

  if (!destFileExists) {
    return {
      action: 'copy',
      finalDestPath: targetPath,
      reason: 'Destination path does not exist'
    }
  }

  const existsPredicate =
    pathExistsCheck ?? ((candidatePath: string) => candidatePath === targetPath)

  switch (policy.fileConflictMode) {
    case 'skip':
      return {
        action: 'skip_existing',
        finalDestPath: targetPath,
        reason: 'Destination file already exists (policy: skip)'
      }

    case 'overwrite':
      return {
        action: 'overwrite',
        finalDestPath: targetPath,
        reason: 'Destination file exists and will be overwritten (policy: overwrite)'
      }

    case 'rename': {
      const renamedPath = generateUniqueRenamedPath(targetPath, existsPredicate)
      return {
        action: 'rename',
        finalDestPath: renamedPath,
        reason: 'Destination file exists; assigned sequential suffix (policy: rename)'
      }
    }

    case 'skip_same_hash_rename_diff': {
      if (hashesMatch(sourceHash, existingDestHash)) {
        return {
          action: 'skip_duplicate',
          finalDestPath: targetPath,
          reason:
            'Destination file has identical content hash (policy: skip_same_hash_rename_diff)'
        }
      }
      const renamedPath = generateUniqueRenamedPath(targetPath, existsPredicate)
      return {
        action: 'rename',
        finalDestPath: renamedPath,
        reason:
          'Destination file differs in content hash; assigned sequential suffix (policy: skip_same_hash_rename_diff)'
      }
    }
  }
}
