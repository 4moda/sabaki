import type {
  AppSettings,
  ConflictPolicyConfig,
  ConflictResolutionMode,
  PathPreset
} from '@core/domain/models'

export const DEFAULT_PATH_TEMPLATE = '{YYYY}/{YYYY-MM-DD}/{Ext}'

export const DEFAULT_CONFLICT_POLICY: ConflictPolicyConfig = {
  skipHistoryDuplicates: true,
  fileConflictMode: 'skip_same_hash_rename_diff'
}

/**
 * Import session values that are seeded from the persisted settings (「常駐・設定」).
 * Edits made on the Import page are temporary overrides for the current import only.
 */
export interface ImportSessionDefaults {
  sourceRoot: string
  destRoot: string
  pathTemplate: string
  conflictPolicy: ConflictPolicyConfig
}

/** Baseline before persisted settings are loaded (matches the hook's initial state). */
export const INITIAL_SESSION_DEFAULTS: ImportSessionDefaults = {
  sourceRoot: '',
  destRoot: '',
  pathTemplate: DEFAULT_PATH_TEMPLATE,
  conflictPolicy: DEFAULT_CONFLICT_POLICY
}

export function isSameConflictPolicy(
  a: ConflictPolicyConfig,
  b: ConflictPolicyConfig
): boolean {
  return (
    a.skipHistoryDuplicates === b.skipHistoryDuplicates &&
    a.fileConflictMode === b.fileConflictMode
  )
}

/**
 * Maps persisted settings to session defaults, keeping `fallback` for missing / empty values.
 */
export function toSessionDefaults(
  settings: Partial<AppSettings> | null | undefined,
  fallback: ImportSessionDefaults
): ImportSessionDefaults {
  if (!settings) {
    return fallback
  }
  return {
    sourceRoot: settings.defaultSourceDir ?? fallback.sourceRoot,
    destRoot: settings.defaultDestRoot ?? fallback.destRoot,
    pathTemplate: settings.pathTemplate || fallback.pathTemplate,
    conflictPolicy: settings.conflictPolicy ?? fallback.conflictPolicy
  }
}

/**
 * Re-applies changed persisted defaults to the session field by field.
 * A field the user changed on the Import page (differs from the previous defaults)
 * is a temporary override and is kept; untouched fields follow the new defaults.
 * Path templates are compared after trimming, consistent with {@link getSessionOverrides}.
 */
export function syncSessionWithDefaults(
  current: ImportSessionDefaults,
  previousDefaults: ImportSessionDefaults,
  nextDefaults: ImportSessionDefaults
): ImportSessionDefaults {
  return {
    sourceRoot:
      current.sourceRoot === previousDefaults.sourceRoot
        ? nextDefaults.sourceRoot
        : current.sourceRoot,
    destRoot:
      current.destRoot === previousDefaults.destRoot ? nextDefaults.destRoot : current.destRoot,
    pathTemplate:
      current.pathTemplate.trim() === previousDefaults.pathTemplate.trim()
        ? nextDefaults.pathTemplate
        : current.pathTemplate,
    conflictPolicy: isSameConflictPolicy(current.conflictPolicy, previousDefaults.conflictPolicy)
      ? nextDefaults.conflictPolicy
      : current.conflictPolicy
  }
}

export interface ImportSessionOverrides {
  pathTemplate: boolean
  conflictPolicy: boolean
}

/**
 * Reports which advanced settings are temporarily overridden for the current import.
 */
export function getSessionOverrides(
  current: Pick<ImportSessionDefaults, 'pathTemplate' | 'conflictPolicy'>,
  defaults: Pick<ImportSessionDefaults, 'pathTemplate' | 'conflictPolicy'>
): ImportSessionOverrides {
  return {
    pathTemplate: current.pathTemplate.trim() !== defaults.pathTemplate.trim(),
    conflictPolicy: !isSameConflictPolicy(current.conflictPolicy, defaults.conflictPolicy)
  }
}

const CONFLICT_MODE_SHORT_LABELS: Record<ConflictResolutionMode, string> = {
  skip_same_hash_rename_diff: '同一スキップ・別物リネーム',
  skip: '常にスキップ',
  rename: '常に連番リネーム',
  overwrite: '上書き'
}

/**
 * One-line summary of a conflict policy for collapsed views.
 */
export function summarizeConflictPolicy(policy: ConflictPolicyConfig): string {
  const history = policy.skipHistoryDuplicates ? '履歴重複スキップ ON' : '履歴重複スキップ OFF'
  return `${history} ・ 同名時: ${CONFLICT_MODE_SHORT_LABELS[policy.fileConflictMode]}`
}

/**
 * One-line summary of a path template for collapsed views (marks templates matching no preset).
 */
export function summarizePathTemplate(template: string, presets: readonly PathPreset[]): string {
  const effective = template.trim() || DEFAULT_PATH_TEMPLATE
  const isPreset = presets.some((item) => item.template === effective)
  return isPreset ? effective : `${effective}（カスタム）`
}
