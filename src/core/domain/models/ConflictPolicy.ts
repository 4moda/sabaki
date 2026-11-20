/**
 * Strategy for handling destination filename collisions during import.
 */
export type ConflictResolutionMode =
  | 'skip_same_hash_rename_diff'
  | 'skip'
  | 'rename'
  | 'overwrite'

/**
 * User-configurable duplicate & conflict resolution policy.
 */
export interface ConflictPolicyConfig {
  skipHistoryDuplicates: boolean
  fileConflictMode: ConflictResolutionMode
}

/**
 * Descriptive metadata for a conflict resolution mode.
 */
export interface ConflictModeMeta {
  mode: ConflictResolutionMode
  title: string
  description: string
  recommended?: boolean
}

/**
 * Japanese metadata catalog for the four conflict resolution modes.
 */
export const CONFLICT_MODES_META: readonly ConflictModeMeta[] = [
  {
    mode: 'skip_same_hash_rename_diff',
    title: '内容ハッシュ比較（同一ならスキップ／別物なら連番リネーム）',
    description:
      '保存先に同名ファイルがある場合、SHA-256ハッシュを比較して同一ファイルならスキップし、別ファイルなら _1, _2 の連番を付与して安全に保存します。',
    recommended: true
  },
  {
    mode: 'skip',
    title: '常にスキップ',
    description:
      '保存先に同名ファイルが既に存在する場合、内容に関わらずコピーをスキップします。'
  },
  {
    mode: 'rename',
    title: '常に連番リネーム',
    description:
      '保存先に同名ファイルが存在する場合、常に _1, _2 などの連番を付与して別ファイルとして保存します。'
  },
  {
    mode: 'overwrite',
    title: '上書き',
    description:
      '保存先に同名ファイルが存在する場合、既存のファイルを新しいファイルで上書きします。'
  }
]
