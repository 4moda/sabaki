import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

function parseCellCount(ariaLabel: string | null): number {
  const match = ariaLabel ? /: (\d+)枚/.exec(ariaLabel) : null
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
})
