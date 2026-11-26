import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  launchSabakiApp,
  type LaunchedSabakiApp
} from './helpers/electronApp'

const COMPACT_VIEWPORT_HEIGHT = 480

test.describe('SessionDigestModal keyboard, overlay & layout', () => {
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

  /** Opens the modal from the History tab and returns the dialog and its trigger button. */
  async function openReport(page: Page): Promise<{ dialog: Locator; trigger: Locator }> {
    await page.getByRole('button', { name: '取込履歴' }).click()
    await expect(page.getByText('最近のインポートセッション履歴')).toBeVisible({ timeout: 15_000 })

    const trigger = page.getByRole('button', { name: '撮影属性レポートを見る' }).last()
    await expect(trigger).toBeVisible()
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: '今回の撮影属性アナライズレポート' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    return { dialog, trigger }
  }

  async function closeWithEscape(page: Page, dialog: Locator): Promise<void> {
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }

  test('moves focus into the dialog, traps Tab / Shift+Tab, and restores focus on Escape', async () => {
    const { page, consoleErrors, pageErrors } = appHandle
    const { dialog, trigger } = await openReport(page)

    const closeButton = dialog.getByRole('button', { name: 'レポートを閉じる' })
    const copyButton = dialog.getByRole('button', { name: 'SNSテキストをコピー' })
    const snsText = dialog.getByLabel('SNSシェアテキスト')

    // Initial focus lands on the close button
    await expect(closeButton).toBeFocused()

    // Tab / Shift+Tab stay inside the dialog: close -> copy -> SNS text -> close
    await page.keyboard.press('Tab')
    await expect(copyButton).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(snsText).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(snsText).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(copyButton).toBeFocused()

    // Esc closes the modal and focus returns to the trigger button
    await closeWithEscape(page, dialog)
    await expect(trigger).toBeFocused()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('closes on overlay click but not on clicks inside the dialog', async () => {
    const { page, consoleErrors, pageErrors } = appHandle
    const { dialog, trigger } = await openReport(page)

    // Clicking content inside the card keeps the dialog open
    await dialog.getByText('検出された撮影スタイル傾向').click()
    await expect(dialog).toBeVisible()

    // (5, 5) must be outside the card so that the click hits the overlay itself
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.x > 5 || dialogBox!.y > 5).toBe(true)
    await page.mouse.click(5, 5)
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    // Close button still works
    await trigger.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'レポートを閉じる' }).click()
    await expect(dialog).toBeHidden()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('fits the whole report including the SNS text in a 1280x840 viewport', async () => {
    const { page, consoleErrors, pageErrors } = appHandle
    const { dialog } = await openReport(page)

    const snsText = dialog.getByLabel('SNSシェアテキスト')
    await expect(snsText).toBeVisible()
    await expect(snsText).toContainText('#Sabaki')

    // SNS text bottom edge is inside the viewport and it has no internal scrollbar
    const preBox = await snsText.boundingBox()
    expect(preBox).not.toBeNull()
    expect(preBox!.y).toBeGreaterThanOrEqual(0)
    expect(preBox!.y + preBox!.height).toBeLessThanOrEqual(DEFAULT_VIEWPORT_HEIGHT)
    const preMetrics = await snsText.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }))
    expect(preMetrics.scrollHeight).toBeLessThanOrEqual(preMetrics.clientHeight)

    // The modal body does not need to scroll at the default window size
    const body = dialog.getByTestId('session-digest-body')
    const bodyMetrics = await body.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }))
    expect(bodyMetrics.scrollHeight).toBeLessThanOrEqual(bodyMetrics.clientHeight)

    await closeWithEscape(page, dialog)

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('keeps the close button on screen while the body scrolls in a short viewport', async () => {
    const { page, consoleErrors, pageErrors } = appHandle
    const { dialog } = await openReport(page)
    const closeButton = dialog.getByRole('button', { name: 'レポートを閉じる' })
    const body = dialog.getByTestId('session-digest-body')

    try {
      await page.setViewportSize({
        width: DEFAULT_VIEWPORT_WIDTH,
        height: COMPACT_VIEWPORT_HEIGHT
      })

      // The body becomes scrollable, then scroll it to the very bottom
      await expect
        .poll(() => body.evaluate((el) => el.scrollHeight > el.clientHeight))
        .toBe(true)
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect
        .poll(() => body.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0)

      const closeBox = await closeButton.boundingBox()
      expect(closeBox).not.toBeNull()
      expect(closeBox!.y).toBeGreaterThanOrEqual(0)
      expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(COMPACT_VIEWPORT_HEIGHT)
      await expect(closeButton).toBeInViewport()
    } finally {
      await page.setViewportSize({
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT
      })
    }

    await closeButton.click()
    await expect(dialog).toBeHidden()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
