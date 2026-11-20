import { expect, test } from '@playwright/test'
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  launchSabakiApp,
  type LaunchedSabakiApp
} from './helpers/electronApp'

test.describe('SessionDigestModal Keyboard, Backdrop A11y & 840px Viewport Layout', () => {
  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('fits SNS share preview in 1280x840 viewport, strips duplicate headline emoji, traps Tab focus, and dismisses via Escape or backdrop click with focus restoration', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    // Navigate to History tab where SessionDigestModal opens in modal variant
    await page.getByRole('button', { name: '取込履歴' }).click()
    await expect(
      page.getByRole('heading', { name: /取り込み履歴 & SNS Exifキャプション生成/ })
    ).toBeVisible()
    await expect(page.getByText('最近のインポートセッション履歴')).toBeVisible({ timeout: 15_000 })

    const triggerButton = page.getByRole('button', { name: '撮影属性レポートを見る' }).first()
    await expect(triggerButton).toBeVisible()
    await triggerButton.click()

    const dialog = page.getByRole('dialog', { name: '今回の撮影属性アナライズレポート' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')

    const closeButton = dialog.getByRole('button', { name: 'レポートを閉じる' })
    const copyButton = dialog.getByRole('button', { name: 'SNSテキストをコピー' })
    await expect(closeButton).toBeVisible()
    await expect(copyButton).toBeVisible()

    // 1. Initial focus moves into the dialog on open
    await expect(closeButton).toBeFocused()

    // 2. Headline banner does not double-up <Sparkles /> with a leading camera/sparkle emoji
    const headline = dialog.locator('p', { hasText: 'ILCE-7M4' }).first()
    await expect(headline).toBeVisible()
    const headlineText = (await headline.innerText()).trim()
    expect(headlineText).not.toMatch(/^(?:📷|📸|✨|🎥|📹)/u)

    // 3. Bottom SNS share text <pre> is fully visible within 1280x840 viewport without scrolling
    await expect(dialog.getByText('今日の撮影ログをSNS用にワンクリックコピー')).toBeVisible()
    const snsPre = dialog.locator('pre')
    await expect(snsPre).toBeVisible()
    const preText = await snsPre.innerText()
    expect(preText).toContain('#Sabaki')

    const preBox = await snsPre.boundingBox()
    expect(preBox).not.toBeNull()
    expect(preBox!.height).toBeGreaterThan(20)
    expect(preBox!.y).toBeGreaterThanOrEqual(0)
    expect(preBox!.y + preBox!.height).toBeLessThanOrEqual(DEFAULT_VIEWPORT_HEIGHT)

    const scrollMetrics = await dialog.evaluate((el) => {
      const scrollable = el.querySelector<HTMLElement>('section > .overflow-y-auto')
      return {
        scrollTop: scrollable?.scrollTop ?? 0,
        scrollHeight: scrollable?.scrollHeight ?? 0,
        clientHeight: scrollable?.clientHeight ?? 0
      }
    })
    expect(scrollMetrics.scrollTop).toBe(0)
    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight + 2)

    // 4. Tab and Shift+Tab keep focus trapped inside the dialog
    await page.keyboard.press('Tab')
    await expect(copyButton).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    await expect(copyButton).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    await expect(closeButton).toBeFocused()

    const focusInsideDialog = await dialog.evaluate((el) =>
      el.contains(document.activeElement)
    )
    expect(focusInsideDialog).toBe(true)

    // 5. Sticky close header stays reachable even if modal body scrolls on shorter viewports
    try {
      await page.setViewportSize({ width: DEFAULT_VIEWPORT_WIDTH, height: 480 })
      await dialog.evaluate((el) => {
        const scrollable = el.querySelector<HTMLElement>('section > .overflow-y-auto')
        if (scrollable) {
          scrollable.scrollTop = scrollable.scrollHeight
        }
      })
      const closeBoxCompact = await closeButton.boundingBox()
      expect(closeBoxCompact).not.toBeNull()
      expect(closeBoxCompact!.y).toBeGreaterThanOrEqual(0)
      expect(closeBoxCompact!.y + closeBoxCompact!.height).toBeLessThanOrEqual(480)
    } finally {
      await page.setViewportSize({
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT
      })
    }

    // 6. SNS copy button toggles copied label while staying accessible inside the dialog
    await copyButton.click()
    await expect(dialog.getByRole('button', { name: 'コピーしました！' })).toBeVisible()

    // 7. Escape closes the dialog and restores focus to the trigger button
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(triggerButton).toBeFocused()

    // 8. Re-open, verify clicking inside modal keeps it open, and clicking backdrop closes it
    await triggerButton.click()
    await expect(dialog).toBeVisible()

    await dialog.getByText('検出された撮影スタイル傾向').click()
    await expect(dialog).toBeVisible()

    await dialog.click({ position: { x: 12, y: 12 } })
    await expect(dialog).toBeHidden()
    await expect(triggerButton).toBeFocused()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
