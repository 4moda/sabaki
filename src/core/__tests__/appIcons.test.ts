import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_WINDOW_ICON_PNG_DATA_URL,
  TRAY_COLOR_ICON_1X_DATA_URL,
  TRAY_COLOR_ICON_2X_DATA_URL,
  TRAY_TEMPLATE_ICON_1X_DATA_URL,
  TRAY_TEMPLATE_ICON_2X_DATA_URL
} from '@main/infrastructure/electron/appIconAssets'

const REPO_ROOT = resolve(__dirname, '../../..')
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function parsePngDimensions(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  }
}

function decodePngDataUrl(dataUrl: string): Buffer {
  const prefix = 'data:image/png;base64,'
  expect(dataUrl.startsWith(prefix)).toBe(true)
  return Buffer.from(dataUrl.slice(prefix.length), 'base64')
}

describe('Sabaki app & tray icon assets (Sabatora Paw Card Sorting)', () => {
  it('provides a valid 1024x1024 master PNG icon in build/icon.png', () => {
    const png = readFileSync(resolve(REPO_ROOT, 'build/icon.png'))
    expect(parsePngDimensions(png)).toEqual({ width: 1024, height: 1024 })
  })

  it('provides a valid multi-size Windows ICO icon in build/icon.ico', () => {
    const ico = readFileSync(resolve(REPO_ROOT, 'build/icon.ico'))
    expect(ico.readUInt16LE(0)).toBe(0) // Reserved
    expect(ico.readUInt16LE(2)).toBe(1) // Type 1 = ICO
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(6) // Multi-resolution entries
  })

  it('provides a valid Apple ICNS icon in build/icon.icns', () => {
    const icns = readFileSync(resolve(REPO_ROOT, 'build/icon.icns'))
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
  })

  it('includes SVG master sources and renderer favicon', () => {
    for (const relPath of [
      'build/icon.svg',
      'build/tray-icon.svg',
      'build/tray-icon-template.svg',
      'src/renderer/public/favicon.svg'
    ]) {
      const svg = readFileSync(resolve(REPO_ROOT, relPath), 'utf8')
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    }
  })

  it('embeds valid PNG Data URLs for window and 1x/2x tray icons', () => {
    expect(parsePngDimensions(decodePngDataUrl(APP_WINDOW_ICON_PNG_DATA_URL))).toEqual({
      width: 256,
      height: 256
    })
    expect(parsePngDimensions(decodePngDataUrl(TRAY_COLOR_ICON_1X_DATA_URL))).toEqual({
      width: 16,
      height: 16
    })
    expect(parsePngDimensions(decodePngDataUrl(TRAY_COLOR_ICON_2X_DATA_URL))).toEqual({
      width: 32,
      height: 32
    })
    expect(parsePngDimensions(decodePngDataUrl(TRAY_TEMPLATE_ICON_1X_DATA_URL))).toEqual({
      width: 16,
      height: 16
    })
    expect(parsePngDimensions(decodePngDataUrl(TRAY_TEMPLATE_ICON_2X_DATA_URL))).toEqual({
      width: 32,
      height: 32
    })
  })
})
