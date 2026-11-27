import { describe, expect, it } from 'vitest'
import {
  classifyMediaTypeByExt,
  CONFLICT_MODES_META,
  SUPPORTED_PATH_TOKENS
} from '@core/domain/models'
import {
  buildRelativeFolderPath,
  buildTargetFilePath,
  generateRealtimePreviews,
  PATH_PRESETS,
  sanitizePathSegment,
  splitTargetPathForDisplay
} from '@core/domain/services'

describe('MediaFile & Metadata Models', () => {
  it('classifies RAW, VIDEO, and JPEG extensions case-insensitively', () => {
    expect(classifyMediaTypeByExt('ARW')).toBe('RAW')
    expect(classifyMediaTypeByExt('.cr3')).toBe('RAW')
    expect(classifyMediaTypeByExt('nef')).toBe('RAW')
    expect(classifyMediaTypeByExt('DNG')).toBe('RAW')
    expect(classifyMediaTypeByExt('GPR')).toBe('RAW')

    expect(classifyMediaTypeByExt('mp4')).toBe('VIDEO')
    expect(classifyMediaTypeByExt('.MOV')).toBe('VIDEO')
    expect(classifyMediaTypeByExt('m2ts')).toBe('VIDEO')
    expect(classifyMediaTypeByExt('mkv')).toBe('VIDEO')

    expect(classifyMediaTypeByExt('jpg')).toBe('JPEG')
    expect(classifyMediaTypeByExt('.JPEG')).toBe('JPEG')
    expect(classifyMediaTypeByExt('heic')).toBe('JPEG')
    expect(classifyMediaTypeByExt('webp')).toBe('JPEG')
    expect(classifyMediaTypeByExt('unknown_ext')).toBe('JPEG')
  })

  it('defines all 6 supported path tokens and 4 conflict modes', () => {
    expect(SUPPORTED_PATH_TOKENS.map((t) => t.token)).toEqual([
      '{YYYY}',
      '{MM}',
      '{DD}',
      '{YYYY-MM-DD}',
      '{YYYYMMDD}',
      '{Ext}'
    ])
    expect(CONFLICT_MODES_META).toHaveLength(4)
    expect(CONFLICT_MODES_META.find((m) => m.recommended)?.mode).toBe(
      'skip_same_hash_rename_diff'
    )
  })
})

describe('PathBuilderDomainService', () => {
  it('provides 5 presets with one recommended preset', () => {
    expect(PATH_PRESETS).toHaveLength(5)
    const recommended = PATH_PRESETS.filter((p) => p.recommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0].template).toBe('{YYYY}/{YYYY-MM-DD}/{Ext}')
  })

  it('expands all path tokens from a Date object', () => {
    const sampleDate = new Date(2026, 10, 19, 15, 30, 0) // 2026-11-19
    const result = buildRelativeFolderPath(
      '{YYYY}/{MM}/{DD}/{YYYY-MM-DD}/{YYYYMMDD}/{Ext}',
      { capturedAt: sampleDate, ext: '.arw' }
    )
    expect(result).toBe('2026/11/19/2026-11-19/20261119/ARW')
  })

  it('expands date-only string without UTC day shift', () => {
    const result = buildRelativeFolderPath('{YYYY}/{YYYY-MM-DD}/{Ext}', {
      capturedAt: '2026-01-05',
      ext: 'jpg'
    })
    expect(result).toBe('2026/2026-01-05/JPG')
  })

  it('throws an error on invalid capturedAt date', () => {
    expect(() =>
      buildRelativeFolderPath('{YYYY}/{Ext}', {
        capturedAt: 'not-a-valid-date',
        ext: 'ARW'
      })
    ).toThrow(/Invalid capturedAt date/)
  })

  it('sanitizes invalid filesystem characters and traversal segments', () => {
    expect(sanitizePathSegment('bad:name*?"<>|')).toBe('bad_name______')
    expect(sanitizePathSegment('..')).toBe('')
    expect(sanitizePathSegment('.')).toBe('')
    expect(sanitizePathSegment('folder. ')).toBe('folder')

    const relative = buildRelativeFolderPath('../{YYYY}/bad:dir/{Ext}/.', {
      capturedAt: new Date(2026, 0, 9),
      ext: 'raf'
    })
    expect(relative).toBe('2026/bad_dir/RAF')
  })

  it('builds target file paths preserving Windows and POSIX separators', () => {
    const sampleDate = new Date(2026, 10, 19, 10, 0, 0)

    const winPath = buildTargetFilePath(
      'D:\\Photos\\Sabaki\\',
      '{YYYY}/{YYYY-MM-DD}/{Ext}',
      { capturedAt: sampleDate, originalName: 'DSC0001.ARW' }
    )
    expect(winPath).toBe('D:\\Photos\\Sabaki\\2026\\2026-11-19\\ARW\\DSC0001.ARW')

    const posixPath = buildTargetFilePath(
      '/Volumes/SSD/Photos/',
      '{YYYY}/{MM}/{Ext}',
      { capturedAt: sampleDate, originalName: 'sub/dir/C0001.mp4', ext: 'mp4' }
    )
    expect(posixPath).toBe('/Volumes/SSD/Photos/2026/11/MP4/C0001.mp4')
  })

  it('generates realtime previews for RAW, JPEG, and VIDEO', () => {
    const sampleDate = new Date(2026, 10, 19, 14, 30, 0)
    const previews = generateRealtimePreviews(
      '/Volumes/Photos',
      '{YYYY}/{YYYY-MM-DD}/{Ext}',
      sampleDate
    )

    expect(previews).toEqual([
      {
        label: 'RAW',
        ext: 'ARW',
        fullPath: '/Volumes/Photos/2026/2026-11-19/ARW/DSC0001.ARW'
      },
      {
        label: 'JPEG',
        ext: 'JPG',
        fullPath: '/Volumes/Photos/2026/2026-11-19/JPG/DSC0001.JPG'
      },
      {
        label: 'VIDEO',
        ext: 'MP4',
        fullPath: '/Volumes/Photos/2026/2026-11-19/MP4/C0001.MP4'
      }
    ])
  })

  it('splits preview paths into destination root and template-expanded relative part', () => {
    const sampleDate = new Date(2026, 10, 19, 14, 30, 0)
    const relativeParts = generateRealtimePreviews(
      'D:/Photos/',
      '{YYYY}/{YYYY-MM-DD}/{Ext}',
      sampleDate
    ).map((item) => splitTargetPathForDisplay('D:/Photos/', item.fullPath))

    expect(relativeParts).toEqual([
      { rootPath: 'D:/Photos', separator: '/', relativePath: '2026/2026-11-19/ARW/DSC0001.ARW' },
      { rootPath: 'D:/Photos', separator: '/', relativePath: '2026/2026-11-19/JPG/DSC0001.JPG' },
      { rootPath: 'D:/Photos', separator: '/', relativePath: '2026/2026-11-19/MP4/C0001.MP4' }
    ])
  })

  it('splits Windows backslash preview paths and falls back to the full path without a root', () => {
    const windowsFull = buildTargetFilePath('D:\\Photos', '{YYYY}/{Ext}', {
      capturedAt: new Date(2026, 10, 19),
      originalName: 'DSC0001.ARW'
    })
    expect(splitTargetPathForDisplay('D:\\Photos', windowsFull)).toEqual({
      rootPath: 'D:\\Photos',
      separator: '\\',
      relativePath: '2026\\ARW\\DSC0001.ARW'
    })

    expect(splitTargetPathForDisplay('', '2026/ARW/DSC0001.ARW')).toEqual({
      rootPath: '',
      separator: '/',
      relativePath: '2026/ARW/DSC0001.ARW'
    })
  })

  it('splits preview paths at drive roots, with mixed separators, and for file-name-only templates', () => {
    const params = { capturedAt: new Date(2026, 10, 19), originalName: 'DSC0001.ARW' }

    const driveRootFull = buildTargetFilePath('D:\\', '{YYYY}/{Ext}', params)
    expect(driveRootFull).toBe('D:\\2026\\ARW\\DSC0001.ARW')
    expect(splitTargetPathForDisplay('D:\\', driveRootFull)).toEqual({
      rootPath: 'D:',
      separator: '\\',
      relativePath: '2026\\ARW\\DSC0001.ARW'
    })

    const mixedFull = buildTargetFilePath('D:\\Photos/Library/', '{YYYY}/{Ext}', params)
    expect(splitTargetPathForDisplay('D:\\Photos/Library/', mixedFull)).toEqual({
      rootPath: 'D:\\Photos/Library',
      separator: '/',
      relativePath: '2026/ARW/DSC0001.ARW'
    })

    const fileOnlyFull = buildTargetFilePath('D:/Photos', '', params)
    expect(splitTargetPathForDisplay('D:/Photos', fileOnlyFull)).toEqual({
      rootPath: 'D:/Photos',
      separator: '/',
      relativePath: 'DSC0001.ARW'
    })
  })
})
