import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

test.describe('Sabaki Settings Polish, Tray Badge Sync & Confirmation Dialogs', () => {
  test('syncs tray badge, removes internal keys, aligns switches, confirms OS-native reset & demo seed, and polishes copy/labels', async () => {
    const persistentUserDataDir = mkdtempSync(join(tmpdir(), 'sabaki-e2e-settings-polish-'))
    let firstLaunch: LaunchedSabakiApp | null = null
    let secondLaunch: LaunchedSabakiApp | null = null

    try {
      firstLaunch = await launchSabakiApp({
        userDataDir: persistentUserDataDir,
        cleanupUserDataDir: false
      })
      const { page, electronApp, consoleErrors, pageErrors } = firstLaunch

      // OS-native default follows the (possibly relocated) Pictures folder reported by Electron
      const picturesDir = await electronApp.evaluate(({ app }) => app.getPath('pictures'))
      const expectedDefaultDest = join(picturesDir, 'Sabaki')
      expect(expectedDefaultDest).not.toBe('D:/Photos')

      // 1. Initial sidebar tray badge is the active emerald pulse
      const sidebar = page.locator('aside')
      await expect(sidebar.getByText('タスクトレイ常駐中')).toBeVisible()
      await expect(sidebar.locator('.animate-pulse')).toHaveCount(1)

      // 2. Settings labels no longer expose internal English keys
      await page.getByRole('button', { name: '常駐・設定' }).click()
      await expect(
        page.getByRole('heading', { name: /常駐動作 & アプリケーション設定/ })
      ).toBeVisible()
      await expect(page.getByText(/minimizeToTrayOnClose/)).toHaveCount(0)
      await expect(page.getByText(/enableCompletionNotification/)).toHaveCount(0)

      const traySwitch = page.getByRole('switch', {
        name: 'ウィンドウを閉じた時にタスクトレイへ常駐'
      })
      const notifSwitch = page.getByRole('switch', {
        name: 'インポート完了時にOSネイティブ通知を表示'
      })
      const autoDigestSwitch = page.getByRole('switch', {
        name: 'インポート完了後に撮影属性アナライズレポートを自動表示'
      })
      const fastHashSwitch = page.getByRole('switch', {
        name: '高速ハッシュモード（大容量動画ファイル向け）'
      })

      // 3. All 4 switch tracks share the same left edge (fast hash no longer shifted by an icon)
      const boxes = await Promise.all([
        traySwitch.boundingBox(),
        notifSwitch.boundingBox(),
        autoDigestSwitch.boundingBox(),
        fastHashSwitch.boundingBox()
      ])
      for (const box of boxes) {
        expect(box).not.toBeNull()
      }
      const xPositions = boxes.map((box) => box!.x)
      for (const x of xPositions) {
        expect(Math.abs(x - xPositions[0])).toBeLessThanOrEqual(1)
      }

      // 4. Initial defaultDestRoot is the OS-native Pictures/Sabaki
      const destInput = page.getByLabel('デフォルト保存先 (HDD / SSD)')
      await expect(destInput).toHaveValue(expectedDefaultDest)

      // 5. Toggle minimizeToTray OFF -> sidebar badge updates immediately, across tabs & relaunch
      await traySwitch.click()
      await expect(traySwitch).toHaveAttribute('aria-checked', 'false')
      await expect(sidebar.getByText('タスクトレイ常駐オフ')).toBeVisible()
      await expect(sidebar.getByText('タスクトレイ常駐中')).toBeHidden()
      await expect(sidebar.locator('.animate-pulse')).toHaveCount(0)

      await page.getByRole('button', { name: 'SD取込・整理' }).click()
      await expect(sidebar.getByText('タスクトレイ常駐オフ')).toBeVisible()

      expect(consoleErrors).toEqual([])
      expect(pageErrors).toEqual([])
      await firstLaunch.close()
      firstLaunch = null

      secondLaunch = await launchSabakiApp({
        userDataDir: persistentUserDataDir,
        cleanupUserDataDir: false
      })
      const {
        page: page2,
        consoleErrors: consoleErrors2,
        pageErrors: pageErrors2
      } = secondLaunch
      const sidebar2 = page2.locator('aside')
      await expect(sidebar2.getByText('タスクトレイ常駐オフ')).toBeVisible()
      await expect(sidebar2.locator('.animate-pulse')).toHaveCount(0)

      // 6. Customize destRoot & template, then exercise reset cancel / Esc / confirm
      await page2.getByRole('button', { name: '常駐・設定' }).click()
      const traySwitch2 = page2.getByRole('switch', {
        name: 'ウィンドウを閉じた時にタスクトレイへ常駐'
      })
      await expect(traySwitch2).toHaveAttribute('aria-checked', 'false')

      const destInput2 = page2.getByLabel('デフォルト保存先 (HDD / SSD)')
      const templateInput2 = page2.getByLabel('振り分けパターン文字列')
      await destInput2.fill('D:/Photos')
      await templateInput2.fill('{YYYY}/{MM}')

      const settingsFile = join(persistentUserDataDir, 'settings.json')
      await expect.poll(() => existsSync(settingsFile), { timeout: 10_000 }).toBe(true)
      await expect
        .poll(
          () =>
            (JSON.parse(readFileSync(settingsFile, 'utf8')) as { defaultDestRoot?: string })
              .defaultDestRoot,
          { timeout: 10_000 }
        )
        .toBe('D:/Photos')

      const resetTrigger = page2.getByRole('button', { name: '初期設定に戻す' })
      const resetDialog = page2.getByRole('alertdialog', { name: '初期設定へのリセット確認' })

      // Opening focuses the safe button and the body text is the accessible description
      await resetTrigger.click()
      await expect(resetDialog).toBeVisible()
      await expect(resetDialog.getByRole('button', { name: 'キャンセル' })).toBeFocused()
      await expect(resetDialog).toHaveAccessibleDescription(/初期値に戻します/)

      // Esc closes and returns focus to the trigger
      await page2.keyboard.press('Escape')
      await expect(resetDialog).toBeHidden()
      await expect(resetTrigger).toBeFocused()

      // Cancel leaves changes intact
      await resetTrigger.click()
      await resetDialog.getByRole('button', { name: 'キャンセル' }).click()
      await expect(resetDialog).toBeHidden()
      await expect(resetTrigger).toBeFocused()
      await expect(destInput2).toHaveValue('D:/Photos')
      await expect(traySwitch2).toHaveAttribute('aria-checked', 'false')
      await expect(sidebar2.getByText('タスクトレイ常駐オフ')).toBeVisible()

      // Confirm resets to OS-native Pictures/Sabaki & restores the tray badge
      await resetTrigger.click()
      await resetDialog.getByRole('button', { name: '初期値に戻す' }).click()
      await expect(resetDialog).toBeHidden()

      await expect(destInput2).toHaveValue(expectedDefaultDest)
      await expect(templateInput2).toHaveValue('{YYYY}/{YYYY-MM-DD}/{Ext}')
      await expect(traySwitch2).toHaveAttribute('aria-checked', 'true')
      await expect(sidebar2.getByText('タスクトレイ常駐中')).toBeVisible()
      await expect(sidebar2.locator('.animate-pulse')).toHaveCount(1)

      await expect
        .poll(
          () => {
            const parsed = JSON.parse(readFileSync(settingsFile, 'utf8')) as {
              defaultDestRoot?: string
              minimizeToTray?: boolean
              pathTemplate?: string
            }
            return (
              parsed.defaultDestRoot === expectedDefaultDest &&
              parsed.minimizeToTray === true &&
              parsed.pathTemplate === '{YYYY}/{YYYY-MM-DD}/{Ext}'
            )
          },
          { timeout: 10_000 }
        )
        .toBe(true)

      // 7. Demo seed requires confirmation: cancel does nothing, execute inserts
      const seedTrigger = page2.getByRole('button', { name: 'サンプル撮影データを投入' })
      const seedDialog = page2.getByRole('alertdialog', { name: 'サンプル撮影データの投入確認' })
      const seededMessage = page2.getByText(/サンプル撮影データ .+件 を投入しました。/)

      await seedTrigger.click()
      await expect(seedDialog).toBeVisible()
      await expect(seedDialog.getByRole('button', { name: 'キャンセル' })).toBeFocused()
      await seedDialog.getByRole('button', { name: 'キャンセル' }).click()
      await expect(seedDialog).toBeHidden()
      await expect(seedTrigger).toBeFocused()
      await expect(seededMessage).toHaveCount(0)

      await seedTrigger.click()
      await seedDialog.getByRole('button', { name: '投入する' }).click()
      await expect(seedDialog).toBeHidden()
      await expect(seededMessage).toBeVisible({ timeout: 15_000 })

      // Data clear dialog shares the same focus behaviour
      const clearTrigger = page2.getByRole('button', { name: '履歴・デモデータを初期化' })
      const clearDialog = page2.getByRole('alertdialog', { name: '履歴・デモデータの初期化確認' })
      await clearTrigger.click()
      await expect(clearDialog.getByRole('button', { name: 'キャンセル' })).toBeFocused()
      await page2.keyboard.press('Escape')
      await expect(clearDialog).toBeHidden()
      await expect(clearTrigger).toBeFocused()

      // 8. SnsShareExportCard no longer duplicates icons with emojis
      await page2.getByRole('button', { name: '撮影分析' }).click()
      await expect(
        page2.getByRole('heading', { name: '機材・撮影インサイト', exact: true })
      ).toBeVisible()
      await expect(
        page2.getByText('Webサイト / ポートフォリオ連携用クリーンJSON', { exact: true })
      ).toBeVisible()
      await expect(page2.getByText(/📸/)).toHaveCount(0)
      await expect(page2.getByText(/🌐/)).toHaveCount(0)

      // 9. History: Japanese status badges and unified copy feedback
      await page2.getByRole('button', { name: '取込履歴' }).click()
      await expect(page2.getByText('最近のインポートセッション履歴')).toBeVisible({
        timeout: 15_000
      })
      await expect(page2.getByText('完了', { exact: true }).first()).toBeVisible()
      await expect(page2.getByText('completed', { exact: true })).toHaveCount(0)

      const copyButton = page2.getByRole('button', { name: 'コピー', exact: true }).first()
      await expect(copyButton).toBeVisible()
      await copyButton.click()
      await expect(page2.getByRole('button', { name: 'コピーしました！' }).first()).toBeVisible()
      await expect(page2.getByText('Copied!')).toHaveCount(0)

      expect(consoleErrors2).toEqual([])
      expect(pageErrors2).toEqual([])
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
