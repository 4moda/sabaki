import type { ExifMetadata } from '../models/MediaFile'

/**
 * Infrastructure gateway port for extracting Exif metadata from media files.
 */
export interface IExifParserGateway {
  parseExif(filePath: string, fallbackDate: Date): Promise<ExifMetadata>
}
