import exifr from 'exifr'
import type { ExifMetadata } from '@core/domain/models'
import type { IExifParserGateway } from '@core/domain/ports'

/**
 * Formats an exposure time in seconds into a human-readable shutter speed label
 * (e.g. `0.004 -> "1/250s"`, `1.5 -> "1.5s"`).
 */
export function formatShutterSpeedLabel(
  exposureTime?: number
): string | undefined {
  if (
    exposureTime === undefined ||
    !Number.isFinite(exposureTime) ||
    exposureTime <= 0
  ) {
    return undefined
  }
  if (exposureTime < 1) {
    const denominator = Math.round(1 / exposureTime)
    return denominator > 0 ? `1/${denominator}s` : `${exposureTime}s`
  }
  const rounded = Number(exposureTime.toFixed(1))
  return `${rounded}s`
}

function toValidDateIso(candidate: unknown, fallbackDate: Date): string {
  if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
    return candidate.toISOString()
  }
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    // Handle EXIF "YYYY:MM:DD HH:MM:SS" format
    const normalized = candidate
      .trim()
      .replace(/^(\d{4}):(\d{2}):(\d{2})\s+/, '$1-$2-$3T')
    const parsed = new Date(normalized)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }
  return fallbackDate.toISOString()
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  return undefined
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }
  return undefined
}

/**
 * `exifr`-based implementation of `IExifParserGateway`.
 * Gracefully falls back to file `mtime`, `'Unknown Camera'`, and `'Unknown Lens'`
 * when Exif tags are missing or when parsing video / unsupported files.
 */
export class ExifrParserGateway implements IExifParserGateway {
  public async parseExif(
    filePath: string,
    fallbackDate: Date
  ): Promise<ExifMetadata> {
    try {
      const raw = (await exifr.parse(filePath, {
        tiff: true,
        exif: true
      })) as Record<string, unknown> | null | undefined

      if (!raw || typeof raw !== 'object') {
        return {
          capturedAt: fallbackDate.toISOString(),
          cameraModel: 'Unknown Camera',
          lensModel: 'Unknown Lens'
        }
      }

      const capturedAt = toValidDateIso(
        raw.DateTimeOriginal ?? raw.CreateDate ?? raw.ModifyDate,
        fallbackDate
      )
      const cameraMake = toNonEmptyString(raw.Make)
      const cameraModel = toNonEmptyString(raw.Model) ?? 'Unknown Camera'
      const lensModel =
        toNonEmptyString(raw.LensModel) ??
        toNonEmptyString(raw.Lens) ??
        'Unknown Lens'

      const focalLength = toPositiveNumber(raw.FocalLength)
      const focalLength35mm = toPositiveNumber(
        raw.FocalLengthIn35mmFormat ?? raw.FocalLengthIn35mmFilm
      )
      const fNumber = toPositiveNumber(raw.FNumber)
      const rawIso = Array.isArray(raw.ISO) ? raw.ISO[0] : (raw.ISO ?? raw.ISOSpeedRatings)
      const isoNum = toPositiveNumber(rawIso)
      const iso = isoNum !== undefined ? Math.round(isoNum) : undefined
      const exposureTime = toPositiveNumber(raw.ExposureTime)
      const shutterSpeedLabel = formatShutterSpeedLabel(exposureTime)
      const imageWidth = toPositiveNumber(
        raw.ExifImageWidth ?? raw.ImageWidth
      )
      const imageHeight = toPositiveNumber(
        raw.ExifImageHeight ?? raw.ImageHeight
      )

      return {
        capturedAt,
        ...(cameraMake ? { cameraMake } : {}),
        cameraModel,
        lensModel,
        ...(focalLength !== undefined ? { focalLength } : {}),
        ...(focalLength35mm !== undefined ? { focalLength35mm } : {}),
        ...(fNumber !== undefined ? { fNumber } : {}),
        ...(iso !== undefined ? { iso } : {}),
        ...(exposureTime !== undefined ? { exposureTime } : {}),
        ...(shutterSpeedLabel ? { shutterSpeedLabel } : {}),
        ...(imageWidth !== undefined ? { imageWidth } : {}),
        ...(imageHeight !== undefined ? { imageHeight } : {})
      }
    } catch {
      return {
        capturedAt: fallbackDate.toISOString(),
        cameraModel: 'Unknown Camera',
        lensModel: 'Unknown Lens'
      }
    }
  }
}
