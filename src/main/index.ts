import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { AppSettings } from '@core/domain/models'
import {
  ClearAllDataUseCase,
  ExecuteImportJobUseCase,
  ExportPublicWebJsonUseCase,
  GetDashboardStatsUseCase,
  PreviewTargetPathUseCase,
  ScanSourceDirectoryUseCase,
  SeedDemoDataUseCase
} from '@core/application/usecases'
import {
  SqliteAnalyticsQueryService,
  SqliteConnection,
  SqliteFileRepository,
  SqliteJobRepository
} from '@main/infrastructure/database'
import {
  ElectronNotificationGateway,
  TrayManager,
  WindowManager
} from '@main/infrastructure/electron'
import {
  ExifrParserGateway,
  NodeFileSystemGateway
} from '@main/infrastructure/filesystem'
import { JsonSettingsRepository } from '@main/infrastructure/settings'
import { registerIpcHandlers } from '@main/presentation/ipc'

let sqliteConnection: SqliteConnection | null = null
let windowManager: WindowManager | null = null
let trayManager: TrayManager | null = null

if (process.env['SABAKI_USER_DATA_DIR']) {
  app.setPath('userData', process.env['SABAKI_USER_DATA_DIR'])
}

/**
 * OS-aware default overrides: follows a relocated/localized Pictures folder
 * (e.g. Windows known-folder redirection). These also become the reset baseline.
 */
function resolveOsDefaultSettingsOverrides(): Partial<AppSettings> | undefined {
  try {
    return { defaultDestRoot: join(app.getPath('pictures'), 'Sabaki') }
  } catch {
    return undefined
  }
}

function bootstrapApplication(): void {
  const userDataDir = app.getPath('userData')
  const dbPath = join(userDataDir, 'sabaki.sqlite3')
  const settingsPath = join(userDataDir, 'settings.json')

  // 1. Infrastructure Adapters
  sqliteConnection = new SqliteConnection(dbPath)
  const fileRepository = new SqliteFileRepository(sqliteConnection)
  const jobRepository = new SqliteJobRepository(sqliteConnection)
  const analyticsQueryService = new SqliteAnalyticsQueryService(sqliteConnection)
  const settingsRepository = new JsonSettingsRepository(
    settingsPath,
    resolveOsDefaultSettingsOverrides()
  )
  const fileSystemGateway = new NodeFileSystemGateway(
    () => settingsRepository.getSettings().fastHashMode
  )
  const exifParserGateway = new ExifrParserGateway()

  windowManager = new WindowManager({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererHtmlPath: join(__dirname, '../renderer/index.html'),
    isCloseToTrayEnabled: () => settingsRepository.getSettings().minimizeToTray
  })

  const notificationGateway = new ElectronNotificationGateway({
    isEnabled: () =>
      process.env['SABAKI_DISABLE_NOTIFICATIONS'] !== '1' &&
      settingsRepository.getSettings().enableOsNotifications,
    onNotificationClick: () => windowManager?.showWindow()
  })

  // 2. Application UseCases
  const previewTargetPathUseCase = new PreviewTargetPathUseCase()
  const scanSourceDirectoryUseCase = new ScanSourceDirectoryUseCase(
    fileSystemGateway
  )
  const executeImportJobUseCase = new ExecuteImportJobUseCase({
    fileSystem: fileSystemGateway,
    exifParser: exifParserGateway,
    fileRepository,
    jobRepository,
    notificationGateway
  })
  const getDashboardStatsUseCase = new GetDashboardStatsUseCase(
    analyticsQueryService
  )
  const exportPublicWebJsonUseCase = new ExportPublicWebJsonUseCase({
    analyticsQueryService,
    fileRepository,
    fileSystem: fileSystemGateway
  })
  const seedDemoDataUseCase = new SeedDemoDataUseCase({
    fileRepository,
    jobRepository
  })
  const clearAllDataUseCase = new ClearAllDataUseCase({
    fileRepository,
    jobRepository,
    onCleared: () => {
      sqliteConnection?.setMeta('initial_demo_seeded', '1')
    }
  })

  // 3. Auto-seed initial demo data once on very first launch when DB is empty
  const hasSeededInitialDemo =
    sqliteConnection.getMeta('initial_demo_seeded') === '1'
  if (!hasSeededInitialDemo) {
    if (fileRepository.countAll() === 0) {
      seedDemoDataUseCase.execute({
        shotCount: 180,
        referenceDate: process.env['SABAKI_DEMO_REFERENCE_DATE'] || undefined
      })
    }
    sqliteConnection.setMeta('initial_demo_seeded', '1')
  }

  // 4. Presentation Layer IPC Controllers
  registerIpcHandlers({
    fileRepository,
    jobRepository,
    settingsRepository,
    previewTargetPathUseCase,
    scanSourceDirectoryUseCase,
    executeImportJobUseCase,
    getDashboardStatsUseCase,
    exportPublicWebJsonUseCase,
    seedDemoDataUseCase,
    clearAllDataUseCase
  })

  // 5. Create Main Window & Resident System Tray
  windowManager.createWindow()
  trayManager = new TrayManager({
    windowManager,
    onQuit: () => {
      windowManager?.setQuitting(true)
      app.quit()
    }
  })
  trayManager.createTray()
}

app.whenReady().then(() => {
  bootstrapApplication()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager?.createWindow()
    } else {
      windowManager?.showWindow()
    }
  })
})

app.on('before-quit', () => {
  windowManager?.setQuitting(true)
  trayManager?.destroy()
  sqliteConnection?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && windowManager?.isQuitting()) {
    app.quit()
  }
})
