import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  DashboardFilter,
  ImportProgressEvent
} from '@core/domain/models'
import type { MediaFileQueryFilter } from '@core/domain/ports'
import {
  IPC_CHANNELS,
  type ExecuteImportJobRequest,
  type ExportPublicWebJsonRequest,
  type PreviewTargetPathsRequest,
  type SabakiApi,
  type SeedDemoDataOptions
} from '@core/application/dto'

export type { SabakiApi }

const sabakiApi: SabakiApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_INFO),

  previewTargetPaths: (request: PreviewTargetPathsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_TARGET_PATHS, request),

  scanSourceDirectory: (sourceDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_SOURCE_DIRECTORY, sourceDir),

  executeImportJob: (request: Omit<ExecuteImportJobRequest, 'onProgress'>) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_IMPORT_JOB, request),

  onImportProgress: (listener: (event: ImportProgressEvent) => void) => {
    const handler = (
      _ipcEvent: IpcRendererEvent,
      progressEvent: ImportProgressEvent
    ): void => {
      listener(progressEvent)
    }
    ipcRenderer.on(IPC_CHANNELS.IMPORT_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IMPORT_PROGRESS, handler)
    }
  },

  getDashboardStats: (filter?: DashboardFilter) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_DASHBOARD_STATS, filter),

  getFilterOptions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FILTER_OPTIONS),

  getRecentFiles: (filter?: MediaFileQueryFilter) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_FILES, filter),

  getRecentJobs: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_JOBS, limit),

  toggleFavorite: (fileId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_FAVORITE, fileId),

  formatPhotoCaption: (
    fileId: number,
    options?: { includeHashtags?: boolean }
  ) => ipcRenderer.invoke(IPC_CHANNELS.FORMAT_PHOTO_CAPTION, fileId, options),

  exportPublicWebJson: (request?: ExportPublicWebJsonRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PUBLIC_WEB_JSON, request),

  seedDemoData: (options?: SeedDemoDataOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEED_DEMO_DATA, options),

  clearAllData: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_ALL_DATA),

  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  saveSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, patch),

  resetSettings: () => ipcRenderer.invoke(IPC_CHANNELS.RESET_SETTINGS),

  selectDirectory: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY, options)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('sabaki', sabakiApi)
} else {
  ;(window as unknown as { sabaki: SabakiApi }).sabaki = sabakiApi
}
