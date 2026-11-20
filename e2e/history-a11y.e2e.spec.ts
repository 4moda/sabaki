import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

test.describe('Sabaki History UX, Pagination, Badges & Conflict Policy A11y', () => {
  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('01: localizes job status badges, paginates beyond 100 items, debounces/clears search, and removes unfavorited items under favorite filter', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '取込履歴' }).click()
    await expect(
      page.getByRole('heading', { name: /取り込み履歴 & SNS Exifキャプション生成/ })
    ).toBeVisible()

    // 1. Job status badge is localized to Japanese ('完了') instead of raw 'completed'
    const jobsSection = page
      .locator('section')
      .filter({ hasText: '最近のインポートセッション履歴' })
    await expect(jobsSection).toBeVisible({ timeout: 15_000 })
    await expect(jobsSection.getByText('完了', { exact: true }).first()).toBeVisible()
    await expect(jobsSection.getByText('completed', { exact: true })).toHaveCount(0)

    // 2. Pagination loads first page and supports loading more beyond 100 items (180 demo items total)
    const mediaSection = page
      .locator('section')
      .filter({ hasText: '取り込み済みメディア & SNS Exifキャプション一覧' })
    const mediaItems = mediaSection.locator('ul > li')
    const loadMoreBtn = mediaSection.getByRole('button', { name: 'さらに読み込む' })

    await expect(mediaSection.getByText('50 件表示（さらにあり）', { exact: true })).toBeVisible()
    await expect(mediaItems).toHaveCount(50)
    await expect(loadMoreBtn).toBeVisible()

    await loadMoreBtn.click()
    await expect(mediaSection.getByText('100 件表示（さらにあり）', { exact: true })).toBeVisible()
    await expect(mediaItems).toHaveCount(100)

    await loadMoreBtn.click()
    await expect(mediaSection.getByText('150 件表示（さらにあり）', { exact: true })).toBeVisible()
    await expect(mediaItems).toHaveCount(150)

    await loadMoreBtn.click()
    await expect(mediaSection.getByText('180 件表示', { exact: true })).toBeVisible()
    await expect(mediaItems).toHaveCount(180)
    await expect(loadMoreBtn).toBeHidden()

    // 3. Search input debounces queries and provides a clear button
    const searchInput = page.getByLabel('ファイル名・カメラ・レンズ検索')
    const clearBtn = page.getByRole('button', { name: '検索をクリア' })
    await expect(clearBtn).toBeHidden()

    // Rapidly replace query before 250ms debounce settles -> only final query ('EOS R5') applies
    await searchInput.fill('ILCE-7M4')
    await expect(clearBtn).toBeVisible()
    await page.waitForTimeout(80)
    await searchInput.fill('EOS R5')

    // Debounced search filters down to EOS R5 entries
    await expect(mediaSection.getByText('ILCE-7M4')).toHaveCount(0)
    await expect(mediaSection.getByText('EOS R5').first()).toBeVisible()
    const filteredCount = await mediaItems.count()
    expect(filteredCount).toBeGreaterThan(0)
    expect(filteredCount).toBeLessThan(50)
    await expect(
      mediaSection.getByText(`${filteredCount.toLocaleString()} 件表示`, { exact: true })
    ).toBeVisible()

    // Clicking clear immediately resets search, restores focus, and reloads first page
    await clearBtn.click()
    await expect(searchInput).toHaveValue('')
    await expect(clearBtn).toBeHidden()
    await expect(searchInput).toBeFocused()
    await expect(mediaSection.getByText('50 件表示（さらにあり）', { exact: true })).toBeVisible()
    await expect(mediaItems).toHaveCount(50)

    // 4. Unfavoriting when "お気に入り（★）のみ表示" is ON immediately removes the item
    const favSwitch = page.getByRole('switch', { name: 'お気に入り（★）のみ表示' })
    await favSwitch.click()
    await expect(favSwitch).toHaveAttribute('aria-checked', 'true')
    await expect(mediaSection.getByText('18 件表示', { exact: true })).toBeVisible()
    await expect(mediaItems).toHaveCount(18)

    const firstFavBtn = mediaItems
      .first()
      .getByRole('button', { name: /のお気に入りを解除$/ })
    const firstFavLabel = await firstFavBtn.getAttribute('aria-label')
    expect(firstFavLabel).toBeTruthy()

    await firstFavBtn.click()
    await expect(mediaItems).toHaveCount(17)
    await expect(mediaSection.getByText('17 件表示', { exact: true })).toBeVisible()
    await expect(
      mediaSection.getByRole('button', { name: firstFavLabel! })
    ).toHaveCount(0)

    // Turn off favorite-only filter and verify full list restores
    await favSwitch.click()
    await expect(favSwitch).toHaveAttribute('aria-checked', 'false')
    await expect(mediaSection.getByText('50 件表示（さらにあり）', { exact: true })).toBeVisible()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('02: supports WAI-ARIA arrow-key navigation with roving tabindex and tidy first-mode subtitle in ConflictPolicySelector', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '常駐・設定' }).click()
    await expect(
      page.getByRole('heading', { name: /常駐動作 & アプリケーション設定/ })
    ).toBeVisible()

    const radiogroup = page.getByRole('radiogroup', {
      name: '同名ファイル競合時の処理モード'
    })
    await expect(radiogroup).toBeVisible()

    const radios = radiogroup.getByRole('radio')
    await expect(radios).toHaveCount(4)

    // Verify first mode title/subtitle stay cleanly separated on single lines
    const firstSubtitle = radios
      .nth(0)
      .getByText('同一ならスキップ／別物なら連番リネーム', { exact: true })
    await expect(firstSubtitle).toBeVisible()
    const subtitleBox = await firstSubtitle.boundingBox()
    expect(subtitleBox).not.toBeNull()
    expect(subtitleBox!.height).toBeLessThan(24)

    // Initial roving tabindex state: first item selected (tabindex=0), others -1
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(0)).toHaveAttribute('tabindex', '0')
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'false')
    await expect(radios.nth(1)).toHaveAttribute('tabindex', '-1')
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'false')
    await expect(radios.nth(2)).toHaveAttribute('tabindex', '-1')
    await expect(radios.nth(3)).toHaveAttribute('aria-checked', 'false')
    await expect(radios.nth(3)).toHaveAttribute('tabindex', '-1')

    // ArrowDown / ArrowRight advance selection & focus, wrapping at end
    await radios.nth(0).focus()
    await page.keyboard.press('ArrowDown')
    await expect(radios.nth(1)).toBeFocused()
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(1)).toHaveAttribute('tabindex', '0')
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'false')
    await expect(radios.nth(0)).toHaveAttribute('tabindex', '-1')

    await page.keyboard.press('ArrowRight')
    await expect(radios.nth(2)).toBeFocused()
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(2)).toHaveAttribute('tabindex', '0')

    await page.keyboard.press('ArrowDown')
    await expect(radios.nth(3)).toBeFocused()
    await expect(radios.nth(3)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(3)).toHaveAttribute('tabindex', '0')

    await page.keyboard.press('ArrowDown')
    await expect(radios.nth(0)).toBeFocused()
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(0)).toHaveAttribute('tabindex', '0')

    // ArrowUp / ArrowLeft move backward & wrap from first to last
    await page.keyboard.press('ArrowUp')
    await expect(radios.nth(3)).toBeFocused()
    await expect(radios.nth(3)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(3)).toHaveAttribute('tabindex', '0')

    await page.keyboard.press('ArrowLeft')
    await expect(radios.nth(2)).toBeFocused()
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true')
    await expect(radios.nth(2)).toHaveAttribute('tabindex', '0')

    // Restore initial selection
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(radios.nth(0)).toBeFocused()
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true')

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
