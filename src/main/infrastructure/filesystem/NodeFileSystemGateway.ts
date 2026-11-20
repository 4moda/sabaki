import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import {
  JPEG_EXTENSIONS,
  RAW_EXTENSIONS,
  VIDEO_EXTENSIONS
} from '@core/domain/models'
import type {
  IFileSystemGateway,
  ScannedFileEntry
} from '@core/domain/ports'

/**
 * Set of all supported media file extensions (uppercase, without leading dot).
 */
export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set<string>([
  ...RAW_EXTENSIONS,
  ...JPEG_EXTENSIONS,
  ...VIDEO_EXTENSIONS
])

const FAST_HASH_THRESHOLD_BYTES = 256 * 1024 // 256 KB
const FAST_HASH_CHUNK_BYTES = 64 * 1024 // 64 KB

/**
 * Node.js `fs` & `crypto` implementation of `IFileSystemGateway`.
 */
export class NodeFileSystemGateway implements IFileSystemGateway {
  constructor(
    private readonly defaultFastHashMode: boolean | (() => boolean) = false
  ) {}

  public async scanDirectory(sourceRoot: string): Promise<ScannedFileEntry[]> {
    const results: ScannedFileEntry[] = []

    const walk = async (currentDir: string): Promise<void> => {
      let dirents
      try {
        dirents = await fs.readdir(currentDir, { withFileTypes: true })
      } catch {
        return
      }

      for (const dirent of dirents) {
        if (dirent.name.startsWith('.')) {
          continue
        }

        const fullPath = join(currentDir, dirent.name)
        if (dirent.isDirectory()) {
          await walk(fullPath)
        } else if (dirent.isFile()) {
          const ext = extname(dirent.name).replace(/^\./, '').toUpperCase()
          if (!SUPPORTED_EXTENSIONS.has(ext)) {
            continue
          }

          try {
            const stats = await fs.stat(fullPath)
            results.push({
              path: fullPath,
              name: dirent.name,
              ext,
              size: stats.size,
              mtime: stats.mtime
            })
          } catch {
            // Ignore files that disappear during scanning
          }
        }
      }
    }

    await walk(sourceRoot)
    results.sort((a, b) => a.path.localeCompare(b.path))
    return results
  }

  public async computeFileHash(
    filePath: string,
    fastMode?: boolean
  ): Promise<string> {
    const resolvedDefault =
      typeof this.defaultFastHashMode === 'function'
        ? this.defaultFastHashMode()
        : this.defaultFastHashMode
    const useFast = fastMode ?? resolvedDefault
    if (useFast) {
      const stats = await fs.stat(filePath)
      if (stats.size > FAST_HASH_THRESHOLD_BYTES) {
        return this.computeFastSampledHash(filePath, stats.size)
      }
    }
    return this.computeFullStreamHash(filePath)
  }

  public async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  public async copyFile(sourcePath: string, destPath: string): Promise<void> {
    await fs.mkdir(dirname(destPath), { recursive: true })
    await fs.copyFile(sourcePath, destPath)

    try {
      const sourceStats = await fs.stat(sourcePath)
      await fs.utimes(destPath, sourceStats.atime, sourceStats.mtime)
    } catch {
      // Ignore if filesystem does not support utimes
    }
  }

  public async writeTextFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  private async computeFullStreamHash(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)

      stream.on('data', (chunk) => {
        hash.update(chunk)
      })
      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })
      stream.on('error', (err) => {
        reject(err)
      })
    })
  }

  private async computeFastSampledHash(
    filePath: string,
    fileSize: number
  ): Promise<string> {
    const handle = await fs.open(filePath, 'r')
    try {
      const hash = createHash('sha256')
      hash.update(`size:${fileSize};`)

      const buffer = Buffer.allocUnsafe(FAST_HASH_CHUNK_BYTES)
      const offsets = [
        0,
        Math.floor(fileSize / 2) - Math.floor(FAST_HASH_CHUNK_BYTES / 2),
        fileSize - FAST_HASH_CHUNK_BYTES
      ]

      for (const offset of offsets) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          FAST_HASH_CHUNK_BYTES,
          Math.max(0, offset)
        )
        hash.update(buffer.subarray(0, bytesRead))
      }

      return hash.digest('hex')
    } finally {
      await handle.close()
    }
  }
}
