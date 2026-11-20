import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import type {
  AppSettings,
  DashboardFilter
} from '@core/domain/models'
import type {
  IFileRepository,
  IJobRepository,
  ISettingsRepository,
  MediaFileQueryFilter
} from '@core/domain/ports'
import { formatPhotoExifCaption } from '@core/domain/services'
import {
  APP_NAME,
  APP_VERSION,
  IPC_CHANNELS,
  type ExecuteImportJobRequest,
  type ExportPublicWebJsonRequest,
  type ExportPublicWebJsonResult,
  type PreviewTargetPathsRequest,
  type SeedDemoDataOptions
} from '@core/application/dto'
import type {
  ClearAllDataUseCase,
  ExecuteImportJobUseCase,
  ExportPublicWebJsonUseCase,
  GetDashboardStatsUseCase,
  PreviewTargetPathUseCase,
  ScanSourceDirectoryUseCase,
  SeedDemoDataUseCase
} from '@core/application/usecases'

export interface IpcControllerDeps {
  fileRepository: IFileRepository
  jobRepository: IJobRepository
  settingsRepository: ISettingsRepository
  previewTargetPathUseCase: PreviewTargetPathUseCase
  scanSourceDirectoryUseCase: ScanSourceDirectoryUseCase
  executeImportJobUseCase: ExecuteImportJobUseCase
  getDashboardStatsUseCase: GetDashboardStatsUseCase
  exportPublicWebJsonUseCase: ExportPublicWebJsonUseCase
  seedDemoDataUseCase: SeedDemoDataUseCase
  clearAllDataUseCase: ClearAllDataUseCase
}

/**
 * Registers all main-process IPC handlers defined in `IPC_CHANNELS`,
 * delegating requests from the Preload/Renderer layer to Application UseCases and Repositories.
 */
export function registerIpcHandlers(deps: IpcControllerDeps): void {
  const {
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
  } = deps

  ipcMain.handle(IPC_CHANNELS.GET_APP_INFO, () => ({
    name: APP_NAME,
    version: APP_VERSION
  }))

  ipcMain.handle(
    IPC_CHANNELS.PREVIEW_TARGET_PATHS,
    (_event, request: PreviewTargetPathsRequest) => {
      return previewTargetPathUseCase.execute(request)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SCAN_SOURCE_DIRECTORY,
    async (_event, sourceDir: string) => {
      return scanSourceDirectoryUseCase.execute(sourceDir)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXECUTE_IMPORT_JOB,
    async (
      event,
      request: Omit<ExecuteImportJobRequest, 'onProgress'>
    ) => {
      return executeImportJobUseCase.execute({
        ...request,
        onProgress: (progressEvent) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.IMPORT_PROGRESS, progressEvent)
          }
        }
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GET_DASHBOARD_STATS,
    (_event, filter?: DashboardFilter) => {
      return getDashboardStatsUseCase.execute(filter)
    }
  )

  ipcMain.handle(IPC_CHANNELS.GET_FILTER_OPTIONS, () => {
    return getDashboardStatsUseCase.getFilterOptions()
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_RECENT_FILES,
    (_event, filter?: MediaFileQueryFilter) => {
      return fileRepository.findRecent(filter)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GET_RECENT_JOBS,
    (_event, limit?: number) => {
      return jobRepository.findRecentJobs(limit)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TOGGLE_FAVORITE,
    (_event, fileId: number) => {
      return fileRepository.toggleFavorite(fileId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FORMAT_PHOTO_CAPTION,
    (
      _event,
      fileId: number,
      options?: { includeHashtags?: boolean }
    ) => {
      const file = fileRepository.findById(fileId)
      if (!file) {
        return ''
      }
      return formatPhotoExifCaption(file, options)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_PUBLIC_WEB_JSON,
    async (
      event,
      request?: ExportPublicWebJsonRequest
    ): Promise<ExportPublicWebJsonResult> => {
      let targetOutputPath = request?.outputPath
      if (!targetOutputPath) {
        const parentWindow = BrowserWindow.fromWebContents(event.sender)
        const configuredDir = settingsRepository.getSettings().defaultDestRoot
        const defaultDir =
          configuredDir && existsSync(configuredDir)
            ? configuredDir
            : app.getPath('documents')
        const saveDialogOptions: SaveDialogOptions = {
          title: 'stats-public.json の保存先を選択',
          defaultPath: join(defaultDir, 'stats-public.json'),
          filters: [{ name: 'JSON Files', extensions: ['json'] }]
        }
        const dialogResult = parentWindow
          ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
          : await dialog.showSaveDialog(saveDialogOptions)

        if (dialogResult.canceled || !dialogResult.filePath) {
          return {
            payload: {},
            exportedFileCount: 0,
            canceled: true
          }
        }
        targetOutputPath = dialogResult.filePath
      }

      return exportPublicWebJsonUseCase.execute({
        ...request,
        outputPath: targetOutputPath
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SEED_DEMO_DATA,
    (_event, options?: SeedDemoDataOptions) => {
      return seedDemoDataUseCase.execute(options)
    }
  )

  ipcMain.handle(IPC_CHANNELS.CLEAR_ALL_DATA, () => {
    return clearAllDataUseCase.execute()
  })

  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return settingsRepository.getSettings()
  })

  ipcMain.handle(
    IPC_CHANNELS.SAVE_SETTINGS,
    (_event, patch: Partial<AppSettings>) => {
      return settingsRepository.saveSettings(patch)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SELECT_DIRECTORY,
    async (
      event,
      options?: { title?: string; defaultPath?: string }
    ): Promise<string | null> => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      const dialogOptions: OpenDialogOptions = {
        title: options?.title ?? 'フォルダを選択',
        defaultPath: options?.defaultPath,
        properties: ['openDirectory', 'createDirectory']
      }

      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    }
  )
}
