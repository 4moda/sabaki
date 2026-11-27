import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
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

/**
 * Asserts every counter tile shows its full label and value inside the tile bounds
 * (no ellipsis, no horizontal overflow) and that the page has no horizontal overflow.
 */
async function assertCountersFit(page: Page): Promise<void> {
  const tiles = page.getByTestId('import-counter-tile')
  await expect(tiles).toHaveCount(COUNTER_LABELS.length)

  const metrics = await tiles.evaluateAll((elements) =>
    elements.map((tile) => {
      const tileRect = tile.getBoundingClientRect()
      const measure = (selector: string) => {
        const el = tile.querySelector<HTMLElement>(selector)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return {
          text: el.textContent ?? '',
          textOverflow: window.getComputedStyle(el).textOverflow,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          right: rect.right
        }
      }
      return {
        tileRight: tileRect.right,
        tileScrollWidth: tile.scrollWidth,
        tileClientWidth: tile.clientWidth,
        label: measure('[data-testid="import-counter-label"]'),
        value: measure('[data-testid="import-counter-value"]')
      }
    })
  )

  expect(metrics.map((m) => m.label?.text)).toEqual([...COUNTER_LABELS])
  for (const m of metrics) {
    expect(m.tileScrollWidth).toBeLessThanOrEqual(m.tileClientWidth + 1)
    for (const part of [m.label, m.value]) {
      expect(part).not.toBeNull()
      expect(part!.textOverflow).not.toBe('ellipsis')
      expect(part!.scrollWidth).toBeLessThanOrEqual(part!.clientWidth + 1)
      expect(part!.right).toBeLessThanOrEqual(m.tileRight + 1)
    }
  }

  const hasHorizontalOverflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    return main ? main.scrollWidth > main.clientWidth + 2 : false
  })
  expect(hasHorizontalOverflow).toBe(false)
}

async function switchTabsAndReturn(page: Page): Promise<void> {
  await page.getByRole('button', { name: '撮影分析' }).click()
  await expect(
    page.getByRole('heading', { name: /撮影アクティビティ & Exif分析ダッシュボード/ })
  ).toBeVisible()

  await page.getByRole('button', { name: '取込履歴' }).click()
  await expect(
    page.getByRole('heading', { name: /取り込み履歴 & SNS Exifキャプション生成/ })
  ).toBeVisible()

  await page.getByRole('button', { name: 'SD取込・整理' }).click()
  await expect(page.getByRole('heading', { name: /SDカード取り込み/ })).toBeVisible()
}

function getAdvancedToggle(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true })
}

test.describe('Sabaki Import Screen UX & Tab Persistence (Issue #2)', () => {
  test.describe.configure({ mode: 'serial' })

  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('01: compact layout, collapsible advanced settings with summaries, and unclipped path previews', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await expect(page.getByRole('heading', { name: /SDカード取り込み/ })).toBeVisible()

    const pathToggle = getAdvancedToggle(page, '保存先フォルダ構成ビルダー')
    const policyToggle = getAdvancedToggle(page, '重複検知・競合解決ポリシー')
    await expect(pathToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(policyToggle).toHaveAttribute('aria-expanded', 'false')

    // Collapsed: one-line summaries of the applied values + scope note are visible
    await expect(page.getByText('{YYYY}/{YYYY-MM-DD}/{Ext}', { exact: true })).toBeVisible()
    await expect(page.getByText(/同名時: 同一スキップ・別物リネーム/)).toBeVisible()
    await expect(page.getByText('既定値（常駐・設定）')).toHaveCount(2)
    await expect(page.getByText(/ここでの変更は今回の取込にのみ適用され/)).toBeVisible()
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

    // Expanded path builder: each row shows the full template-expanded part without ellipsis
    await pathToggle.click()
    await expect(pathToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('出力パスプレビュー')).toBeVisible()

    const longDestRoot = 'C:/Users/Photographer/Pictures/Archive_2026/PhotoLibrary/Exports'
    await page.getByLabel('HDD / SSD コピー先ルート').fill(longDestRoot)
    await expect(page.getByTestId('path-preview-root')).toHaveText(`${longDestRoot}/`)

    const relativePaths = page.getByTestId('path-preview-relative')
    await expect(relativePaths).toHaveText([
      '2026/2026-11-19/ARW/DSC0001.ARW',
      '2026/2026-11-19/JPG/DSC0001.JPG',
      '2026/2026-11-19/MP4/C0001.MP4'
    ])
    const previewMetrics = await relativePaths.evaluateAll((elements) =>
      elements.map((el) => ({
        text: el.textContent ?? '',
        textOverflow: window.getComputedStyle(el).textOverflow,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }))
    )
    for (const metric of previewMetrics) {
      expect(metric.text).not.toMatch(/…|\.\.\./)
      expect(metric.textOverflow).not.toBe('ellipsis')
      expect(metric.scrollWidth).toBeLessThanOrEqual(metric.clientWidth + 2)
    }
    await pathToggle.click()
    await expect(pathToggle).toHaveAttribute('aria-expanded', 'false')

    // Conflict policy change is flagged as a temporary (this import only) override
    await policyToggle.click()
    await page.getByRole('radio', { name: /常に連番リネーム/ }).click()
    await expect(page.getByText(/同名時: 常に連番リネーム/)).toBeVisible()
    await expect(page.getByText('今回の取込のみ（未保存）')).toBeVisible()
    await page.getByRole('button', { name: '既定値に戻す' }).click()
    await expect(page.getByText(/同名時: 同一スキップ・別物リネーム/)).toBeVisible()
    await expect(page.getByText('今回の取込のみ（未保存）')).toBeHidden()
    await policyToggle.click()
    await expect(policyToggle).toHaveAttribute('aria-expanded', 'false')

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('02: keeps inputs, scan result, and completed report across tab switches; counters fit at 1280 / 1024 / 960', async () => {
    const { page, consoleErrors, pageErrors } = appHandle
    const fixture = createMockSdFixture()
    try {
      const sourceInput = page.getByLabel('SDカード / コピー元フォルダ')
      const destInput = page.getByLabel('HDD / SSD コピー先ルート')
      await sourceInput.fill(fixture.sourceDir)
      await destInput.fill(fixture.destDir)

      await page.getByRole('button', { name: '事前スキャン' }).click()
      await expect(page.getByText('スキャン完了')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('3 ファイル')).toBeVisible()

      await switchTabsAndReturn(page)
      await expect(sourceInput).toHaveValue(fixture.sourceDir)
      await expect(destInput).toHaveValue(fixture.destDir)
      await expect(page.getByText('スキャン完了')).toBeVisible()
      await expect(page.getByText('3 ファイル')).toBeVisible()

      await page.getByRole('button', { name: '振り分けコピー開始' }).click()
      await expect(page.getByText('インポート完了', { exact: true })).toBeVisible({
        timeout: 30_000
      })
      await expect(page.getByText('今回の撮影属性アナライズレポート')).toBeVisible()
      expect(existsSync(join(fixture.destDir, '2026', '2026-11-19', 'ARW', 'DSC9201.ARW'))).toBe(
        true
      )

      // Completed progress and the digest report survive a tab round trip
      await switchTabsAndReturn(page)
      await expect(page.getByText('インポート完了', { exact: true })).toBeVisible()
      await expect(page.getByText('今回の撮影属性アナライズレポート')).toBeVisible()
      await expect(sourceInput).toHaveValue(fixture.sourceDir)

      await assertCountersFit(page)

      await setWindowAndViewportSize(appHandle, 1024, 768)
      await assertCountersFit(page)

      await setWindowAndViewportSize(appHandle, 960, 720)
      await assertCountersFit(page)
    } finally {
      await setWindowAndViewportSize(appHandle, DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT)
      fixture.cleanup()
    }

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('03: reflects defaults changed in 「常駐・設定」 when returning to the Import tab', async () => {
    const { page, userDataDir, consoleErrors, pageErrors } = appHandle
    const settingsFile = join(userDataDir, 'settings.json')
    const newTemplate = '{YYYY}/{MM}/{Ext}'

    await page.getByRole('button', { name: '常駐・設定' }).click()
    await expect(
      page.getByRole('heading', { name: /常駐動作 & アプリケーション設定/ })
    ).toBeVisible()

    await page.getByLabel('フォルダ構成プリセット').selectOption(newTemplate)
    await expect
      .poll(
        () =>
          existsSync(settingsFile)
            ? (JSON.parse(readFileSync(settingsFile, 'utf8')) as { pathTemplate?: string })
                .pathTemplate
            : undefined,
        { timeout: 10_000 }
      )
      .toBe(newTemplate)

    await page.getByRole('button', { name: 'SD取込・整理' }).click()
    await expect(page.getByRole('heading', { name: /SDカード取り込み/ })).toBeVisible()

    // The template was not overridden on the Import page, so it follows the new default
    await expect(page.getByText(newTemplate, { exact: true })).toBeVisible()
    await expect(page.getByText('既定値（常駐・設定）')).toHaveCount(2)
    await expect(page.getByText('今回の取込のみ（未保存）')).toBeHidden()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
