import { expect, test, type ElectronApplication } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'

const RECENT_FILES_CHANNEL = 'sabaki:get-recent-files'
const RECENT_JOBS_CHANNEL = 'sabaki:get-recent-jobs'

interface IpcCallLog {
  [channel: string]: unknown[][]
}

/**
 * `window.sabaki` is frozen by contextBridge, so IPC calls are counted on the main side by
 * re-registering the existing `ipcMain.handle` handlers with a recording wrapper.
 * NOTE: `ipcMain._invokeHandlers` is an Electron internal API. Revisit this helper when
 * upgrading Electron. The returned `stop` restores the original handlers.
 */
async function startIpcCallRecording(
  electronApp: ElectronApplication,
  channels: string[]
): Promise<{ stop: () => Promise<void> }> {
  await electronApp.evaluate(({ ipcMain }, targetChannels) => {
    const store = globalThis as typeof globalThis & {
      __sabakiIpcCalls?: IpcCallLog
      __sabakiIpcOriginals?: Map<string, (...args: unknown[]) => unknown>
    }
    const handlers = (
      ipcMain as unknown as {
        _invokeHandlers: Map<string, (...args: unknown[]) => unknown>
      }
    )._invokeHandlers
    store.__sabakiIpcCalls = {}
    store.__sabakiIpcOriginals = new Map()
    for (const channel of targetChannels) {
      const original = handlers.get(channel)
      if (!original) throw new Error(`No ipcMain handler registered for ${channel}`)
      store.__sabakiIpcOriginals.set(channel, original)
      store.__sabakiIpcCalls[channel] = []
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (event, ...args) => {
        store.__sabakiIpcCalls?.[channel]?.push(args)
        return original(event, ...args)
      })
    }
  }, channels)

  return {
    stop: async () => {
      await electronApp.evaluate(({ ipcMain }) => {
        const store = globalThis as typeof globalThis & {
          __sabakiIpcCalls?: IpcCallLog
          __sabakiIpcOriginals?: Map<string, (...args: unknown[]) => unknown>
        }
        for (const [channel, original] of store.__sabakiIpcOriginals ?? []) {
          ipcMain.removeHandler(channel)
          ipcMain.handle(channel, (event, ...args) => original(event, ...args))
        }
        delete store.__sabakiIpcOriginals
        delete store.__sabakiIpcCalls
      })
    }
  }
}

async function readIpcCalls(electronApp: ElectronApplication): Promise<IpcCallLog> {
  return electronApp.evaluate(() => {
    const store = globalThis as typeof globalThis & { __sabakiIpcCalls?: IpcCallLog }
    return store.__sabakiIpcCalls ?? {}
  })
}

test.describe('Sabaki History UX, Pagination & Conflict Policy A11y', () => {
  let appHandle: LaunchedSabakiApp

  test.beforeAll(async () => {
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await appHandle.close()
    }
  })

  test('01: paginates beyond 100 items, debounces/clears search, and removes unfavorited items under favorite filter', async () => {
    const { page, electronApp, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '取込履歴' }).click()
    await expect(
      page.getByRole('heading', { name: /取り込み履歴 & SNS Exifキャプション生成/ })
    ).toBeVisible()

    // 1. Pagination loads first page and supports loading more beyond 100 items (180 demo items total)
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

    // 2. Search input debounces queries and provides a clear button
    const searchInput = page.getByLabel('ファイル名・カメラ・レンズ検索')
    const clearBtn = page.getByRole('button', { name: '検索をクリア' })
    await expect(clearBtn).toBeHidden()

    const ipcRecording = await startIpcCallRecording(electronApp, [
      RECENT_FILES_CHANNEL,
      RECENT_JOBS_CHANNEL
    ])

    // Rapidly replace query before 250ms debounce settles -> no IPC for the intermediate query
    await searchInput.fill('ILCE-7M4')
    await expect(clearBtn).toBeVisible()
    await page.waitForTimeout(80)
    expect((await readIpcCalls(electronApp))[RECENT_FILES_CHANNEL]).toHaveLength(0)
    await searchInput.fill('EOS R5')

    // Debounced search filters down to EOS R5 entries
    await expect(mediaSection.getByText('ILCE-7M4')).toHaveCount(0)
    await expect(mediaSection.getByText('EOS R5').first()).toBeVisible()

    // Only the final query reached getRecentFiles, and job history was not refetched
    const searchCalls = await readIpcCalls(electronApp)
    expect(searchCalls[RECENT_FILES_CHANNEL]).toHaveLength(1)
    expect(searchCalls[RECENT_FILES_CHANNEL][0][0]).toMatchObject({ search: 'EOS R5' })
    expect(searchCalls[RECENT_JOBS_CHANNEL]).toHaveLength(0)
    await ipcRecording.stop()
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

    // 3. Unfavoriting when "お気に入り（★）のみ表示" is ON immediately removes the item
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

    // Unfavoriting a second item keeps the first one removed (no stale-list overwrite)
    await mediaItems
      .first()
      .getByRole('button', { name: /のお気に入りを解除$/ })
      .click()
    await expect(mediaItems).toHaveCount(16)
    await expect(mediaSection.getByText('16 件表示', { exact: true })).toBeVisible()
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

  test('02: supports WAI-ARIA arrow-key navigation with roving tabindex in ConflictPolicySelector', async () => {
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
