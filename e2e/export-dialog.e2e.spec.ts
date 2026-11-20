import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

test.describe('Sabaki Web JSON Export Save Dialog', () => {
  let appHandle: LaunchedSabakiApp
  let tempDir: string

  test.beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sabaki-e2e-export-'))
    appHandle = await launchSabakiApp()
    await appHandle.electronApp.evaluate(({ dialog }) => {
      const store = globalThis as Record<string, unknown>
      store['__sabakiOriginalShowSaveDialog'] = dialog.showSaveDialog
    })
  })

  test.afterAll(async () => {
    try {
      await appHandle?.electronApp.evaluate(({ dialog }) => {
        const store = globalThis as Record<string, unknown>
        const orig = store['__sabakiOriginalShowSaveDialog']
        if (typeof orig === 'function') {
          dialog.showSaveDialog = orig as typeof dialog.showSaveDialog
        }
      })
    } catch {
      // Ignore if app already closed
    }
    if (appHandle) {
      await appHandle.close()
    }
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore Windows cleanup race
    }
  })

  test('handles cancel and save dialog flows from Dashboard and Settings', async () => {
    const { page, electronApp, consoleErrors, pageErrors } = appHandle
    const dashboardExportPath = join(tempDir, 'dashboard-stats-public.json')
    const settingsExportPath = join(tempDir, 'settings-stats-public.json')

    // 1. Dashboard: cancel save dialog -> shows cancel message and writes no file
    await page.getByRole('button', { name: '撮影分析' }).click()
    await expect(
      page.getByRole('heading', { name: /撮影アクティビティ & Exif分析ダッシュボード/ })
    ).toBeVisible()

    await electronApp.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({
        canceled: true,
        filePath: ''
      })
    })

    await page.getByRole('button', { name: /stats-public\.json 出力/ }).click()
    await expect(
      page.getByText('stats-public.json の書き出しをキャンセルしました。')
    ).toBeVisible()
    expect(existsSync(dashboardExportPath)).toBe(false)

    // 2. Dashboard: confirm save dialog -> writes sanitized JSON to selected path
    await electronApp.evaluate(
      ({ dialog }, targetPath) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: targetPath
        })
      },
      dashboardExportPath
    )

    await page.getByRole('button', { name: /stats-public\.json 出力/ }).click()
    await expect(
      page.getByText(`stats-public.json を書き出しました: ${dashboardExportPath}`)
    ).toBeVisible()
    await expect
      .poll(() => existsSync(dashboardExportPath), { timeout: 10_000 })
      .toBe(true)

    const exportedRaw = readFileSync(dashboardExportPath, 'utf8')
    expect(exportedRaw).not.toContain('sourcePath')
    expect(exportedRaw).not.toContain('destPath')
    expect(exportedRaw).not.toContain('rawMetaJson')
    const exportedJson = JSON.parse(exportedRaw) as {
      app?: string
      summary?: { totalFiles?: number }
      publicFiles?: unknown[]
    }
    expect(exportedJson.app).toBe('Sabaki')
    expect(exportedJson.summary?.totalFiles).toBe(180)
    expect(Array.isArray(exportedJson.publicFiles)).toBe(true)
    expect(exportedJson.publicFiles!.length).toBeGreaterThan(0)

    // 3. Settings: cancel then confirm save dialog
    await page.getByRole('button', { name: '常駐・設定' }).click()
    await expect(
      page.getByRole('heading', { name: /常駐動作 & アプリケーション設定/ })
    ).toBeVisible()

    await electronApp.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({
        canceled: true,
        filePath: ''
      })
    })
    await page.getByRole('button', { name: /stats-public\.json を書き出す/ }).click()
    await expect(
      page.getByText('stats-public.json の書き出しをキャンセルしました。')
    ).toBeVisible()
    expect(existsSync(settingsExportPath)).toBe(false)

    await electronApp.evaluate(
      ({ dialog }, targetPath) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: targetPath
        })
      },
      settingsExportPath
    )
    await page.getByRole('button', { name: /stats-public\.json を書き出す/ }).click()
    await expect(
      page.getByText(`stats-public.json を書き出しました: ${settingsExportPath}`)
    ).toBeVisible()
    await expect
      .poll(() => existsSync(settingsExportPath), { timeout: 10_000 })
      .toBe(true)

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
