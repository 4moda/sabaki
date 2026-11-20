import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

test.describe('Sabaki Clear Demo & History Data', () => {
  test('confirms data clear, resets Dashboard & History, and prevents auto-reseed on relaunch', async () => {
    const persistentUserDataDir = mkdtempSync(join(tmpdir(), 'sabaki-e2e-clear-'))
    let firstLaunch: LaunchedSabakiApp | null = null
    let secondLaunch: LaunchedSabakiApp | null = null

    try {
      // 1. First launch auto-seeds 180 demo shots
      firstLaunch = await launchSabakiApp({
        userDataDir: persistentUserDataDir,
        cleanupUserDataDir: false
      })

      await firstLaunch.page.getByRole('button', { name: '撮影分析' }).click()
      await expect(firstLaunch.page.getByText('180', { exact: true })).toBeVisible({
        timeout: 15_000
      })

      // 2. Navigate to Settings and test cancel flow first
      await firstLaunch.page.getByRole('button', { name: '常駐・設定' }).click()
      await expect(
        firstLaunch.page.getByRole('heading', { name: /常駐動作 & アプリケーション設定/ })
      ).toBeVisible()

      await firstLaunch.page.getByRole('button', { name: '履歴・デモデータを初期化' }).click()
      const confirmDialog = firstLaunch.page.getByRole('alertdialog', {
        name: '履歴・デモデータの初期化確認'
      })
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: 'キャンセル' }).click()
      await expect(confirmDialog).toBeHidden()

      // Data must remain intact after cancel
      await firstLaunch.page.getByRole('button', { name: '撮影分析' }).click()
      await expect(firstLaunch.page.getByText('180', { exact: true })).toBeVisible()

      // 3. Confirm clear all data
      await firstLaunch.page.getByRole('button', { name: '常駐・設定' }).click()
      await firstLaunch.page.getByRole('button', { name: '履歴・デモデータを初期化' }).click()
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: 'すべて削除する' }).click()

      await expect(confirmDialog).toBeHidden()
      await expect(
        firstLaunch.page.getByText(
          '履歴・デモデータを初期化しました（ファイル 180件 / ジョブ 1件を削除）。'
        )
      ).toBeVisible()

      // 4. Verify Dashboard shows 0 shots and History is empty
      await firstLaunch.page.getByRole('button', { name: '撮影分析' }).click()
      await expect(firstLaunch.page.getByText('総ショット数', { exact: true })).toBeVisible()
      await expect(firstLaunch.page.getByText('年間稼働 0 日')).toBeVisible()
      await expect(firstLaunch.page.getByText('0', { exact: true }).first()).toBeVisible()

      await firstLaunch.page.getByRole('button', { name: '取込履歴' }).click()
      await expect(firstLaunch.page.getByText('0 件表示')).toBeVisible()
      await expect(
        firstLaunch.page.getByText('条件に一致する取り込み済みファイルがありません。')
      ).toBeVisible()
      await expect(firstLaunch.page.getByText('最近のインポートセッション履歴')).toBeHidden()

      expect(firstLaunch.consoleErrors).toEqual([])
      expect(firstLaunch.pageErrors).toEqual([])

      await firstLaunch.close()
      firstLaunch = null

      // 5. Relaunch with the SAME userDataDir and verify 180 demo shots are NOT re-seeded
      secondLaunch = await launchSabakiApp({
        userDataDir: persistentUserDataDir,
        cleanupUserDataDir: false
      })
      await secondLaunch.page.getByRole('button', { name: '撮影分析' }).click()
      await expect(secondLaunch.page.getByText('総ショット数', { exact: true })).toBeVisible()
      await expect(secondLaunch.page.getByText('年間稼働 0 日')).toBeVisible()
      await expect(secondLaunch.page.getByText('180', { exact: true })).toBeHidden()

      expect(secondLaunch.consoleErrors).toEqual([])
      expect(secondLaunch.pageErrors).toEqual([])
    } finally {
      if (firstLaunch) {
        await firstLaunch.close()
      }
      if (secondLaunch) {
        await secondLaunch.close()
      }
      try {
        rmSync(persistentUserDataDir, { recursive: true, force: true })
      } catch {
        // Ignore Windows file handle release fallback
      }
    }
  })
})
