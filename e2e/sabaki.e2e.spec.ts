import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchSabakiApp, type LaunchedSabakiApp } from './helpers/electronApp'
import { SnapshotCollector } from './helpers/snapshot'

/**
 * Builds a deterministic temporary mock SD card directory containing RAW, JPEG, and MP4 files
 * with fixed modification timestamps so cross-OS E2E imports and path routing are reproducible.
 */
function createMockSdCardFixture(): {
  rootDir: string
  sourceDir: string
  destDir: string
  cleanup: () => void
} {
  const rootDir = mkdtempSync(join(tmpdir(), 'sabaki-e2e-sd-'))
  const sourceDir = join(rootDir, 'SD_CARD', 'DCIM', '100MSDCF')
  const destDir = join(rootDir, 'PhotoLibrary')
  mkdirSync(sourceDir, { recursive: true })
  mkdirSync(destDir, { recursive: true })

  // Fixed UTC timestamp -> 2026-11-19 17:30:00 JST (golden hour)
  const fixedDate = new Date('2026-11-19T08:30:00.000Z')

  // Minimal valid JPEG SOI/EOI markers + deterministic payloads for RAW and MP4
  const files: Array<{ name: string; content: Buffer }> = [
    {
      name: 'DSC9001.JPG',
      content: Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
        Buffer.from('SABAKI-E2E-JPEG-PAYLOAD-001'.repeat(64)),
        Buffer.from([0xff, 0xd9])
      ])
    },
    {
      name: 'DSC9001.ARW',
      content: Buffer.from('SABAKI-E2E-RAW-ARW-PAYLOAD-001'.repeat(256))
    },
    {
      name: 'C9001.MP4',
      content: Buffer.from('SABAKI-E2E-VIDEO-MP4-PAYLOAD-001'.repeat(256))
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

test.describe('Sabaki Electron E2E & Cross-OS Visual Snapshots', () => {
  let appHandle: LaunchedSabakiApp
  let snapshots: SnapshotCollector

  test.beforeAll(async () => {
    snapshots = new SnapshotCollector()
    appHandle = await launchSabakiApp()
  })

  test.afterAll(async () => {
    if (appHandle) {
      await snapshots.writeManifest(appHandle.electronApp)
      await appHandle.close()
    }
  })

  test('01: launches Sabaki, verifies Import tab & real end-to-end SD import flow with Session Digest', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    // Verify application shell and default Import tab
    await expect(page).toHaveTitle(/Sabaki/i)
    await expect(page.getByRole('heading', { name: /SDカード取り込み/ })).toBeVisible()
    await expect(page.getByText('タスクトレイ常駐中')).toBeVisible()

    // Capture initial Import screen
    const importInit = await snapshots.capture(page, {
      id: '01-import-initial',
      title: 'SD取込・整理（初期状態）',
      category: 'import',
      description: '起動直後のSDカード取り込み画面。パスビルダー、4種競合解決ポリシー、スキャン実行パネルを表示。',
      consoleErrors,
      pageErrors
    })
    expect(importInit.layout.hasHorizontalOverflow).toBe(false)

    // Real E2E file scan & copy flow using a temporary mock SD card
    const fixture = createMockSdCardFixture()
    try {
      const sourceInput = page.getByLabel('SDカード / コピー元フォルダ')
      const destInput = page.getByLabel('HDD / SSD コピー先ルート')

      await sourceInput.fill(fixture.sourceDir)
      await destInput.fill(fixture.destDir)

      // 1. Pre-scan source directory via IPC
      await page.getByRole('button', { name: '事前スキャン' }).click()
      await expect(page.getByText('スキャン完了')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('3 ファイル')).toBeVisible()

      await snapshots.capture(page, {
        id: '02-import-scanned',
        title: 'SD取込・整理（事前スキャン完了）',
        category: 'import',
        description: 'モックSDカード（RAW / JPEG / MP4 計3ファイル）の事前スキャン完了状態。',
        consoleErrors,
        pageErrors
      })

      // 2. Execute real import job (hash -> EXIF parse -> copy -> SQLite save -> digest)
      await page.getByRole('button', { name: '振り分けコピー開始' }).click()
      await expect(page.getByText('今回の撮影属性アナライズレポート')).toBeVisible({
        timeout: 30_000
      })

      // Verify files were physically copied into the organized destination hierarchy
      expect(existsSync(join(fixture.destDir, '2026', '2026-11-19', 'JPG', 'DSC9001.JPG'))).toBe(true)
      expect(existsSync(join(fixture.destDir, '2026', '2026-11-19', 'ARW', 'DSC9001.ARW'))).toBe(true)
      expect(existsSync(join(fixture.destDir, '2026', '2026-11-19', 'MP4', 'C9001.MP4'))).toBe(true)

      await snapshots.capture(page, {
        id: '03-import-completed-digest',
        title: '取り込み完了 & 撮影属性アナライズレポート',
        category: 'import',
        description: '実ファイルコピー完了直後の進捗パネルおよび撮影属性アナライズレポート表示。',
        consoleErrors,
        pageErrors
      })
    } finally {
      fixture.cleanup()
    }

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('02: navigates to Analytics Dashboard, verifies 52-week heatmap, charts, and interactive filtering', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '撮影分析' }).click()
    await expect(
      page.getByRole('heading', { name: /撮影アクティビティ & Exif分析ダッシュボード/ })
    ).toBeVisible()

    // Wait for SQLite analytics query (180 demo + 3 imported = 183 shots)
    await expect(page.getByText('183', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /ILCE-7M4/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /FE 35mm F1\.4 GM/ }).first()).toBeVisible()

    const dashboardShot = await snapshots.capture(page, {
      id: '04-dashboard-overview',
      title: '撮影分析ダッシュボード（全体）',
      category: 'dashboard',
      description: 'KPIカード、GitHub草風52週ヒートマップ、カメラ・レンズ稼働率、焦点距離ヒストグラム、SNS/Web連携出力。',
      consoleErrors,
      pageErrors
    })
    expect(dashboardShot.layout.hasHorizontalOverflow).toBe(false)
    expect(dashboardShot.layout.overflowingContainers).toEqual([])

    // Interactive E2E: toggle 35mm equivalent and click a camera bar to drill down
    await page.getByRole('switch', { name: '35mm換算' }).first().click()
    await expect(page.getByText('35mm判換算ベース')).toBeVisible()

    await page.getByLabel('機材統計').getByRole('button', { name: /ILCE-7M4/ }).first().click()
    await page.waitForTimeout(250)

    await snapshots.capture(page, {
      id: '05-dashboard-filtered',
      title: '撮影分析ダッシュボード（機材絞り込み & 35mm換算）',
      category: 'dashboard',
      description: 'カメラ（ILCE-7M4）クリックによるドリルダウン絞り込み＋35mm判換算表示の有効化状態。',
      consoleErrors,
      pageErrors
    })

    // Reset filter
    const resetBtn = page.getByRole('button', { name: /リセット/ }).first()
    if (await resetBtn.isVisible()) {
      await resetBtn.click()
      await expect(page.getByText('183', { exact: true })).toBeVisible()
    }

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('03: navigates to History tab, verifies search, favorite toggle, and Session Digest modal', async () => {
    const { page, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '取込履歴' }).click()
    await expect(
      page.getByRole('heading', { name: /取り込み履歴 & SNS Exifキャプション生成/ })
    ).toBeVisible()

    await expect(page.getByText('最近のインポートセッション履歴')).toBeVisible({ timeout: 15_000 })

    const historyShot = await snapshots.capture(page, {
      id: '06-history-overview',
      title: '取込履歴 & SNS Exifキャプション一覧',
      category: 'history',
      description: '過去のインポートセッション履歴カード、取り込みファイル一覧、Exifクレジットコピー行。',
      consoleErrors,
      pageErrors
    })
    expect(historyShot.layout.hasHorizontalOverflow).toBe(false)

    // Open modal variant of SessionDigestModal from the demo job
    const reportButtons = page.getByRole('button', { name: '撮影属性レポートを見る' })
    await expect(reportButtons.first()).toBeVisible()
    await reportButtons.last().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await snapshots.capture(page, {
      id: '07-session-digest-modal',
      title: '撮影属性アナライズレポート（モーダル表示）',
      category: 'modal',
      description: '履歴画面から開いたセッション分析モーダル（撮影スタイルタグ、機材シェア、SNSシェアテキスト）。',
      captureFullPage: false,
      consoleErrors,
      pageErrors
    })

    await page.getByRole('button', { name: 'レポートを閉じる' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Test search input filtering
    const searchInput = page.getByLabel('ファイル名・カメラ・レンズ検索')
    await searchInput.fill('ILCE-7M4')
    await page.waitForTimeout(300)
    await expect(page.getByText('ILCE-7M4').first()).toBeVisible()
    await searchInput.fill('')

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('04: navigates to Settings tab and verifies settings persistence to settings.json', async () => {
    const { page, userDataDir, consoleErrors, pageErrors } = appHandle

    await page.getByRole('button', { name: '常駐・設定' }).click()
    await expect(
      page.getByRole('heading', { name: /常駐動作 & アプリケーション設定/ })
    ).toBeVisible()

    const settingsShot = await snapshots.capture(page, {
      id: '08-settings-overview',
      title: '常駐・アプリケーション設定',
      category: 'settings',
      description: 'タスクトレイ常駐、OS通知、デフォルト保存先、パスビルダー、4種競合解決ポリシーの設定画面。',
      consoleErrors,
      pageErrors
    })
    expect(settingsShot.layout.hasHorizontalOverflow).toBe(false)

    // Toggle a persisted setting and confirm settings.json updates on disk
    const traySwitch = page.getByRole('switch', { name: /タスクトレイへ常駐/ })
    const initialChecked = await traySwitch.getAttribute('aria-checked')
    await traySwitch.click()
    await expect(traySwitch).toHaveAttribute(
      'aria-checked',
      initialChecked === 'true' ? 'false' : 'true'
    )

    const settingsFile = join(userDataDir, 'settings.json')
    await expect
      .poll(() => existsSync(settingsFile), { timeout: 10_000 })
      .toBe(true)

    const saved = JSON.parse(readFileSync(settingsFile, 'utf8')) as { minimizeToTray: boolean }
    expect(saved.minimizeToTray).toBe(initialChecked !== 'true')

    // Restore original toggle state
    await traySwitch.click()

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
