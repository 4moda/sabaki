import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { APP_NAME } from '@core/application/dto'
import {
  TRAY_COLOR_ICON_1X_DATA_URL,
  TRAY_COLOR_ICON_2X_DATA_URL,
  TRAY_TEMPLATE_ICON_1X_DATA_URL,
  TRAY_TEMPLATE_ICON_2X_DATA_URL
} from './appIconAssets'
import type { WindowManager } from './WindowManager'

function decodePngDataUrl(dataUrl: string): Buffer {
  const prefix = 'data:image/png;base64,'
  const base64 = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl
  return Buffer.from(base64, 'base64')
}

/**
 * Returns the 1x PNG Data URL for Sabaki's "Sabatora Paw Card Sorting" tray icon.
 * Uses the monochrome template variant on macOS and the color variant on Windows/Linux.
 */
export function buildProgrammaticTrayIconDataUrl(
  platform: NodeJS.Platform = process.platform
): string {
  return platform === 'darwin'
    ? TRAY_TEMPLATE_ICON_1X_DATA_URL
    : TRAY_COLOR_ICON_1X_DATA_URL
}

/**
 * Builds a multi-resolution (1x 16px + 2x 32px) NativeImage for the system tray,
 * automatically marking it as a template image on macOS for light/dark menu bar adaptation.
 */
export function createTrayNativeImage(
  platform: NodeJS.Platform = process.platform
): NativeImage {
  const isMac = platform === 'darwin'
  const icon = nativeImage.createEmpty()

  icon.addRepresentation({
    scaleFactor: 1.0,
    width: 16,
    height: 16,
    buffer: decodePngDataUrl(
      isMac ? TRAY_TEMPLATE_ICON_1X_DATA_URL : TRAY_COLOR_ICON_1X_DATA_URL
    )
  })
  icon.addRepresentation({
    scaleFactor: 2.0,
    width: 32,
    height: 32,
    buffer: decodePngDataUrl(
      isMac ? TRAY_TEMPLATE_ICON_2X_DATA_URL : TRAY_COLOR_ICON_2X_DATA_URL
    )
  })

  if (isMac) {
    icon.setTemplateImage(true)
  }

  return icon
}

export interface TrayManagerOptions {
  windowManager: WindowManager
  onQuit?: () => void
}

/**
 * Manages the system tray resident icon and context menu for Sabaki.
 */
export class TrayManager {
  private tray: Tray | null = null

  constructor(private readonly options: TrayManagerOptions) {}

  public createTray(): Tray {
    if (this.tray) {
      return this.tray
    }

    const icon: NativeImage = createTrayNativeImage()
    const tray = new Tray(icon)
    tray.setToolTip(`${APP_NAME} — SDカード高速取り込み＆撮影アクティビティ分析`)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Sabaki を開く (ダッシュボード)',
        click: () => {
          this.options.windowManager.showWindow()
        }
      },
      { type: 'separator' },
      {
        label: '終了 (Quit)',
        click: () => {
          this.options.windowManager.setQuitting(true)
          if (this.options.onQuit) {
            this.options.onQuit()
          } else {
            app.quit()
          }
        }
      }
    ])

    tray.setContextMenu(contextMenu)
    tray.on('click', () => {
      this.options.windowManager.toggleWindow()
    })

    this.tray = tray
    return tray
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
