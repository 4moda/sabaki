import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

function parseCellCount(ariaLabel: string | null): number {
  if (!ariaLabel) return 0
  const match = /: (\d+)枚/.exec(ariaLabel)
  return match ? Number(match[1]) : 0
}

test.describe('Sabaki Dashboard Heatmap & UX', () => {
  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('preserves heatmap on day click, renders relative levels > 1, localizes labels, and supports arrow-key navigation', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '撮影分析' }).click()
    await expect(
      page.getByRole('heading', { name: /撮影アクティビティ & Exif分析ダッシュボード/ })
    ).toBeVisible()

    const kpiSection = page.getByLabel('KPIサマリー')
    const totalShotsCard = kpiSection.locator('section').first()
    await expect(totalShotsCard.getByText('180', { exact: true })).toBeVisible({
      timeout: 15_000
    })

    // 1. Period label shows rolling 52 weeks by default, switches to year when filtered by year
    await expect(page.getByText('撮影アクティビティ・ヒートマップ (直近52週間)')).toBeVisible()
    await expect(page.getByText('撮影アクティビティ・ヒートマップ (2026年)')).toBeHidden()

    await page.getByLabel('撮影年').selectOption('2026')
    await expect(page.getByText('撮影アクティビティ・ヒートマップ (2026年)')).toBeVisible()
    await page.getByLabel('撮影年').selectOption('')
    await expect(page.getByText('撮影アクティビティ・ヒートマップ (直近52週間)')).toBeVisible()

    // 2. Japanese weekday labels, decorative legend (no fake Level 0 buttons), single 35mm switch, no header seed button
    const heatmapSection = page.getByLabel('撮影アクティビティヒートマップ')
    for (const dayLabel of ['日', '月', '水', '金']) {
      await expect(heatmapSection.getByText(dayLabel, { exact: true })).toBeVisible()
    }
    for (const engLabel of ['Sun', 'Mon', 'Wed', 'Fri']) {
      await expect(heatmapSection.getByText(engLabel, { exact: true })).toHaveCount(0)
    }

    await expect(page.getByRole('button', { name: /Level 0/ })).toHaveCount(0)
    await expect(page.getByRole('gridcell', { name: /Level 0/ })).toHaveCount(0)
    await expect(page.getByRole('switch', { name: '35mm換算' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'サンプル撮影データを投入' })).toHaveCount(0)

    // 3. Verify 364 gridcells and non-zero intensity levels > 1 rendered
    const grid = page.getByRole('grid', { name: /撮影アクティビティ・ヒートマップ/ })
    const allCells = grid.getByRole('gridcell')
    await expect(allCells).toHaveCount(364)

    const level4Cells = grid.locator('[role="gridcell"][data-level="4"]')
    const level2Or3Cells = grid.locator(
      '[role="gridcell"][data-level="2"], [role="gridcell"][data-level="3"]'
    )
    expect(await level4Cells.count()).toBeGreaterThan(0)
    expect(await level2Or3Cells.count()).toBeGreaterThan(0)

    const activeCells = grid.locator('[role="gridcell"]:not([data-level="0"])')
    const initialActiveCount = await activeCells.count()
    expect(initialActiveCount).toBeGreaterThan(20)

    // 4. Clicking a heatmap day filters KPIs while keeping other heatmap cells populated
    const nov18Cell = grid.locator('[role="gridcell"][data-date="2026-11-18"]')
    const nov19Cell = grid.locator('[role="gridcell"][data-date="2026-11-19"]')
    const nov17Cell = grid.locator('[role="gridcell"][data-date="2026-11-17"]')

    const nov18Count = parseCellCount(await nov18Cell.getAttribute('aria-label'))
    const nov19Count = parseCellCount(await nov19Cell.getAttribute('aria-label'))
    expect(nov18Count).toBeGreaterThan(0)
    expect(nov19Count).toBeGreaterThan(0)

    await nov18Cell.click()
    await expect(page.getByText('日付指定: 2026-11-18')).toBeVisible()
    await expect(nov18Cell).toHaveAttribute('aria-pressed', 'true')
    await expect(totalShotsCard.getByText(String(nov18Count), { exact: true })).toBeVisible()

    // Other heatmap cells and 52-week range stay intact
    await expect(allCells).toHaveCount(364)
    expect(await activeCells.count()).toBe(initialActiveCount)
    expect(parseCellCount(await nov19Cell.getAttribute('aria-label'))).toBe(nov19Count)
    expect(parseCellCount(await nov17Cell.getAttribute('aria-label'))).toBeGreaterThan(0)

    // 5. Clicking another day switches the selection
    await nov17Cell.click()
    await expect(page.getByText('日付指定: 2026-11-17')).toBeVisible()
    await expect(nov17Cell).toHaveAttribute('aria-pressed', 'true')
    await expect(nov18Cell).toHaveAttribute('aria-pressed', 'false')
    expect(await activeCells.count()).toBe(initialActiveCount)

    // Re-click to clear specificDay filter
    await nov17Cell.click()
    await expect(page.getByText(/日付指定:/)).toHaveCount(0)
    await expect(totalShotsCard.getByText('180', { exact: true })).toBeVisible()

    // 6. Roving tabindex + Arrow key navigation across date cells
    const initialFocusable = grid.locator('[role="gridcell"][tabindex="0"]')
    await expect(initialFocusable).toHaveCount(1)
    await expect(initialFocusable).toHaveAttribute('data-date', '2026-11-17')

    await nov17Cell.focus()
    await expect(nov17Cell).toBeFocused()

    // Home jumps to the first cell (2025-11-21)
    await page.keyboard.press('Home')
    const firstCell = grid.locator('[role="gridcell"][data-date="2025-11-21"]')
    await expect(firstCell).toBeFocused()
    await expect(firstCell).toHaveAttribute('tabindex', '0')
    await expect(nov17Cell).toHaveAttribute('tabindex', '-1')

    // ArrowRight moves +7 days (same weekday in next week column)
    await page.keyboard.press('ArrowRight')
    const rightTarget = grid.locator('[role="gridcell"][data-date="2025-11-28"]')
    await expect(rightTarget).toBeFocused()
    await expect(rightTarget).toHaveAttribute('tabindex', '0')
    await expect(firstCell).toHaveAttribute('tabindex', '-1')

    // ArrowDown moves +1 day
    await page.keyboard.press('ArrowDown')
    const downTarget = grid.locator('[role="gridcell"][data-date="2025-11-29"]')
    await expect(downTarget).toBeFocused()

    // ArrowUp moves -1 day back to 2025-11-28
    await page.keyboard.press('ArrowUp')
    await expect(rightTarget).toBeFocused()

    // ArrowLeft moves -7 days back to 2025-11-21
    await page.keyboard.press('ArrowLeft')
    await expect(firstCell).toBeFocused()

    // End jumps to the last cell (2026-11-19) and Enter toggles selection
    await page.keyboard.press('End')
    await expect(nov19Cell).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(nov19Cell).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('日付指定: 2026-11-19')).toBeVisible()

    // Clean up selection
    await page.getByRole('button', { name: '日付指定を解除' }).click()
    await expect(totalShotsCard.getByText('180', { exact: true })).toBeVisible()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('shows empty-state seed CTA only when library is empty and displays top seed feedback', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    // Clear all data via Settings
    await page.getByRole('button', { name: '常駐・設定' }).click()
    await page.getByRole('button', { name: '履歴・デモデータを初期化' }).click()
    const confirmDialog = page.getByRole('alertdialog', {
      name: '履歴・デモデータの初期化確認'
    })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'すべて削除する' }).click()
    await expect(confirmDialog).toBeHidden()

    // Return to Dashboard -> empty-state CTA with seed button is visible
    await page.getByRole('button', { name: '撮影分析' }).click()
    await expect(page.getByText('撮影データがまだ登録されていません')).toBeVisible()
    const seedButton = page.getByRole('button', { name: 'サンプル撮影データを投入' })
    await expect(seedButton).toBeVisible()

    // Seed from empty-state CTA -> top feedback banner appears and CTA disappears
    await seedButton.click()
    const statusBanner = page.getByRole('status')
    await expect(statusBanner).toContainText('サンプル撮影データ 180件 を投入しました。')
    await expect(page.getByText('撮影データがまだ登録されていません')).toBeHidden()
    await expect(page.getByRole('button', { name: 'サンプル撮影データを投入' })).toHaveCount(0)

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
