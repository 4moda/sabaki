import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  getNormalizedPlatform
} from './electronApp'

export interface OverflowingContainerSample {
  tag: string
  hint: string
  scrollWidth: number
  clientWidth: number
  overflowPx: number
}

export interface LayoutDiagnostics {
  viewportWidth: number
  viewportHeight: number
  mainScrollWidth: number
  mainClientWidth: number
  mainScrollHeight: number
  mainClientHeight: number
  hasHorizontalOverflow: boolean
  overflowAmountPx: number
  clippedTextSamples: string[]
  overflowingContainers: OverflowingContainerSample[]
  interactiveElementCount: number
}

export interface CapturedScreenRecord {
  id: string
  title: string
  category: 'import' | 'dashboard' | 'history' | 'settings' | 'modal'
  description: string
  viewportImage: string
  fullImage: string | null
  ariaSnapshotFile: string
  capturedAt: string
  consoleErrorCount: number
  pageErrorCount: number
  layout: LayoutDiagnostics
}

export interface PlatformSnapshotManifest {
  platform: 'windows' | 'macos' | 'linux'
  osRelease: string
  arch: string
  electronVersion: string
  chromiumVersion: string
  nodeVersion: string
  commitSha: string
  refName: string
  generatedAt: string
  screens: CapturedScreenRecord[]
}

export class SnapshotCollector {
  public readonly platform: 'windows' | 'macos' | 'linux'
  public readonly outputDir: string
  private readonly ariaDir: string
  private readonly screens: CapturedScreenRecord[] = []

  constructor(baseDir: string = resolve(process.cwd(), 'e2e-snapshots')) {
    this.platform = getNormalizedPlatform()
    this.outputDir = join(baseDir, this.platform)
    this.ariaDir = join(this.outputDir, 'aria')
    mkdirSync(this.outputDir, { recursive: true })
    mkdirSync(this.ariaDir, { recursive: true })
  }

  public async capture(
    page: Page,
    options: {
      id: string
      title: string
      category: CapturedScreenRecord['category']
      description: string
      captureFullPage?: boolean
      consoleErrors: string[]
      pageErrors: string[]
    }
  ): Promise<CapturedScreenRecord> {
    const {
      id,
      title,
      category,
      description,
      captureFullPage = true,
      consoleErrors,
      pageErrors
    } = options

    // Re-apply fixed 1280x840 viewport via CDP so macOS/Windows runners never revert to 1024x768
    await page.setViewportSize({
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT
    })

    // Ensure main scroll container is at top before viewport capture and layout settles
    await page.evaluate(async () => {
      const main = document.querySelector('main')
      if (main) {
        main.scrollTop = 0
        main.scrollLeft = 0
      }
      if (document.fonts?.ready) {
        await document.fonts.ready
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    })

    // 1. Collect DOM layout diagnostics for AI and human UI review
    const layout = await page.evaluate<LayoutDiagnostics>(() => {
      const main = document.querySelector('main')
      const mainScrollWidth = main ? main.scrollWidth : document.documentElement.scrollWidth
      const mainClientWidth = main ? main.clientWidth : window.innerWidth
      const mainScrollHeight = main ? main.scrollHeight : document.documentElement.scrollHeight
      const mainClientHeight = main ? main.clientHeight : window.innerHeight
      const overflowAmountPx = Math.max(0, mainScrollWidth - mainClientWidth)

      const clippedTextSamples: string[] = []
      const candidates = document.querySelectorAll('h1, h2, h3, h4, button, label, th, td, span, p')
      for (const el of candidates) {
        const htmlEl = el as HTMLElement
        const style = window.getComputedStyle(htmlEl)
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.textOverflow === 'ellipsis' ||
          htmlEl.classList.contains('truncate')
        ) {
          continue
        }
        if (
          (style.overflowX === 'hidden' || style.overflow === 'hidden') &&
          htmlEl.clientWidth > 0 &&
          htmlEl.scrollWidth > htmlEl.clientWidth + 4
        ) {
          const text = (htmlEl.innerText || htmlEl.textContent || '').trim().slice(0, 60)
          if (text && clippedTextSamples.length < 8) {
            clippedTextSamples.push(text)
          }
        }
      }

      const overflowingContainers: OverflowingContainerSample[] = []
      const containers = document.querySelectorAll('main section, main div, main table')
      for (const el of containers) {
        const htmlEl = el as HTMLElement
        const style = window.getComputedStyle(htmlEl)
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          htmlEl.clientWidth < 120
        ) {
          continue
        }
        const isClippedOrScrollable =
          style.overflowX === 'auto' ||
          style.overflowX === 'scroll' ||
          style.overflowX === 'hidden'
        if (isClippedOrScrollable && htmlEl.scrollWidth > htmlEl.clientWidth + 8) {
          // Skip outer wrappers if a child already accounts for the same overflow
          const heading =
            htmlEl.querySelector('h3, h4')?.textContent?.trim() ||
            htmlEl.getAttribute('aria-label') ||
            (htmlEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48)
          if (
            heading &&
            !overflowingContainers.some((c) => c.hint === heading) &&
            overflowingContainers.length < 8
          ) {
            overflowingContainers.push({
              tag: htmlEl.tagName.toLowerCase(),
              hint: heading,
              scrollWidth: htmlEl.scrollWidth,
              clientWidth: htmlEl.clientWidth,
              overflowPx: htmlEl.scrollWidth - htmlEl.clientWidth
            })
          }
        }
      }

      const interactiveElementCount = document.querySelectorAll(
        'button, a[href], input, select, textarea, [role="switch"], [role="button"]'
      ).length

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        mainScrollWidth,
        mainClientWidth,
        mainScrollHeight,
        mainClientHeight,
        hasHorizontalOverflow: overflowAmountPx > 2,
        overflowAmountPx,
        clippedTextSamples,
        overflowingContainers,
        interactiveElementCount
      }
    })

    // 2. Capture exact desktop viewport screenshot with animations disabled for stable visual diffs
    const viewportImageName = `${id}.png`
    await page.screenshot({
      path: join(this.outputDir, viewportImageName),
      animations: 'disabled'
    })

    // 3. Capture full scrollable page via CDP captureBeyondViewport if the view scrolls vertically
    let fullImageName: string | null = null
    if (captureFullPage && layout.mainScrollHeight > layout.mainClientHeight + 16) {
      fullImageName = `${id}-full.png`
      await this.captureFullScrollableView(page, join(this.outputDir, fullImageName), layout.viewportWidth)
    }

    // 4. Capture ARIA accessibility snapshot (YAML) so AI sessions can inspect semantic structure
    const ariaSnapshotFile = `aria/${id}.yaml`
    let ariaYaml = ''
    try {
      ariaYaml = await page.locator('body').ariaSnapshot()
    } catch (err) {
      ariaYaml = `# Failed to capture ariaSnapshot: ${err instanceof Error ? err.message : String(err)}\n`
    }
    writeFileSync(join(this.outputDir, ariaSnapshotFile), `${ariaYaml.trim()}\n`, 'utf8')

    const record: CapturedScreenRecord = {
      id,
      title,
      category,
      description,
      viewportImage: viewportImageName,
      fullImage: fullImageName,
      ariaSnapshotFile,
      capturedAt: new Date().toISOString(),
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      layout
    }

    this.screens.push(record)
    return record
  }

  private async captureFullScrollableView(
    page: Page,
    outputPath: string,
    viewportWidth: number
  ): Promise<void> {
    const cdp = await page.context().newCDPSession(page)
    try {
      await page.addStyleTag({
        content: `
          html, body, #root, #root > div {
            width: ${viewportWidth}px !important;
            max-width: ${viewportWidth}px !important;
            height: auto !important;
            min-height: 100vh !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
          }
          #root > div > aside {
            height: auto !important;
            align-self: stretch !important;
          }
          main {
            min-width: 0 !important;
            height: auto !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
          }
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
          }
        `
      })

      const fullHeight = await page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        return Math.min(
          3200,
          Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
          )
        )
      })

      const result = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: viewportWidth,
          height: fullHeight,
          scale: 1
        }
      })

      writeFileSync(outputPath, Buffer.from(result.data, 'base64'))
    } finally {
      await page.evaluate(() => {
        const styleTags = document.querySelectorAll('style')
        const last = styleTags[styleTags.length - 1]
        if (last && last.textContent?.includes('min-height: 100vh !important')) {
          last.remove()
        }
      })
      await cdp.detach()
      await page.setViewportSize({
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT
      })
    }
  }

  public async writeManifest(electronApp: ElectronApplication): Promise<PlatformSnapshotManifest> {
    const runtimeVersions = await electronApp.evaluate(() => ({
      electron: process.versions.electron ?? 'unknown',
      chrome: process.versions.chrome ?? 'unknown',
      node: process.versions.node ?? 'unknown',
      arch: process.arch
    }))

    const { release } = await import('node:os')
    const manifest: PlatformSnapshotManifest = {
      platform: this.platform,
      osRelease: release(),
      arch: runtimeVersions.arch,
      electronVersion: runtimeVersions.electron,
      chromiumVersion: runtimeVersions.chrome,
      nodeVersion: runtimeVersions.node,
      commitSha: process.env['GITHUB_SHA'] || 'local',
      refName: process.env['GITHUB_REF_NAME'] || 'local',
      generatedAt: new Date().toISOString(),
      screens: this.screens
    }

    writeFileSync(
      join(this.outputDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    )
    return manifest
  }
}
