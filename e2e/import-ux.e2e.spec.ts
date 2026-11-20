import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  launchSabakiApp,
  type LaunchedSabakiApp
} from './helpers/electronApp'

const COUNTER_LABELS = ['コピー', 'スキップ', 'リネーム', '上書き', 'エラー'] as const

function createMockSdFixture(): {
  rootDir: string
  sourceDir: string
  destDir: string
  cleanup: () => void
} {
  const rootDir = mkdtempSync(join(tmpdir(), 'sabaki-e2e-import-ux-'))
  const sourceDir = join(rootDir, 'SD_CARD', 'DCIM', '100MSDCF')
  const destDir = join(rootDir, 'PhotoLibrary')
  mkdirSync(sourceDir, { recursive: true })
  mkdirSync(destDir, { recursive: true })

  const fixedDate = new Date('2026-11-19T08:30:00.000Z')
  const files: Array<{ name: string; content: Buffer }> = [
    {
      name: 'DSC9201.JPG',
      content: Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
        Buffer.from('SABAKI-IMPORT-UX-JPG'.repeat(32)),
        Buffer.from([0xff, 0xd9])
      ])
    },
    {
      name: 'DSC9201.ARW',
      content: Buffer.from('SABAKI-IMPORT-UX-ARW'.repeat(128))
    },
    {
      name: 'C9201.MP4',
      content: Buffer.from('SABAKI-IMPORT-UX-MP4'.repeat(128))
    }
  ]

  for (const file of files) {
    const filePath = join(sourceDir, file.name)
    writeFileSync(filePath, file.content)
    utimesSync(filePath, fixedDate, fixedDate)
  }

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

async function setWindowAndViewportSize(
  appHandle: LaunchedSabakiApp,
  width: number,
  height: number
): Promise<void> {
  await appHandle.electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.setContentSize(size.width, size.height)
      }
    },
    { width, height }
  )
  await appHandle.page.setViewportSize({ width, height })
  await appHandle.page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

async function assertCounterLabelsUnclipped(
  page: Page,
  progressCard: Locator
): Promise<void> {
  for (const label of COUNTER_LABELS) {
    const labelLocator = progressCard.getByText(label, { exact: true })
    await expect(labelLocator).toBeVisible()

    const metrics = await labelLocator.evaluate((el) => {
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const tile = el.closest('div.rounded-lg')
      const tileRect = tile?.getBoundingClientRect()
      return {
        text: el.textContent ?? '',
        textOverflow: style.textOverflow,
        overflowX: style.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        height: rect.height,
        right: rect.right,
        tileRight: tileRect ? tileRect.right : rect.right
      }
    })

    expect(metrics.text).toBe(label)
    expect(metrics.textOverflow).not.toBe('ellipsis')
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
    expect(metrics.right).toBeLessThanOrEqual(metrics.tileRight + 1)
    expect(metrics.height).toBeLessThanOrEqual(24)
  }

  const hasHorizontalOverflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    return main ? main.scrollWidth > main.clientWidth + 2 : false
  })
  expect(hasHorizontalOverflow).toBe(false)
}

test.describe('Sabaki Import Screen UX & Tab Persistence (Issue #2)', () => {
  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('verifies collapsible advanced settings, unclipped PathPreviewBox, tab-switch persistence, and counter labels at 1280px & 960px', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    // 1. Initial collapsed state & compact above-the-fold layout at 1280x840
    await expect(page.getByRole('heading', { name: /SDカード取り込み/ })).toBeVisible()

    const toggleButton = page.getByRole('button', {
      name: /詳細設定（振り分けルール・競合解決）/
    })
    await expect(toggleButton).toBeVisible()
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

    await expect(page.getByText('{YYYY}/{YYYY-MM-DD}/{Ext}')).toBeVisible()
    await expect(page.getByText('同一スキップ・別物リネーム')).toBeVisible()
    await expect(page.getByText(/今回の取り込みのみ適用/)).toBeVisible()
    await expect(page.getByText('出力パスプレビュー')).toBeHidden()

    const initialLayout = await page.evaluate(() => {
      const main = document.querySelector('main')
      return {
        scrollHeight: main ? main.scrollHeight : 0,
        scrollWidth: main ? main.scrollWidth : 0,
        clientWidth: main ? main.clientWidth : 0
      }
    })
    expect(initialLayout.scrollWidth).toBeLessThanOrEqual(initialLayout.clientWidth + 2)
    expect(initialLayout.scrollHeight).toBeLessThan(900)

    // 2. Expand collapsible details and verify PathPreviewBox renders unclipped RAW/JPEG/VIDEO paths
    await toggleButton.click()
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('出力パスプレビュー')).toBeVisible()

    const destInput = page.getByLabel('HDD / SSD コピー先ルート')
    const longDestRoot = 'C:/Users/Photographer/Pictures/Archive_2026/PhotoLibrary'
    await destInput.fill(longDestRoot)

    const previewItems = [
      { ext: 'ARW', fileName: 'DSC0001.ARW' },
      { ext: 'JPG', fileName: 'DSC0001.JPG' },
      { ext: 'MP4', fileName: 'C0001.MP4' }
    ]

    for (const item of previewItems) {
      const codeLocator = page.locator('code', { hasText: item.fileName })
      await expect(codeLocator).toBeVisible()
      const previewMetrics = await codeLocator.evaluate((el) => {
        const style = window.getComputedStyle(el)
        return {
          text: el.textContent ?? '',
          textOverflow: style.textOverflow,
          overflowX: style.overflowX,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth
        }
      })
      expect(previewMetrics.text).toContain(`/${item.ext}/${item.fileName}`)
      expect(previewMetrics.textOverflow).not.toBe('ellipsis')
      expect(previewMetrics.scrollWidth).toBeLessThanOrEqual(previewMetrics.clientWidth + 2)
    }

    // Verify conflict policy change updates the 1-line summary, then restore default
    await page.getByRole('radio', { name: /常に連番リネーム/ }).click()
    await expect(page.getByText('常に連番リネーム', { exact: true }).first()).toBeVisible()
    await page.getByRole('radio', { name: /内容ハッシュ比較/ }).click()

    await toggleButton.click()
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

    // 3. Pre-scan, switch across tabs, and confirm source/dest paths & scan results persist
    const fixture = createMockSdFixture()
    try {
      const sourceInput = page.getByLabel('SDカード / コピー元フォルダ')
      await sourceInput.fill(fixture.sourceDir)
      await destInput.fill(fixture.destDir)

      await page.getByRole('button', { name: '事前スキャン' }).click()
      await expect(page.getByText('スキャン完了')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('3 ファイル')).toBeVisible()

      await page.getByRole('button', { name: '撮影分析' }).click()
      await expect(
        page.getByRole('heading', { name: /撮影アクティビティ & Exif分析ダッシュボード/ })
      ).toBeVisible()

      await page.getByRole('button', { name: '取込履歴' }).click()
      await expect(
        page.getByRole('heading', { name: /取り込み履歴 & SNS Exifキャプション生成/ })
      ).toBeVisible()

      await page.getByRole('button', { name: 'SD取込・整理' }).click()
      await expect(sourceInput).toHaveValue(fixture.sourceDir)
      await expect(destInput).toHaveValue(fixture.destDir)
      await expect(page.getByText('スキャン完了')).toBeVisible()
      await expect(page.getByText('3 ファイル')).toBeVisible()

      // 4. Run import and verify counter labels render without truncation at 1280px, 1024px, and 960px
      await page.getByRole('button', { name: '振り分けコピー開始' }).click()
      const progressCard = page.locator('section', {
        hasText: 'スキャン結果 & インポート実行'
      })
      await expect(progressCard.getByText('インポート完了', { exact: true })).toBeVisible({
        timeout: 30_000
      })

      await assertCounterLabelsUnclipped(page, progressCard)

      await setWindowAndViewportSize(appHandle, 1024, 768)
      await assertCounterLabelsUnclipped(page, progressCard)

      await setWindowAndViewportSize(appHandle, 960, 720)
      await assertCounterLabelsUnclipped(page, progressCard)

      await setWindowAndViewportSize(
        appHandle,
        DEFAULT_VIEWPORT_WIDTH,
        DEFAULT_VIEWPORT_HEIGHT
      )
    } finally {
      fixture.cleanup()
    }

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
