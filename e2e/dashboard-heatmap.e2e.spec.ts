import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function weekdayOf(date: string): string {
  return WEEKDAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

// Cell aria-label: "YYYY-MM-DD (曜): N枚 (camera / lens)"
function parseCellCount(ariaLabel: string | null): number {
  const match = ariaLabel ? /^\d{4}-\d{2}-\d{2} \([日月火水木金土]\): (\d+)枚/.exec(ariaLabel) : null
  return match ? Number(match[1]) : 0
}

test.describe('Sabaki Dashboard Heatmap levels', () => {
  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    // First launch auto-seeds 180 demo shots spread over 52 weeks
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('renders relative intensity levels: Level 4 only for the peak and Level 2-3 cells for the rest', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '撮影分析' }).click()
    await expect(page.getByText('180', { exact: true })).toBeVisible({ timeout: 15_000 })

    const heatmapRegion = page.getByRole('region', { name: '撮影アクティビティヒートマップ' })
    const cells = heatmapRegion.locator('button[data-date][data-level]')
    await expect(cells).toHaveCount(364)

    await expect(heatmapRegion.locator('button[data-level="4"]').first()).toBeVisible()
    const midLevelCells = heatmapRegion.locator(
      'button[data-level="2"], button[data-level="3"]'
    )
    expect(await midLevelCells.count()).toBeGreaterThan(0)

    const rendered = await cells.evaluateAll((elements) =>
      elements.map((el) => ({
        label: el.getAttribute('aria-label'),
        level: Number(el.getAttribute('data-level'))
      }))
    )
    const withCounts = rendered.map((cell) => ({ ...cell, count: parseCellCount(cell.label) }))
    const maxCount = Math.max(...withCounts.map((cell) => cell.count))
    expect(maxCount).toBeGreaterThan(0)

    for (const cell of withCounts) {
      if (cell.count === 0) {
        expect(cell.level).toBe(0)
      } else {
        // every active day is at least Level 1, and only the peak day reaches Level 4
        expect(cell.level).toBeGreaterThanOrEqual(1)
        expect(cell.level === 4).toBe(cell.count === maxCount)
      }
    }

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('keyboard: Tab enters and leaves the grid in one step, arrow keys move, Enter/Space toggle the day filter', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '撮影分析' }).click()
    await expect(page.getByText('180', { exact: true })).toBeVisible({ timeout: 15_000 })

    const grid = page.getByRole('grid', { name: /撮影アクティビティ・ヒートマップ/ })
    const cells = grid.getByRole('gridcell')
    await expect(cells).toHaveCount(364)
    await expect(grid.getByRole('row')).toHaveCount(7)

    // Exactly one tab stop; with no selected day it is the latest day of the period
    const tabStops = grid.locator('[role="gridcell"][tabindex="0"]')
    await expect(tabStops).toHaveCount(1)
    const dates = await grid
      .locator('[role="gridcell"][data-date]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-date') ?? ''))
    const latest = [...dates].sort().at(-1)!
    await expect(tabStops).toHaveAttribute('data-date', latest)

    const isFocusInGrid = (): Promise<boolean> =>
      grid.evaluate((el) => el.contains(document.activeElement))

    // Tab from the year filter until focus lands in the grid
    await page.getByLabel('撮影年').focus()
    let presses = 0
    while (!(await isFocusInGrid())) {
      await page.keyboard.press('Tab')
      presses += 1
      expect(presses).toBeLessThan(50)
    }
    const cellAt = (date: string) => grid.locator(`[role="gridcell"][data-date="${date}"]`)
    await expect(cellAt(latest)).toBeFocused()

    // One Tab leaves the grid, one Shift+Tab comes back to the same cell
    await page.keyboard.press('Tab')
    expect(await isFocusInGrid()).toBe(false)
    await page.keyboard.press('Shift+Tab')
    await expect(cellAt(latest)).toBeFocused()

    // ←→ = previous / next week, ↑↓ = previous / next day; roving tab stop follows focus
    await page.keyboard.press('ArrowLeft')
    await expect(cellAt(shiftDate(latest, -7))).toBeFocused()
    await page.keyboard.press('ArrowUp')
    const prevDay = shiftDate(latest, -8)
    await expect(cellAt(prevDay)).toBeFocused()
    // vertical moves change the weekday, which the label announces
    await expect(cellAt(prevDay)).toHaveAttribute(
      'aria-label',
      new RegExp(`^${prevDay} \\(${weekdayOf(prevDay)}\\): \\d+枚`)
    )
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await expect(cellAt(latest)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(cellAt(latest)).toBeFocused()

    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    const target = shiftDate(latest, -14)
    await expect(cellAt(target)).toBeFocused()
    await expect(tabStops).toHaveCount(1)
    await expect(tabStops).toHaveAttribute('data-date', target)

    // Enter selects the day (same as click); focus survives the re-aggregation
    await page.keyboard.press('Enter')
    await expect(page.getByText(`日付指定: ${target}`)).toBeVisible()
    await expect(cellAt(target)).toHaveAttribute('aria-selected', 'true')
    await expect(cellAt(target)).toBeFocused()
    await expect(cells).toHaveCount(364)
    await expect(tabStops).toHaveAttribute('data-date', target)

    // Enter again clears the selection
    await page.keyboard.press('Enter')
    await expect(page.getByText(/日付指定: /)).toBeHidden()
    await expect(cellAt(target)).toHaveAttribute('aria-selected', 'false')
    await expect(cellAt(target)).toBeFocused()

    // Space toggles as well
    await page.keyboard.press('Space')
    await expect(page.getByText(`日付指定: ${target}`)).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.getByText(/日付指定: /)).toBeHidden()

    // Home / End = first / last day of the same weekday row; Ctrl+Home / Ctrl+End = period edges
    const weekMs = 7 * 86_400_000
    const sameWeekday = dates.filter((d) => (Date.parse(d) - Date.parse(target)) % weekMs === 0)
    await page.keyboard.press('Home')
    await expect(cellAt([...sameWeekday].sort()[0])).toBeFocused()
    await page.keyboard.press('End')
    await expect(cellAt([...sameWeekday].sort().at(-1)!)).toBeFocused()
    await page.keyboard.press('Control+Home')
    await expect(cellAt([...dates].sort()[0])).toBeFocused()
    await page.keyboard.press('Control+End')
    await expect(cellAt(latest)).toBeFocused()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
