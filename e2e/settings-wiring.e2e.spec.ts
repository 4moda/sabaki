import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

function createMockSdFixture(): {
  rootDir: string
  sourceDir: string
  destDir: string
  cleanup: () => void
} {
  const rootDir = mkdtempSync(join(tmpdir(), 'sabaki-e2e-settings-sd-'))
  const sourceDir = join(rootDir, 'SD_CARD', 'DCIM', '100MSDCF')
  const destDir = join(rootDir, 'PhotoLibrary')
  mkdirSync(sourceDir, { recursive: true })
  mkdirSync(destDir, { recursive: true })

  const fixedDate = new Date('2026-11-19T08:30:00.000Z')
  const jpgPath = join(sourceDir, 'DSC9101.JPG')
  writeFileSync(
    jpgPath,
    Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
      Buffer.from('SABAKI-SETTINGS-WIRING-JPG'.repeat(32)),
      Buffer.from([0xff, 0xd9])
    ])
  )
  utimesSync(jpgPath, fixedDate, fixedDate)

  return {
    rootDir,
    sourceDir,
    destDir,
    cleanup: () => {
      try {
        rmSync(rootDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup races on Windows
      }
    }
  }
}

test.describe('Sabaki Settings Wiring (fastHashMode & autoOpenDigestModal)', () => {
  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('persists fastHashMode & autoOpenDigestModal and suppresses auto-opening digest when disabled', async () => {
    const { page, userDataDir, consoleErrors, pageErrors } = appHandle
    const settingsFile = join(userDataDir, 'settings.json')

    await page.getByRole('button', { name: '常駐・設定' }).click()
    await expect(
      page.getByRole('heading', { name: /常駐動作 & アプリケーション設定/ })
    ).toBeVisible()

    // 1. Toggle fastHashMode OFF and verify persistence
    const fastHashSwitch = page.getByRole('switch', { name: /高速ハッシュモード/ })
    await expect(fastHashSwitch).toHaveAttribute('aria-checked', 'true')
    await fastHashSwitch.click()
    await expect(fastHashSwitch).toHaveAttribute('aria-checked', 'false')

    await expect
      .poll(() => existsSync(settingsFile), { timeout: 10_000 })
      .toBe(true)
    await expect
      .poll(
        () =>
          (JSON.parse(readFileSync(settingsFile, 'utf8')) as { fastHashMode?: boolean })
            .fastHashMode,
        { timeout: 10_000 }
      )
      .toBe(false)

    // 2. Toggle autoOpenDigestModal OFF and verify persistence
    const autoDigestSwitch = page.getByRole('switch', {
      name: /インポート完了後に撮影属性アナライズレポートを自動表示/
    })
    await expect(autoDigestSwitch).toHaveAttribute('aria-checked', 'true')
    await autoDigestSwitch.click()
    await expect(autoDigestSwitch).toHaveAttribute('aria-checked', 'false')

    await expect
      .poll(
        () =>
          (
            JSON.parse(readFileSync(settingsFile, 'utf8')) as {
              autoOpenDigestModal?: boolean
            }
          ).autoOpenDigestModal,
        { timeout: 10_000 }
      )
      .toBe(false)

    // 3. Run import on Import tab and verify digest report does NOT auto-open
    const fixture = createMockSdFixture()
    try {
      await page.getByRole('button', { name: 'SD取込・整理' }).click()
      await expect(page.getByRole('heading', { name: /SDカード取り込み/ })).toBeVisible()

      await page.getByLabel('SDカード / コピー元フォルダ').fill(fixture.sourceDir)
      await page.getByLabel('HDD / SSD コピー先ルート').fill(fixture.destDir)

      await page.getByRole('button', { name: '振り分けコピー開始' }).click()
      await expect(page.getByText('インポート完了', { exact: true })).toBeVisible({
        timeout: 30_000
      })

      // Auto-open disabled -> digest card stays hidden, completion banner with manual button is visible
      await expect(page.getByText('今回の撮影属性アナライズレポート')).toBeHidden()
      await expect(page.getByText('インポートが完了しました')).toBeVisible()

      // Clicking manual trigger opens the digest report on demand
      await page.getByRole('button', { name: '撮影属性レポートを表示' }).click()
      await expect(page.getByText('今回の撮影属性アナライズレポート')).toBeVisible()
    } finally {
      fixture.cleanup()
    }

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
