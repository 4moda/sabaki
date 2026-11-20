/**
 * Supported media categories for imported files.
 */
export type MediaType = 'RAW' | 'JPEG' | 'VIDEO'

/**
 * Recognized RAW file extensions (uppercase, without leading dot).
 */
export const RAW_EXTENSIONS: readonly string[] = [
  'ARW',
  'CR2',
  'CR3',
  'NEF',
  'NRW',
  'ORF',
  'RW2',
  'PEF',
  'SRW',
  'RAF',
  'DNG',
  '3FR',
  'FFF',
  'IIQ',
  'GPR'
]

/**
 * Recognized VIDEO file extensions (uppercase, without leading dot).
 */
export const VIDEO_EXTENSIONS: readonly string[] = [
  'MP4',
  'MOV',
  'M4V',
  'MTS',
  'M2TS',
  'AVI',
  'MKV'
]

/**
 * Recognized JPEG / still image file extensions (uppercase, without leading dot).
 */
export const JPEG_EXTENSIONS: readonly string[] = [
  'JPG',
  'JPEG',
  'HEIC',
  'HEIF',
  'PNG',
  'WEBP'
]

const RAW_EXT_SET = new Set<string>(RAW_EXTENSIONS)
const VIDEO_EXT_SET = new Set<string>(VIDEO_EXTENSIONS)
const JPEG_EXT_SET = new Set<string>(JPEG_EXTENSIONS)

/**
 * Exif and technical metadata extracted from a media file.
 */
export interface ExifMetadata {
  /** Capture timestamp in ISO 8601 format. */
  capturedAt: string
  cameraMake?: string
  cameraModel: string
  lensModel: string
  focalLength?: number
  focalLength35mm?: number
  fNumber?: number
  iso?: number
  exposureTime?: number
  shutterSpeedLabel?: string
  imageWidth?: number
  imageHeight?: number
  rawMetaJson?: string
}

/**
 * Domain entity representing an imported or scanned media file.
 */
export interface MediaFileRecord {
  id?: number
  fileHash: string
  originalName: string
  sourcePath: string
  destPath: string
  fileSize: number
  mediaType: MediaType
  ext: string
  capturedAt: string
  capturedYear: number
  capturedMonth: string
  capturedDay: string
  capturedHour: number
  exif: ExifMetadata
  favorite: boolean
  snsCaption?: string
  webPublic: boolean
  webSyncedAt?: string
  jobId?: number
  importedAt?: string
}

/**
 * Classifies a file extension into RAW, VIDEO, or JPEG.
 * Accepts extensions with or without a leading dot, in any case.
 * Unknown extensions default to 'JPEG'.
 */
export function classifyMediaTypeByExt(ext: string): MediaType {
  const normalized = ext.trim().replace(/^\./, '').toUpperCase()
  if (RAW_EXT_SET.has(normalized)) {
    return 'RAW'
  }
  if (VIDEO_EXT_SET.has(normalized)) {
    return 'VIDEO'
  }
  if (JPEG_EXT_SET.has(normalized)) {
    return 'JPEG'
  }
  return 'JPEG'
}
