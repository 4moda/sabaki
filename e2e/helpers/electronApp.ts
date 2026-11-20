import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface LaunchedSabakiApp {
  electronApp: ElectronApplication
  page: Page
  userDataDir: string
  consoleErrors: string[]
  pageErrors: string[]
  close: () => Promise<void>
}

export interface LaunchSabakiOptions {
  /** Optional custom userData directory (when omitted, a fresh temp dir is created) */
  userDataDir?: string
  /** Whether close() removes userDataDir automatically (default: true) */
  cleanupUserDataDir?: boolean
  /** Fixed YYYY-MM-DD reference date for deterministic 52-week demo data */
  demoReferenceDate?: string
  /** Window content width in CSS pixels (default: 1280) */
  width?: number
  /** Window content height in CSS pixels (default: 840) */
  height?: number
}

export const DEFAULT_E2E_REFERENCE_DATE = '2026-11-19'
export const DEFAULT_VIEWPORT_WIDTH = 1280
export const DEFAULT_VIEWPORT_HEIGHT = 840

export function getNormalizedPlatform(): 'windows' | 'macos' | 'linux' {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  return 'linux'
}

/**
 * Launches the compiled Sabaki Electron application (`out/main/index.js`) with an isolated
 * temporary `userData` directory, deterministic demo reference date, and fixed window size.
 */
export async function launchSabakiApp(
  options: LaunchSabakiOptions = {}
): Promise<LaunchedSabakiApp> {
  const userDataDir =
    options.userDataDir ?? mkdtempSync(join(tmpdir(), 'sabaki-e2e-userdata-'))
  if (options.userDataDir) {
    mkdirSync(userDataDir, { recursive: true })
  }
  const cleanupUserDataDir = options.cleanupUserDataDir ?? true
  const width = options.width ?? DEFAULT_VIEWPORT_WIDTH
  const height = options.height ?? DEFAULT_VIEWPORT_HEIGHT
  const demoReferenceDate = options.demoReferenceDate ?? DEFAULT_E2E_REFERENCE_DATE

  const cleanEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') {
      cleanEnv[key] = value
    }
  }

  cleanEnv['SABAKI_USER_DATA_DIR'] = userDataDir
  cleanEnv['SABAKI_DEMO_REFERENCE_DATE'] = demoReferenceDate
  cleanEnv['SABAKI_DISABLE_NOTIFICATIONS'] = '1'
  cleanEnv['TZ'] = 'Asia/Tokyo'

  const mainEntry = resolve(process.cwd(), 'out/main/index.js')
  const args = [mainEntry]
  if (process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage')
  }

  const electronApp = await electron.launch({
    args,
    env: cleanEnv,
    timeout: 45_000
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Normalize BrowserWindow size AND override Chromium viewport metrics via CDP so
  // Windows/macOS GitHub Actions runners (1024x768 virtual displays) still render exact 1280x840.
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.setContentSize(size.width, size.height)
        win.center()
      }
    },
    { width, height }
  )
  await page.setViewportSize({ width, height })

  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err))
  })

  // Wait for initial React render and webfonts/layout settle
  await page.waitForSelector('nav[aria-label="メインナビゲーション"]', {
    state: 'visible',
    timeout: 20_000
  })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(250)

  const close = async (): Promise<void> => {
    try {
      await electronApp.evaluate(({ app }) => {
        app.quit()
      })
    } catch {
      // Ignore if already exiting
    }
    try {
      await electronApp.close()
    } catch {
      // Ignore close race
    }
    if (cleanupUserDataDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        // Windows file handle release fallback
      }
    }
  }

  return {
    electronApp,
    page,
    userDataDir,
    consoleErrors,
    pageErrors,
    close
  }
}
