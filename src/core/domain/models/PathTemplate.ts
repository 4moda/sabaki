/**
 * Supported template tokens for destination folder path generation.
 */
export type PathToken =
  | '{YYYY}'
  | '{MM}'
  | '{DD}'
  | '{YYYY-MM-DD}'
  | '{YYYYMMDD}'
  | '{Ext}'

/**
 * Descriptive metadata for a path template token.
 */
export interface PathTokenMeta {
  token: PathToken
  label: string
  description: string
  example: string
}

/**
 * Catalog of all supported path builder tokens.
 */
export const SUPPORTED_PATH_TOKENS: readonly PathTokenMeta[] = [
  {
    token: '{YYYY}',
    label: '年 (4桁)',
    description: '撮影日の西暦4桁',
    example: '2026'
  },
  {
    token: '{MM}',
    label: '月 (2桁)',
    description: '撮影月の2桁ゼロ埋め',
    example: '11'
  },
  {
    token: '{DD}',
    label: '日 (2桁)',
    description: '撮影日の2桁ゼロ埋め',
    example: '19'
  },
  {
    token: '{YYYY-MM-DD}',
    label: '年-月-日',
    description: 'ハイフン区切りの撮影日',
    example: '2026-11-19'
  },
  {
    token: '{YYYYMMDD}',
    label: '年月日',
    description: '区切りなしの撮影日',
    example: '20261119'
  },
  {
    token: '{Ext}',
    label: '拡張子',
    description: 'ファイル拡張子（大文字）',
    example: 'ARW'
  }
]

/**
 * Predefined path template preset for quick selection.
 */
export interface PathPreset {
  id: string
  name: string
  description: string
  template: string
  recommended?: boolean
}
