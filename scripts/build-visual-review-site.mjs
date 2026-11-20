#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = 'true'
    } else {
      args[key] = next
      i += 1
    }
  }
  return args
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

const PLATFORM_ORDER = ['windows', 'macos', 'linux']
const PLATFORM_LABELS = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux'
}

function hasAnyPlatformManifest(dir) {
  if (!dir || !existsSync(dir)) return false
  return PLATFORM_ORDER.some((p) => existsSync(join(dir, p, 'manifest.json')))
}

function buildUnifiedManifest({
  snapshotsDir,
  targetDir,
  target,
  prNumber,
  prTitle,
  commitSha,
  repo,
  runUrl,
  runId,
  hasBaseline
}) {
  const availablePlatforms = []
  const platformManifests = {}

  for (const platform of PLATFORM_ORDER) {
    const srcPlatformDir = join(snapshotsDir, platform)
    const manifestPath = join(srcPlatformDir, 'manifest.json')
    if (!existsSync(manifestPath)) continue

    const destPlatformDir = join(targetDir, platform)
    rmSync(destPlatformDir, { recursive: true, force: true })
    mkdirSync(destPlatformDir, { recursive: true })
    cpSync(srcPlatformDir, destPlatformDir, { recursive: true })

    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
    availablePlatforms.push(platform)
    platformManifests[platform] = parsed
  }

  if (availablePlatforms.length === 0) {
    throw new Error(`No platform manifests found under ${snapshotsDir}`)
  }

  const screenMap = new Map()
  for (const platform of availablePlatforms) {
    const pm = platformManifests[platform]
    for (const s of pm.screens || []) {
      if (!screenMap.has(s.id)) {
        screenMap.set(s.id, {
          id: s.id,
          title: s.title,
          category: s.category,
          description: s.description,
          platforms: {}
        })
      }
      const entry = screenMap.get(s.id)
      entry.platforms[platform] = {
        viewportImage: `${platform}/${s.viewportImage}`,
        fullImage: s.fullImage ? `${platform}/${s.fullImage}` : null,
        ariaSnapshotFile: `${platform}/${s.ariaSnapshotFile}`,
        capturedAt: s.capturedAt,
        consoleErrorCount: s.consoleErrorCount ?? 0,
        pageErrorCount: s.pageErrorCount ?? 0,
        layout: s.layout
      }
    }
  }

  const screens = Array.from(screenMap.values())

  let totalConsoleErrors = 0
  let totalPageErrors = 0
  let horizontalOverflowCount = 0
  let innerOverflowWarningCount = 0

  for (const screen of screens) {
    for (const platform of availablePlatforms) {
      const p = screen.platforms[platform]
      if (!p) continue
      totalConsoleErrors += p.consoleErrorCount
      totalPageErrors += p.pageErrorCount
      if (p.layout?.hasHorizontalOverflow) horizontalOverflowCount += 1
      if ((p.layout?.overflowingContainers?.length ?? 0) > 0) {
        innerOverflowWarningCount += 1
      }
    }
  }

  const manifest = {
    schemaVersion: 1,
    distribution: 'github-actions-artifact',
    target,
    isBaseline: target === 'main',
    hasBaseline: Boolean(hasBaseline),
    prNumber: prNumber ? Number(prNumber) : null,
    prTitle: prTitle || null,
    commitSha: commitSha || 'local',
    shortSha: (commitSha || 'local').slice(0, 7),
    repo,
    runId: runId || null,
    runUrl: runUrl || null,
    generatedAt: new Date().toISOString(),
    platforms: availablePlatforms,
    platformInfo: Object.fromEntries(
      availablePlatforms.map((p) => {
        const pm = platformManifests[p]
        return [
          p,
          {
            label: PLATFORM_LABELS[p] || p,
            osRelease: pm.osRelease,
            arch: pm.arch,
            electronVersion: pm.electronVersion,
            chromiumVersion: pm.chromiumVersion,
            nodeVersion: pm.nodeVersion
          }
        ]
      })
    ),
    summary: {
      screenCount: screens.length,
      platformCount: availablePlatforms.length,
      totalConsoleErrors,
      totalPageErrors,
      horizontalOverflowCount,
      innerOverflowWarningCount
    },
    screens
  }

  writeFileSync(
    join(targetDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  )

  return manifest
}

function renderTargetReviewHtml(manifest, baselineManifest) {
  const title = manifest.prNumber
    ? `Sabaki Visual Review — PR #${manifest.prNumber}`
    : `Sabaki Visual Review — ${manifest.target}`

  const safeEmbeddedManifest = JSON.stringify(manifest).replace(/</g, '\\u003c')
  const safeEmbeddedBaseline = JSON.stringify(baselineManifest ?? null).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #020617;
      --panel: #0f172a;
      --panel-2: #111c33;
      --border: #1e293b;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #10b981;
      --accent-soft: rgba(16, 185, 129, 0.14);
      --amber: #f59e0b;
      --rose: #f43f5e;
      --sky: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    header {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(2, 6, 23, 0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
      padding: 12px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
    }
    .badge.emerald { border-color: rgba(16,185,129,.45); background: var(--accent-soft); color: #6ee7b7; }
    .badge.amber { border-color: rgba(245,158,11,.45); background: rgba(245,158,11,.14); color: #fcd34d; }
    .badge.rose { border-color: rgba(244,63,94,.45); background: rgba(244,63,94,.14); color: #fda4af; }
    .badge.sky { border-color: rgba(56,189,248,.45); background: rgba(56,189,248,.14); color: #7dd3fc; }
    .header-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    button, select {
      font: inherit;
      color: var(--text);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    button:hover, select:hover { border-color: #334155; background: var(--panel-2); }
    button.active {
      border-color: rgba(16,185,129,.6);
      background: var(--accent-soft);
      color: #6ee7b7;
      font-weight: 600;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #022c22;
      font-weight: 700;
    }
    button.primary:hover { background: #34d399; }
    .layout {
      display: grid;
      grid-template-columns: 290px minmax(0, 1fr);
      min-height: calc(100vh - 61px);
    }
    @media (max-width: 960px) {
      .layout { grid-template-columns: 1fr; }
      aside { border-right: none; border-bottom: 1px solid var(--border); }
    }
    aside {
      border-right: 1px solid var(--border);
      background: #080f20;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .aside-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--muted);
      margin: 4px 2px;
      display: flex;
      justify-content: space-between;
    }
    .screen-list { display: flex; flex-direction: column; gap: 6px; }
    .screen-item {
      text-align: left;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--panel);
      border: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .screen-item.active {
      border-color: rgba(16,185,129,.7);
      background: rgba(16,185,129,.12);
    }
    .screen-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
    }
    .screen-item-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: var(--muted);
    }
    main {
      padding: 18px 22px 40px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--panel);
    }
    .btn-group { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .screen-header h2 { margin: 0; font-size: 18px; }
    .screen-header p { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
    .stage {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: #050a18;
      padding: 16px;
      overflow: auto;
    }
    .side-by-side {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .os-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      overflow: hidden;
    }
    .os-card-head {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--muted);
    }
    .os-card-head strong { color: var(--text); font-size: 13px; }
    .os-card img { display: block; width: 100%; height: auto; background: #020617; }
    .zoom-100 .os-card img,
    .zoom-100 .compare-wrap img,
    .zoom-100 .compare-wrap canvas { width: auto; max-width: none; }
    .compare-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--muted);
    }
    .compare-wrap {
      position: relative;
      display: inline-block;
      max-width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: #020617;
      user-select: none;
    }
    .compare-wrap img { display: block; max-width: 100%; height: auto; }
    .slider-overlay { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .slider-overlay img { width: 100%; height: 100%; object-fit: cover; object-position: left top; }
    .slider-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--accent);
      box-shadow: 0 0 12px rgba(16,185,129,.8);
      pointer-events: none;
    }
    .onion-top { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: left top; }
    .notice-box {
      padding: 20px;
      border-radius: 10px;
      border: 1px dashed #334155;
      color: var(--muted);
      font-size: 13px;
      text-align: center;
    }
    .diag-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 12px;
    }
    .diag-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      padding: 14px;
      font-size: 12px;
    }
    .diag-card h3 {
      margin: 0 0 10px;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kv {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 4px 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
    }
    .kv dt { color: var(--muted); }
    .kv dd { margin: 0; word-break: break-word; }
    pre.aria-box {
      margin: 8px 0 0;
      padding: 12px;
      max-height: 360px;
      overflow: auto;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #020617;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: #cbd5e1;
      white-space: pre-wrap;
    }
    details summary { cursor: pointer; font-weight: 600; font-size: 13px; padding: 4px 0; }
    .toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      padding: 10px 16px;
      border-radius: 10px;
      background: #064e3b;
      border: 1px solid var(--accent);
      color: #ecfdf5;
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity .2s, transform .2s;
      pointer-events: none;
      z-index: 100;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <a href="../" class="badge">← 一覧</a>
      <strong style="font-size:15px;">Sabaki Local Visual Review</strong>
      <span class="badge emerald" id="targetBadge"></span>
      <span class="badge" id="shaBadge"></span>
      <span class="badge sky">Private Local Viewer</span>
      <span id="prTitleText" style="font-size:13px;color:var(--muted);"></span>
    </div>
    <div class="header-actions">
      <a id="runLink" class="badge sky" target="_blank" rel="noreferrer" style="display:none;">GitHub Actions Run ↗</a>
      <a href="./manifest.json" class="badge" target="_blank" rel="noreferrer">manifest.json ↗</a>
      <button type="button" class="primary" id="copyAiBtn">AI レビュー指示をコピー</button>
    </div>
  </header>

  <div class="layout">
    <aside>
      <div class="aside-title">
        <span>画面一覧 (<span id="screenCount">0</span>)</span>
        <span>←/→ 切替</span>
      </div>
      <div class="screen-list" id="screenList"></div>
    </aside>

    <main>
      <div class="screen-header">
        <h2 id="screenTitle">Loading...</h2>
        <p id="screenDesc"></p>
      </div>

      <div class="toolbar">
        <div class="btn-group" id="modeButtons">
          <button type="button" data-mode="os-compare" class="active">OS 並置比較 (Win / Mac)</button>
          <button type="button" data-mode="slider">差分スライダー (vs main)</button>
          <button type="button" data-mode="onion">オニオンスキン (vs main)</button>
          <button type="button" data-mode="pixel-diff">ピクセル差分 (vs main)</button>
        </div>
        <div class="btn-group">
          <select id="osSelect" aria-label="比較対象OS" style="display:none;"></select>
          <button type="button" id="shotKindViewport" class="active">ウィンドウ (1280×840)</button>
          <button type="button" id="shotKindFull">フルページ全体</button>
          <button type="button" id="zoomToggle">原寸 (100%)</button>
        </div>
      </div>

      <section class="stage" id="stage"></section>

      <section class="diag-grid" id="diagnosticsGrid"></section>

      <section class="diag-card">
        <details id="ariaDetails">
          <summary>ARIA アクセシビリティツリー（AI 構造レビュー用）</summary>
          <div class="btn-group" style="margin-top:8px;" id="ariaPlatformTabs"></div>
          <pre class="aria-box" id="ariaContent">展開すると ARIA スナップショットを読み込みます。</pre>
        </details>
      </section>
    </main>
  </div>

  <div class="toast" id="toast">コピーしました</div>

  <script>
    const MANIFEST = ${safeEmbeddedManifest};
    const EMBEDDED_BASELINE = ${safeEmbeddedBaseline};
    const state = {
      screenIndex: 0,
      mode: 'os-compare',
      shotKind: 'viewport',
      zoom100: false,
      selectedOs: MANIFEST.platforms[0] || 'windows',
      sliderPct: 50,
      onionOpacity: 50,
      baselineManifest: EMBEDDED_BASELINE,
      ariaOs: MANIFEST.platforms[0] || 'windows',
      ariaCache: new Map()
    };

    const $ = (id) => document.getElementById(id);

    function showToast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2200);
    }

    function escapeText(v) {
      return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getImagePath(screen, platform) {
      const entry = screen.platforms[platform];
      if (!entry) return null;
      if (state.shotKind === 'full' && entry.fullImage) return entry.fullImage;
      return entry.viewportImage;
    }

    function getBaselineImagePath(screenId, platform) {
      if (!state.baselineManifest) return null;
      const baseScreen = (state.baselineManifest.screens || []).find((s) => s.id === screenId);
      if (!baseScreen || !baseScreen.platforms || !baseScreen.platforms[platform]) return null;
      const entry = baseScreen.platforms[platform];
      const rel = (state.shotKind === 'full' && entry.fullImage) ? entry.fullImage : entry.viewportImage;
      return '../main/' + rel;
    }

    function screenStatusBadge(screen) {
      let errs = 0;
      let warns = 0;
      for (const p of MANIFEST.platforms) {
        const d = screen.platforms[p];
        if (!d) continue;
        errs += (d.consoleErrorCount || 0) + (d.pageErrorCount || 0);
        if (d.layout?.hasHorizontalOverflow) warns += 1;
        if ((d.layout?.overflowingContainers?.length || 0) > 0) warns += 1;
      }
      if (errs > 0) return '<span class="badge rose">ERR ' + errs + '</span>';
      if (warns > 0) return '<span class="badge amber">UI注意</span>';
      return '<span class="badge emerald">OK</span>';
    }

    function renderSidebar() {
      $('screenCount').textContent = String(MANIFEST.screens.length);
      const list = $('screenList');
      list.innerHTML = '';
      MANIFEST.screens.forEach((screen, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'screen-item' + (idx === state.screenIndex ? ' active' : '');
        btn.innerHTML =
          '<div class="screen-item-top"><span>' + escapeText(screen.title) + '</span>' + screenStatusBadge(screen) + '</div>' +
          '<div class="screen-item-id">' + escapeText(screen.id) + '</div>';
        btn.addEventListener('click', () => {
          state.screenIndex = idx;
          renderAll();
        });
        list.appendChild(btn);
      });
    }

    function renderStage() {
      const screen = MANIFEST.screens[state.screenIndex];
      const stage = $('stage');
      stage.className = 'stage' + (state.zoom100 ? ' zoom-100' : '');
      stage.innerHTML = '';

      if (!screen) {
        stage.innerHTML = '<div class="notice-box">スクリーンショットがありません。</div>';
        return;
      }

      const hasAnyFull = MANIFEST.platforms.some((p) => Boolean(screen.platforms[p]?.fullImage));
      $('shotKindFull').disabled = !hasAnyFull;
      if (!hasAnyFull && state.shotKind === 'full') {
        state.shotKind = 'viewport';
        $('shotKindViewport').classList.add('active');
        $('shotKindFull').classList.remove('active');
      }

      $('osSelect').style.display = state.mode === 'os-compare' ? 'none' : 'inline-block';

      if (state.mode === 'os-compare') {
        const grid = document.createElement('div');
        grid.className = 'side-by-side';
        for (const platform of MANIFEST.platforms) {
          const imgPath = getImagePath(screen, platform);
          const info = MANIFEST.platformInfo[platform] || { label: platform };
          const card = document.createElement('div');
          card.className = 'os-card';
          if (imgPath) {
            card.innerHTML =
              '<div class="os-card-head"><strong>' + escapeText(info.label) + ' (' + escapeText(info.arch || '') + ')</strong>' +
              '<span>Electron ' + escapeText(info.electronVersion || '') + ' · <a href="./' + encodeURI(imgPath) + '" target="_blank" rel="noreferrer">PNGを開く ↗</a></span></div>' +
              '<img src="./' + encodeURI(imgPath) + '" alt="' + escapeText(screen.title + ' - ' + info.label) + '" />';
          } else {
            card.innerHTML = '<div class="notice-box">' + escapeText(info.label) + ' の画像はありません</div>';
          }
          grid.appendChild(card);
        }
        stage.appendChild(grid);
        return;
      }

      const currentImg = getImagePath(screen, state.selectedOs);
      const baseImg = MANIFEST.isBaseline ? null : getBaselineImagePath(screen.id, state.selectedOs);

      if (!currentImg) {
        stage.innerHTML = '<div class="notice-box">選択中の OS の画像が見つかりません。</div>';
        return;
      }
      if (!baseImg) {
        stage.innerHTML =
          '<div class="notice-box">' +
          (MANIFEST.isBaseline
            ? '現在は <strong>main ベースライン</strong> を表示しています。PR ビルドの Artifact には main との比較が自動で同梱されます。'
            : 'この Artifact には <code>main</code> ベースラインが含まれていません（main ブランチの CI 実行後の PR から自動比較されます）。') +
          '</div>';
        return;
      }

      if (state.mode === 'slider') {
        const controls = document.createElement('div');
        controls.className = 'compare-controls';
        controls.innerHTML =
          '<span class="badge sky">左: main (Before)</span>' +
          '<input type="range" min="0" max="100" value="' + state.sliderPct + '" id="diffRange" style="width:260px;" />' +
          '<span class="badge emerald">右: PR (After)</span>' +
          '<span id="sliderPctLabel">' + state.sliderPct + '%</span>';
        stage.appendChild(controls);

        const wrap = document.createElement('div');
        wrap.className = 'compare-wrap';
        wrap.innerHTML =
          '<img src="./' + encodeURI(currentImg) + '" alt="PR After" />' +
          '<div class="slider-overlay" id="sliderOverlay" style="clip-path: inset(0 ' + (100 - state.sliderPct) + '% 0 0);">' +
            '<img src="' + encodeURI(baseImg) + '" alt="main Before" />' +
          '</div>' +
          '<div class="slider-line" id="sliderLine" style="left:' + state.sliderPct + '%;"></div>';
        stage.appendChild(wrap);

        const range = controls.querySelector('#diffRange');
        range.addEventListener('input', (e) => {
          state.sliderPct = Number(e.target.value);
          controls.querySelector('#sliderPctLabel').textContent = state.sliderPct + '%';
          wrap.querySelector('#sliderOverlay').style.clipPath = 'inset(0 ' + (100 - state.sliderPct) + '% 0 0)';
          wrap.querySelector('#sliderLine').style.left = state.sliderPct + '%';
        });
        return;
      }

      if (state.mode === 'onion') {
        const controls = document.createElement('div');
        controls.className = 'compare-controls';
        controls.innerHTML =
          '<span>main (0%)</span>' +
          '<input type="range" min="0" max="100" value="' + state.onionOpacity + '" id="onionRange" style="width:260px;" />' +
          '<span>PR (100%)</span>' +
          '<span id="onionPctLabel">' + state.onionOpacity + '%</span>';
        stage.appendChild(controls);

        const wrap = document.createElement('div');
        wrap.className = 'compare-wrap';
        wrap.innerHTML =
          '<img src="' + encodeURI(baseImg) + '" alt="main Before" />' +
          '<img class="onion-top" id="onionImg" src="./' + encodeURI(currentImg) + '" style="opacity:' + (state.onionOpacity / 100) + ';" alt="PR After" />';
        stage.appendChild(wrap);

        const range = controls.querySelector('#onionRange');
        range.addEventListener('input', (e) => {
          state.onionOpacity = Number(e.target.value);
          controls.querySelector('#onionPctLabel').textContent = state.onionOpacity + '%';
          wrap.querySelector('#onionImg').style.opacity = String(state.onionOpacity / 100);
        });
        return;
      }

      if (state.mode === 'pixel-diff') {
        const controls = document.createElement('div');
        controls.className = 'compare-controls';
        controls.innerHTML = '<span class="badge sky" id="pixelDiffStat">ピクセル差分を計算中...</span><span>差分ピクセルをマゼンタで強調表示します</span>';
        stage.appendChild(controls);

        const wrap = document.createElement('div');
        wrap.className = 'compare-wrap';
        const canvas = document.createElement('canvas');
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        wrap.appendChild(canvas);
        stage.appendChild(wrap);

        computePixelDiff(baseImg, './' + currentImg, canvas, controls.querySelector('#pixelDiffStat'));
      }
    }

    function loadImg(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    async function computePixelDiff(baseSrc, curSrc, outCanvas, statEl) {
      try {
        const [a, b] = await Promise.all([loadImg(baseSrc), loadImg(curSrc)]);
        const width = Math.max(a.naturalWidth, b.naturalWidth);
        const height = Math.max(a.naturalHeight, b.naturalHeight);
        outCanvas.width = width;
        outCanvas.height = height;

        const cA = document.createElement('canvas');
        cA.width = width; cA.height = height;
        const ctxA = cA.getContext('2d');
        ctxA.drawImage(a, 0, 0);

        const cB = document.createElement('canvas');
        cB.width = width; cB.height = height;
        const ctxB = cB.getContext('2d');
        ctxB.drawImage(b, 0, 0);

        const dataA = ctxA.getImageData(0, 0, width, height).data;
        const dataB = ctxB.getImageData(0, 0, width, height).data;
        const outCtx = outCanvas.getContext('2d');
        const outImg = outCtx.createImageData(width, height);
        const out = outImg.data;

        let changed = 0;
        const total = width * height;
        for (let i = 0; i < dataA.length; i += 4) {
          const dr = Math.abs(dataA[i] - dataB[i]);
          const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
          const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
          const da = Math.abs(dataA[i + 3] - dataB[i + 3]);
          if (dr + dg + db + da > 16) {
            changed += 1;
            out[i] = 244;
            out[i + 1] = 63;
            out[i + 2] = 165;
            out[i + 3] = 255;
          } else {
            out[i] = Math.round(dataB[i] * 0.35);
            out[i + 1] = Math.round(dataB[i + 1] * 0.35);
            out[i + 2] = Math.round(dataB[i + 2] * 0.35);
            out[i + 3] = 255;
          }
        }
        outCtx.putImageData(outImg, 0, 0);
        const pct = ((changed / Math.max(1, total)) * 100).toFixed(2);
        statEl.textContent = changed === 0
          ? '完全一致 (0.00% diff)'
          : '差分あり: ' + pct + '% (' + changed.toLocaleString() + ' px)';
        statEl.className = changed === 0 ? 'badge emerald' : 'badge amber';
      } catch {
        statEl.textContent = 'ピクセル差分には npm run review:open（ローカルHTTP経由）で開いてください';
        statEl.className = 'badge amber';
      }
    }

    function renderDiagnostics() {
      const screen = MANIFEST.screens[state.screenIndex];
      const grid = $('diagnosticsGrid');
      grid.innerHTML = '';
      if (!screen) return;

      for (const platform of MANIFEST.platforms) {
        const entry = screen.platforms[platform];
        const info = MANIFEST.platformInfo[platform] || { label: platform };
        if (!entry) continue;
        const l = entry.layout || {};
        const containers = l.overflowingContainers || [];
        const card = document.createElement('div');
        card.className = 'diag-card';
        const statusClass =
          (entry.consoleErrorCount > 0 || entry.pageErrorCount > 0)
            ? 'rose'
            : (l.hasHorizontalOverflow || containers.length > 0)
              ? 'amber'
              : 'emerald';
        const statusLabel =
          statusClass === 'rose' ? 'Errors Found' : statusClass === 'amber' ? 'Overflow Notice' : 'Healthy';

        card.innerHTML =
          '<h3><span>' + escapeText(info.label) + ' レイアウト診断</span><span class="badge ' + statusClass + '">' + statusLabel + '</span></h3>' +
          '<dl class="kv">' +
            '<dt>Viewport</dt><dd>' + l.viewportWidth + ' × ' + l.viewportHeight + ' px</dd>' +
            '<dt>Main Scroll</dt><dd>' + l.mainScrollWidth + ' × ' + l.mainScrollHeight + ' px (overflowX: ' + (l.overflowAmountPx || 0) + 'px)</dd>' +
            '<dt>Runtime</dt><dd>Electron ' + escapeText(info.electronVersion) + ' / Chromium ' + escapeText(info.chromiumVersion) + '</dd>' +
            '<dt>Console / Page Err</dt><dd>' + entry.consoleErrorCount + ' / ' + entry.pageErrorCount + '</dd>' +
            '<dt>Interactive Nodes</dt><dd>' + (l.interactiveElementCount ?? '-') + '</dd>' +
            '<dt>Inner Overflow</dt><dd>' + (containers.length === 0 ? 'なし' : containers.map((c) => escapeText(c.hint) + ' (+' + c.overflowPx + 'px)').join(' / ')) + '</dd>' +
            '<dt>Files</dt><dd><a href="./' + encodeURI(entry.viewportImage) + '" target="_blank" rel="noreferrer">Viewport PNG</a>' +
              (entry.fullImage ? ' · <a href="./' + encodeURI(entry.fullImage) + '" target="_blank" rel="noreferrer">Full PNG</a>' : '') +
              ' · <a href="./' + encodeURI(entry.ariaSnapshotFile) + '" target="_blank" rel="noreferrer">ARIA YAML</a></dd>' +
          '</dl>';
        grid.appendChild(card);
      }
    }

    async function renderAriaPanel() {
      const screen = MANIFEST.screens[state.screenIndex];
      const tabs = $('ariaPlatformTabs');
      tabs.innerHTML = '';
      for (const platform of MANIFEST.platforms) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = platform === state.ariaOs ? 'active' : '';
        btn.textContent = (MANIFEST.platformInfo[platform]?.label || platform);
        btn.addEventListener('click', () => {
          state.ariaOs = platform;
          renderAriaPanel();
        });
        tabs.appendChild(btn);
      }

      if (!$('ariaDetails').open || !screen) return;
      const entry = screen.platforms[state.ariaOs];
      if (!entry) {
        $('ariaContent').textContent = 'この OS の ARIA スナップショットはありません。';
        return;
      }
      const key = entry.ariaSnapshotFile;
      if (state.ariaCache.has(key)) {
        $('ariaContent').textContent = state.ariaCache.get(key);
        return;
      }
      $('ariaContent').textContent = '読み込み中...';
      try {
        const res = await fetch('./' + encodeURI(key));
        const text = await res.text();
        state.ariaCache.set(key, text);
        $('ariaContent').textContent = text;
      } catch {
        $('ariaContent').textContent = 'ARIA スナップショットの読み込みには npm run review:open（ローカルHTTP経由）で開いてください。';
      }
    }

    function renderAll() {
      const screen = MANIFEST.screens[state.screenIndex];
      $('screenTitle').textContent = screen ? screen.title : '-';
      $('screenDesc').textContent = screen ? screen.description : '';
      renderSidebar();
      renderStage();
      renderDiagnostics();
      renderAriaPanel();
    }

    async function init() {
      $('targetBadge').textContent = MANIFEST.prNumber ? 'PR #' + MANIFEST.prNumber : MANIFEST.target;
      $('shaBadge').textContent = MANIFEST.shortSha || 'local';
      if (MANIFEST.prTitle) $('prTitleText').textContent = MANIFEST.prTitle;
      if (MANIFEST.runUrl) {
        $('runLink').href = MANIFEST.runUrl;
        $('runLink').style.display = 'inline-flex';
      }

      const osSelect = $('osSelect');
      osSelect.innerHTML = '';
      for (const platform of MANIFEST.platforms) {
        const opt = document.createElement('option');
        opt.value = platform;
        opt.textContent = (MANIFEST.platformInfo[platform]?.label || platform);
        osSelect.appendChild(opt);
      }
      osSelect.value = state.selectedOs;
      osSelect.addEventListener('change', (e) => {
        state.selectedOs = e.target.value;
        renderStage();
      });

      document.querySelectorAll('#modeButtons button').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#modeButtons button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          state.mode = btn.dataset.mode;
          renderStage();
        });
      });

      $('shotKindViewport').addEventListener('click', () => {
        state.shotKind = 'viewport';
        $('shotKindViewport').classList.add('active');
        $('shotKindFull').classList.remove('active');
        renderStage();
      });
      $('shotKindFull').addEventListener('click', () => {
        state.shotKind = 'full';
        $('shotKindFull').classList.add('active');
        $('shotKindViewport').classList.remove('active');
        renderStage();
      });
      $('zoomToggle').addEventListener('click', () => {
        state.zoom100 = !state.zoom100;
        $('zoomToggle').classList.toggle('active', state.zoom100);
        renderStage();
      });
      $('ariaDetails').addEventListener('toggle', () => renderAriaPanel());

      $('copyAiBtn').addEventListener('click', async () => {
        const lines = [
          'Sabaki の Windows / macOS スナップショットを確認して、UI/UX の改善点を提案してください。',
          '- Target: ' + (MANIFEST.prNumber ? 'PR #' + MANIFEST.prNumber : MANIFEST.target) + ' (' + MANIFEST.shortSha + ')',
          '- Platforms: ' + MANIFEST.platforms.join(', ')
        ];
        if (MANIFEST.runId && MANIFEST.repo) {
          lines.push('- Artifact 取得コマンド: gh run download ' + MANIFEST.runId + ' -R ' + MANIFEST.repo + ' --pattern "e2e-snapshots-*" -D ./ci-snapshots');
        }
        lines.push('- 診断サマリー: Console Err ' + MANIFEST.summary.totalConsoleErrors + ' / Horizontal Overflow ' + MANIFEST.summary.horizontalOverflowCount + ' / Inner Overflow ' + MANIFEST.summary.innerOverflowWarningCount);
        lines.push('- 対象画面:');
        for (const s of MANIFEST.screens) {
          lines.push('  - ' + s.id + ': ' + s.title);
        }
        try {
          await navigator.clipboard.writeText(lines.join('\\n'));
          showToast('AI セッション向けレビュー指示をコピーしました');
        } catch {
          showToast('コピーに失敗しました（ブラウザ権限を確認してください）');
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if (e.key === 'ArrowRight' || e.key === 'j') {
          state.screenIndex = (state.screenIndex + 1) % MANIFEST.screens.length;
          renderAll();
        } else if (e.key === 'ArrowLeft' || e.key === 'k') {
          state.screenIndex = (state.screenIndex - 1 + MANIFEST.screens.length) % MANIFEST.screens.length;
          renderAll();
        }
      });

      if (!MANIFEST.isBaseline && !state.baselineManifest) {
        try {
          const res = await fetch('../main/manifest.json', { cache: 'no-store' });
          if (res.ok) {
            state.baselineManifest = await res.json();
          }
        } catch {
          // Baseline not bundled
        }
      }

      renderAll();
    }

    init();
  </script>
</body>
</html>
`
}

function rebuildRootIndex(siteDir, repo) {
  mkdirSync(siteDir, { recursive: true })

  const entries = []
  for (const dirent of readdirSync(siteDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue
    if (dirent.name !== 'main' && !dirent.name.startsWith('pr-')) continue
    const manifest = readJsonIfExists(join(siteDir, dirent.name, 'manifest.json'))
    if (!manifest) continue
    entries.push({
      target: dirent.name,
      isBaseline: dirent.name === 'main',
      prNumber: manifest.prNumber ?? null,
      prTitle: manifest.prTitle ?? null,
      shortSha: manifest.shortSha ?? 'unknown',
      platforms: manifest.platforms ?? [],
      summary: manifest.summary ?? {},
      generatedAt: manifest.generatedAt ?? '',
      reviewUrl: `./${dirent.name}/`,
      manifestUrl: `./${dirent.name}/manifest.json`
    })
  }

  // Show PR preview first if present, then main baseline
  entries.sort((a, b) => {
    if (a.isBaseline !== b.isBaseline) return a.isBaseline ? 1 : -1
    return (b.prNumber ?? 0) - (a.prNumber ?? 0)
  })

  const rootIndexJson = {
    repo,
    distribution: 'github-actions-artifact',
    updatedAt: new Date().toISOString(),
    entries
  }

  writeFileSync(
    join(siteDir, 'index.json'),
    `${JSON.stringify(rootIndexJson, null, 2)}\n`,
    'utf8'
  )

  const cardsHtml = entries.length === 0
    ? '<p style="color:#94a3b8;">スナップショットが見つかりません。</p>'
    : entries
        .map((e) => {
          const label = e.isBaseline
            ? 'main (Baseline)'
            : `PR #${e.prNumber}${e.prTitle ? ` — ${e.prTitle}` : ''}`
          const badges = (e.platforms || [])
            .map((p) => `<span class="badge sky">${escapeHtml(PLATFORM_LABELS[p] || p)}</span>`)
            .join(' ')
          const errs = (e.summary?.totalConsoleErrors ?? 0) + (e.summary?.totalPageErrors ?? 0)
          const healthBadge = errs > 0
            ? `<span class="badge rose">Errors: ${errs}</span>`
            : `<span class="badge emerald">E2E Healthy (${e.summary?.screenCount ?? 0} screens)</span>`

          return `
            <article class="card">
              <div class="card-top">
                <a class="card-title" href="${escapeHtml(e.reviewUrl)}">${escapeHtml(label)}</a>
                <span class="badge">${escapeHtml(e.shortSha)}</span>
              </div>
              <div class="badges">${badges} ${healthBadge}</div>
              <div class="meta">
                <span>生成: ${escapeHtml(e.generatedAt)}</span>
                <span>
                  <a href="${escapeHtml(e.reviewUrl)}">レビュー画面を開く ↗</a> ·
                  <a href="${escapeHtml(e.manifestUrl)}">manifest.json</a>
                </span>
              </div>
            </article>
          `
        })
        .join('\n')

  const rootHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sabaki — Private Local Visual Review</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", sans-serif;
      background: #020617;
      color: #f1f5f9;
      padding: 32px 20px;
    }
    .wrap { max-width: 920px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .sub { margin: 0 0 24px; color: #94a3b8; font-size: 14px; }
    .list { display: flex; flex-direction: column; gap: 14px; }
    .card {
      border: 1px solid #1e293b;
      border-radius: 14px;
      background: #0f172a;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .card-title { font-size: 16px; font-weight: 700; color: #f8fafc; text-decoration: none; }
    .card-title:hover { color: #34d399; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid #334155;
      background: #020617;
      color: #cbd5e1;
    }
    .badge.emerald { border-color: rgba(16,185,129,.45); background: rgba(16,185,129,.14); color: #6ee7b7; }
    .badge.sky { border-color: rgba(56,189,248,.45); background: rgba(56,189,248,.14); color: #7dd3fc; }
    .badge.rose { border-color: rgba(244,63,94,.45); background: rgba(244,63,94,.14); color: #fda4af; }
    .meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 12px; color: #94a3b8; }
    a { color: #34d399; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Sabaki — Private Local Visual Review</h1>
    <p class="sub">
      GitHub Actions Artifact からダウンロードした Windows / macOS 実 Electron E2E スナップショットのローカルレビューポータルです（インターネット非公開）。
    </p>
    <div class="list">
      ${cardsHtml}
    </div>
  </div>
</body>
</html>
`

  writeFileSync(join(siteDir, 'index.html'), rootHtml, 'utf8')
}

function renderPrivatePrCommentMarkdown(manifest, { repo }) {
  const platformsLabel = manifest.platforms.map((p) => PLATFORM_LABELS[p] || p).join(' / ')
  const lines = [
    '<!-- sabaki-visual-review -->',
    '## 🖼️ Windows / macOS Electron E2E & Visual Review (Private Artifact)',
    '',
    'スナップショットとレビュー画面は外部公開せず、**GitHub Actions Artifact** のみに保存しています。',
    '',
    manifest.runUrl ? `- **CI Run & Artifacts**: ${manifest.runUrl}#artifacts` : null,
    `- **Commit**: \`${manifest.shortSha}\` / **対象OS**: ${platformsLabel}`,
    `- **対 \`main\` ベースライン同梱**: ${manifest.hasBaseline ? 'あり（Before/After スライダー・ピクセル差分対応）' : 'なし（\`main\` 初回ビルド後に自動同梱）'}`,
    '',
    '### 診断サマリー',
    '| 指標 | 結果 |',
    '| --- | --- |',
    `| 撮影画面数 | ${manifest.summary.screenCount} 画面 × ${manifest.summary.platformCount} OS |`,
    `| Console / Page エラー | ${manifest.summary.totalConsoleErrors} / ${manifest.summary.totalPageErrors} |`,
    `| メイン領域 横スクロール超過 | ${manifest.summary.horizontalOverflowCount} 件 |`,
    `| 内部コンテナ 横溢れ検知（要確認） | ${manifest.summary.innerOverflowWarningCount} 件 |`,
    '',
    '### 画面別ステータス',
    `| 画面 | ${manifest.platforms.map((p) => PLATFORM_LABELS[p] || p).join(' | ')} |`,
    `| --- | ${manifest.platforms.map(() => '---').join(' | ')} |`
  ].filter((l) => l !== null)

  for (const s of manifest.screens) {
    const cells = [`**${s.title}** (\`${s.id}\`)`]
    for (const p of manifest.platforms) {
      const entry = s.platforms[p]
      if (!entry) {
        cells.push('—')
      } else {
        const errs = (entry.consoleErrorCount ?? 0) + (entry.pageErrorCount ?? 0)
        const overflows = entry.layout?.overflowingContainers ?? []
        const dims = `${entry.layout?.viewportWidth ?? '?'}×${entry.layout?.viewportHeight ?? '?'}`
        if (errs > 0) {
          cells.push(`❌ ERR ${errs} (${dims})`)
        } else if (entry.layout?.hasHorizontalOverflow || overflows.length > 0) {
          const maxPx = Math.max(
            entry.layout?.overflowAmountPx ?? 0,
            ...overflows.map((o) => o.overflowPx ?? 0)
          )
          cells.push(`⚠️ 内部横溢れ +${maxPx}px (${dims})`)
        } else {
          cells.push(`✅ OK (${dims})`)
        }
      }
    }
    lines.push(`| ${cells.join(' | ')} |`)
  }

  lines.push('')
  lines.push('### 👤 手元でインタラクティブ レビュー画面を開く（1コマンド・ローカル限定）')
  lines.push('```bash')
  if (manifest.prNumber) {
    lines.push(`npm run review:open -- --pr ${manifest.prNumber}`)
  } else if (manifest.runId) {
    lines.push(`npm run review:open -- --run ${manifest.runId}`)
  }
  lines.push('```')
  lines.push('')
  lines.push('### 🤖 AI セッションからスナップショット・ARIA・診断 JSON を読み込む')
  lines.push('```bash')
  if (manifest.runId) {
    lines.push(`gh run download ${manifest.runId} -R ${repo} --pattern "e2e-snapshots-*" -D ./ci-snapshots`)
  } else {
    lines.push(`gh run download -R ${repo} --pattern "e2e-snapshots-*" -D ./ci-snapshots`)
  }
  lines.push('```')

  return `${lines.join('\n')}\n`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const siteDir = resolve(args['site-dir'] || 'visual-review-site')
  const repo = args['repo'] || process.env['GITHUB_REPOSITORY'] || '4moda/sabaki'
  const snapshotsDir = resolve(args['snapshots-dir'] || 'e2e-snapshots')
  const baselineDir = args['baseline-dir'] ? resolve(args['baseline-dir']) : null
  const target = args['target'] || 'main'

  rmSync(siteDir, { recursive: true, force: true })
  mkdirSync(siteDir, { recursive: true })

  let baselineManifest = null
  if (target !== 'main' && baselineDir && hasAnyPlatformManifest(baselineDir)) {
    const baselineTargetDir = join(siteDir, 'main')
    mkdirSync(baselineTargetDir, { recursive: true })
    baselineManifest = buildUnifiedManifest({
      snapshotsDir: baselineDir,
      targetDir: baselineTargetDir,
      target: 'main',
      prNumber: null,
      prTitle: null,
      commitSha: args['baseline-sha'] || 'main',
      repo,
      runUrl: args['baseline-run-url'] || null,
      runId: args['baseline-run-id'] || null,
      hasBaseline: false
    })
    writeFileSync(
      join(baselineTargetDir, 'index.html'),
      renderTargetReviewHtml(baselineManifest, null),
      'utf8'
    )
  }

  const targetDir = join(siteDir, target)
  mkdirSync(targetDir, { recursive: true })

  const manifest = buildUnifiedManifest({
    snapshotsDir,
    targetDir,
    target,
    prNumber: args['pr-number'],
    prTitle: args['pr-title'],
    commitSha: args['commit-sha'] || process.env['GITHUB_SHA'] || 'local',
    repo,
    runUrl: args['run-url'],
    runId: args['run-id'],
    hasBaseline: Boolean(baselineManifest)
  })

  writeFileSync(
    join(targetDir, 'index.html'),
    renderTargetReviewHtml(manifest, baselineManifest),
    'utf8'
  )
  rebuildRootIndex(siteDir, repo)

  if (args['comment-out']) {
    const commentMd = renderPrivatePrCommentMarkdown(manifest, { repo })
    writeFileSync(resolve(args['comment-out']), commentMd, 'utf8')
  }

  console.log(
    `Built private visual review bundle for "${target}" (${manifest.platforms.join(', ')}, ${manifest.screens.length} screens, baseline=${Boolean(baselineManifest)}) -> ${siteDir}`
  )
}

main()
