import { join } from 'node:path'
import { app, BrowserWindow, nativeImage } from 'electron'
import { APP_NAME } from '@core/application/dto'
import { APP_WINDOW_ICON_PNG_DATA_URL } from './appIconAssets'

export interface WindowManagerOptions {
  preloadPath: string
  rendererHtmlPath?: string
  isCloseToTrayEnabled?: () => boolean
}

/**
 * Manages the primary Sabaki `BrowserWindow`, including close-to-tray resident behavior.
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private quitting = false

  constructor(private readonly options: WindowManagerOptions) {}

  public setQuitting(quitting: boolean): void {
    this.quitting = quitting
  }

  public isQuitting(): boolean {
    return this.quitting
  }

  public getWindow(): BrowserWindow | null {
    if (this.mainWindow && this.mainWindow.isDestroyed()) {
      this.mainWindow = null
    }
    return this.mainWindow
  }

  public createWindow(): BrowserWindow {
    const existing = this.getWindow()
    if (existing) {
      return existing
    }

    const windowIcon = nativeImage.createFromDataURL(APP_WINDOW_ICON_PNG_DATA_URL)

    const window = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 960,
      minHeight: 640,
      show: false,
      title: APP_NAME,
      icon: windowIcon,
      backgroundColor: '#020617',
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    window.on('ready-to-show', () => {
      window.show()
    })

    window.on('close', (event) => {
      const minimizeToTray =
        this.options.isCloseToTrayEnabled !== undefined
          ? this.options.isCloseToTrayEnabled()
          : true

      if (!this.quitting && minimizeToTray) {
        event.preventDefault()
        window.hide()
      }
    })

    window.on('closed', () => {
      this.mainWindow = null
    })

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      const htmlPath =
        this.options.rendererHtmlPath ??
        join(__dirname, '../renderer/index.html')
      void window.loadFile(htmlPath)
    }

    this.mainWindow = window
    return window
  }

  public showWindow(): void {
    const window = this.getWindow() ?? this.createWindow()
    if (window.isMinimized()) {
      window.restore()
    }
    window.show()
    window.focus()
  }

  public hideWindow(): void {
    const window = this.getWindow()
    if (window && window.isVisible()) {
      window.hide()
    }
  }

  public toggleWindow(): void {
    const window = this.getWindow()
    if (window && window.isVisible() && !window.isMinimized()) {
      window.hide()
    } else {
      this.showWindow()
    }
  }
}
