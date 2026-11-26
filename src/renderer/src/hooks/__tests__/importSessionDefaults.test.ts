import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@core/domain/models'
import { PATH_PRESETS } from '@core/domain/services'
import {
  DEFAULT_CONFLICT_POLICY,
  DEFAULT_PATH_TEMPLATE,
  INITIAL_SESSION_DEFAULTS,
  getSessionOverrides,
  isSameConflictPolicy,
  summarizeConflictPolicy,
  summarizePathTemplate,
  syncSessionWithDefaults,
  toSessionDefaults,
  type ImportSessionDefaults
} from '@renderer/hooks/importSessionDefaults'

const persisted: ImportSessionDefaults = {
  sourceRoot: 'E:/DCIM',
  destRoot: 'D:/Photos',
  pathTemplate: DEFAULT_PATH_TEMPLATE,
  conflictPolicy: DEFAULT_CONFLICT_POLICY
}

describe('importSessionDefaults: persisted settings -> session defaults', () => {
  it('maps AppSettings fields and falls back for missing or empty values', () => {
    const settings: Partial<AppSettings> = {
      defaultDestRoot: 'F:/Archive',
      pathTemplate: '',
      conflictPolicy: { skipHistoryDuplicates: false, fileConflictMode: 'rename' }
    }

    expect(toSessionDefaults(settings, persisted)).toEqual({
      sourceRoot: 'E:/DCIM',
      destRoot: 'F:/Archive',
      pathTemplate: DEFAULT_PATH_TEMPLATE,
      conflictPolicy: { skipHistoryDuplicates: false, fileConflictMode: 'rename' }
    })
    expect(toSessionDefaults(null, persisted)).toBe(persisted)
  })

  it('compares conflict policies by value', () => {
    expect(isSameConflictPolicy(DEFAULT_CONFLICT_POLICY, { ...DEFAULT_CONFLICT_POLICY })).toBe(
      true
    )
    expect(
      isSameConflictPolicy(DEFAULT_CONFLICT_POLICY, {
        ...DEFAULT_CONFLICT_POLICY,
        fileConflictMode: 'overwrite'
      })
    ).toBe(false)
  })
})

describe('importSessionDefaults: syncing with changed persisted settings', () => {
  it('fills an untouched initial session from the first loaded settings', () => {
    expect(syncSessionWithDefaults(INITIAL_SESSION_DEFAULTS, INITIAL_SESSION_DEFAULTS, persisted))
      .toEqual(persisted)
  })

  it('keeps temporary overrides made on the Import page and follows new defaults elsewhere', () => {
    const current: ImportSessionDefaults = {
      ...persisted,
      sourceRoot: 'G:/DCIM/101MSDCF',
      pathTemplate: '{YYYY}/{MM}/{Ext}'
    }
    const next: ImportSessionDefaults = {
      sourceRoot: 'H:/DCIM',
      destRoot: 'F:/Archive',
      pathTemplate: '{Ext}/{YYYY}/{YYYY-MM-DD}',
      conflictPolicy: { skipHistoryDuplicates: false, fileConflictMode: 'skip' }
    }

    expect(syncSessionWithDefaults(current, persisted, next)).toEqual({
      sourceRoot: 'G:/DCIM/101MSDCF',
      destRoot: 'F:/Archive',
      pathTemplate: '{YYYY}/{MM}/{Ext}',
      conflictPolicy: { skipHistoryDuplicates: false, fileConflictMode: 'skip' }
    })
  })

  it('keeps an explicitly provided initial value that differs from the pre-load baseline', () => {
    const current = { ...INITIAL_SESSION_DEFAULTS, destRoot: 'Z:/Explicit' }
    expect(syncSessionWithDefaults(current, INITIAL_SESSION_DEFAULTS, persisted).destRoot).toBe(
      'Z:/Explicit'
    )
  })

  it('is idempotent when the same settings are applied twice', () => {
    const once = syncSessionWithDefaults(INITIAL_SESSION_DEFAULTS, INITIAL_SESSION_DEFAULTS, persisted)
    expect(syncSessionWithDefaults(once, persisted, persisted)).toEqual(once)
  })
})

describe('importSessionDefaults: temporary override detection & summaries', () => {
  it('flags only the advanced settings that differ from persisted defaults', () => {
    expect(getSessionOverrides(persisted, persisted)).toEqual({
      pathTemplate: false,
      conflictPolicy: false
    })
    expect(
      getSessionOverrides(
        {
          pathTemplate: `${DEFAULT_PATH_TEMPLATE} `,
          conflictPolicy: { ...DEFAULT_CONFLICT_POLICY, skipHistoryDuplicates: false }
        },
        persisted
      )
    ).toEqual({ pathTemplate: false, conflictPolicy: true })
  })

  it('summarizes conflict policies in one line', () => {
    expect(summarizeConflictPolicy(DEFAULT_CONFLICT_POLICY)).toBe(
      '履歴重複スキップ ON ・ 同名時: ハッシュ比較で判定'
    )
    expect(
      summarizeConflictPolicy({ skipHistoryDuplicates: false, fileConflictMode: 'overwrite' })
    ).toBe('履歴重複スキップ OFF ・ 同名時: 上書き')
  })

  it('summarizes path templates and marks non-preset patterns as custom', () => {
    expect(summarizePathTemplate(DEFAULT_PATH_TEMPLATE, PATH_PRESETS)).toBe(DEFAULT_PATH_TEMPLATE)
    expect(summarizePathTemplate('  ', PATH_PRESETS)).toBe(DEFAULT_PATH_TEMPLATE)
    expect(summarizePathTemplate('{YYYY}/{DD}', PATH_PRESETS)).toBe('{YYYY}/{DD}（カスタム）')
  })
})
