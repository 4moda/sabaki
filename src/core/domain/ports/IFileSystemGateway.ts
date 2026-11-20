/**
 * File metadata entry returned when scanning a source directory.
 */
export interface ScannedFileEntry {
  path: string
  name: string
  ext: string
  size: number
  mtime: Date
}

/**
 * Infrastructure gateway port for local filesystem operations.
 */
export interface IFileSystemGateway {
  scanDirectory(sourceRoot: string): Promise<ScannedFileEntry[]>
  computeFileHash(filePath: string, fastMode?: boolean): Promise<string>
  fileExists(filePath: string): Promise<boolean>
  copyFile(sourcePath: string, destPath: string): Promise<void>
  writeTextFile(filePath: string, content: string): Promise<void>
}
