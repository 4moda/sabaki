import type { PathPreset } from '../models/PathTemplate'

/**
 * Recommended and standard path template presets for organizing imported media.
 */
export const PATH_PRESETS: PathPreset[] = [
  {
    id: 'ymd_ext',
    name: '年 / 年-月-日 / 拡張子（推奨）',
    description: '撮影日ごとにフォルダを分け、さらにRAW・JPEG・動画を拡張子別に整理します。',
    template: '{YYYY}/{YYYY-MM-DD}/{Ext}',
    recommended: true
  },
  {
    id: 'ym_ymd_ext',
    name: '年 / 月 / 年月日 / 拡張子',
    description: '年・月階層の下に年月日と拡張子フォルダを作成する大規模ライブラリ向け構成です。',
    template: '{YYYY}/{MM}/{YYYYMMDD}/{Ext}'
  },
  {
    id: 'ymd_flat',
    name: '年 / 年-月-日（拡張子混在）',
    description: 'RAWとJPEGを同じ日付フォルダにまとめて保存したい場合に適しています。',
    template: '{YYYY}/{YYYY-MM-DD}'
  },
  {
    id: 'ym_ext',
    name: '年 / 月 / 拡張子',
    description: '月単位でまとめて拡張子別に整理するシンプルな構成です。',
    template: '{YYYY}/{MM}/{Ext}'
  },
  {
    id: 'ext_ymd',
    name: '拡張子 / 年 / 年-月-日',
    description: '先に拡張子（ARW / JPG / MP4など）で分類してから日付別に整理します。',
    template: '{Ext}/{YYYY}/{YYYY-MM-DD}'
  }
]

interface DateParts {
  year: string
  month: string
  day: string
}

const INVALID_PATH_CHARS_RE = /[<>:"|?*\x00-\x1f]/g

/**
 * Extracts YYYY, MM, DD from a Date or ISO-like string without UTC day-shift on date-only strings.
 */
function parseDateParts(capturedAt: Date | string): DateParts {
  if (typeof capturedAt === 'string') {
    const trimmed = capturedAt.trim()
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
    if (dateOnlyMatch) {
      return {
        year: dateOnlyMatch[1],
        month: dateOnlyMatch[2],
        day: dateOnlyMatch[3]
      }
    }
  }

  const date = capturedAt instanceof Date ? capturedAt : new Date(capturedAt)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid capturedAt date: ${String(capturedAt)}`)
  }

  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return { year, month, day }
}

/**
 * Normalizes an extension string to uppercase without leading dot.
 */
function normalizeExtension(ext: string): string {
  const cleaned = ext.trim().replace(/^\./, '').toUpperCase()
  return sanitizePathSegment(cleaned) || 'UNKNOWN'
}

/**
 * Extracts the extension from a filename (without leading dot), or empty string if none.
 */
function extractExtFromFilename(filename: string): string {
  const baseName = extractBaseName(filename)
  const lastDot = baseName.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === baseName.length - 1) {
    return ''
  }
  return baseName.slice(lastDot + 1)
}

/**
 * Extracts the final filename component from a path-like string.
 */
function extractBaseName(input: string): string {
  const parts = input.split(/[/\\]/)
  return parts[parts.length - 1] ?? ''
}

/**
 * Sanitizes a single path segment by removing OS-forbidden characters and traversal markers.
 */
export function sanitizePathSegment(segment: string): string {
  const cleaned = segment
    .replace(INVALID_PATH_CHARS_RE, '_')
    .trim()
    .replace(/[. ]+$/, '')

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return ''
  }
  return cleaned
}

/**
 * Expands a path template into a sanitized, forward-slash-separated relative folder path.
 */
export function buildRelativeFolderPath(
  template: string,
  params: { capturedAt: Date | string; ext: string }
): string {
  const { year, month, day } = parseDateParts(params.capturedAt)
  const ext = normalizeExtension(params.ext)

  const expanded = template
    .replaceAll('{YYYY}', year)
    .replaceAll('{MM}', month)
    .replaceAll('{DD}', day)
    .replaceAll('{YYYY-MM-DD}', `${year}-${month}-${day}`)
    .replaceAll('{YYYYMMDD}', `${year}${month}${day}`)
    .replaceAll('{Ext}', ext)

  return expanded
    .split(/[/\\]+/)
    .map(sanitizePathSegment)
    .filter((segment) => segment.length > 0)
    .join('/')
}

/**
 * Builds the full destination file path from root, template, capture date, and original filename.
 */
export function buildTargetFilePath(
  destRoot: string,
  template: string,
  params: { capturedAt: Date | string; originalName: string; ext?: string }
): string {
  const sep = destRoot.includes('\\') && !destRoot.includes('/') ? '\\' : '/'
  const trimmedRoot = destRoot.replace(/[/\\]+$/, '')

  const rawExt = params.ext ?? extractExtFromFilename(params.originalName)
  const relativeFolder = buildRelativeFolderPath(template, {
    capturedAt: params.capturedAt,
    ext: rawExt
  })

  const safeFileName = sanitizePathSegment(extractBaseName(params.originalName)) || 'unnamed'
  const parts: string[] = []

  if (trimmedRoot.length > 0) {
    parts.push(trimmedRoot)
  }
  if (relativeFolder.length > 0) {
    parts.push(sep === '\\' ? relativeFolder.replaceAll('/', '\\') : relativeFolder)
  }
  parts.push(safeFileName)

  return parts.join(sep)
}

/**
 * Splits a full destination path produced by {@link buildTargetFilePath} into the
 * destination root and the template-expanded relative part (folders + file name),
 * so UIs can elide the shared root while keeping the routed part fully visible.
 */
export function splitTargetPathForDisplay(
  destRoot: string,
  fullPath: string
): { rootPath: string; separator: '/' | '\\'; relativePath: string } {
  const separator = destRoot.includes('\\') && !destRoot.includes('/') ? '\\' : '/'
  const rootPath = destRoot.replace(/[/\\]+$/, '')
  const prefix = rootPath.length > 0 ? `${rootPath}${separator}` : ''

  if (prefix.length > 0 && fullPath.startsWith(prefix)) {
    return { rootPath, separator, relativePath: fullPath.slice(prefix.length) }
  }
  return { rootPath: '', separator, relativePath: fullPath }
}

/**
 * Generates real-time sample destination paths for RAW, JPEG, and VIDEO files.
 */
export function generateRealtimePreviews(
  destRoot: string,
  template: string,
  sampleDate: Date = new Date(2026, 10, 19, 14, 30, 0)
): Array<{ label: string; ext: string; fullPath: string }> {
  const samples = [
    { label: 'RAW', ext: 'ARW', originalName: 'DSC0001.ARW' },
    { label: 'JPEG', ext: 'JPG', originalName: 'DSC0001.JPG' },
    { label: 'VIDEO', ext: 'MP4', originalName: 'C0001.MP4' }
  ]

  return samples.map((sample) => ({
    label: sample.label,
    ext: sample.ext,
    fullPath: buildTargetFilePath(destRoot, template, {
      capturedAt: sampleDate,
      originalName: sample.originalName,
      ext: sample.ext
    })
  }))
}
