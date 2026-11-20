#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

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

function runGh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function detectRepo() {
  try {
    return runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  } catch {
    return '4moda/sabaki'
  }
}

function findRunId({ repo, prNumber, explicitRunId, branch }) {
  if (explicitRunId) return String(explicitRunId)

  let targetBranch = branch
  if (prNumber) {
    targetBranch = runGh([
      'pr',
      'view',
      String(prNumber),
      '-R',
      repo,
      '--json',
      'headRefName',
      '--jq',
      '.headRefName'
    ])
  } else if (!targetBranch) {
    targetBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
  }

  const runsJson = runGh([
    'run',
    'list',
    '-R',
    repo,
    '--workflow',
    'ci.yml',
    '--branch',
    targetBranch,
    '--limit',
    '10',
    '--json',
    'databaseId,status,conclusion,createdAt'
  ])
  const runs = JSON.parse(runsJson)
  const completed = runs.find((r) => r.status === 'completed')
  if (!completed) {
    throw new Error(`No completed CI workflow runs found for branch "${targetBranch}"`)
  }
  return String(completed.databaseId)
}

function openBrowser(url) {
  const platform = process.platform
  try {
    if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch {
    // Non-fatal if running in a headless environment
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.yaml': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
}

function serveDirectory(rootDir, { port, initialPath, shouldOpen }) {
  const resolvedRoot = resolve(rootDir)
  const server = createServer((req, res) => {
    const rawUrl = (req.url || '/').split('?')[0]
    let decodedPath
    try {
      decodedPath = decodeURIComponent(rawUrl)
    } catch {
      res.writeHead(400)
      res.end('Bad Request')
      return
    }

    const safeRel = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
    let filePath = resolve(resolvedRoot, safeRel)

    if (!filePath.startsWith(resolvedRoot)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html')
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const mime = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-store'
    })
    res.end(readFileSync(filePath))
  })

  server.listen(port, '127.0.0.1', () => {
    const addr = server.address()
    const boundPort = typeof addr === 'object' && addr ? addr.port : port
    const url = `http://127.0.0.1:${boundPort}${initialPath}`
    console.log('')
    console.log('Sabaki Private Local Visual Review Server')
    console.log(`  URL:       ${url}`)
    console.log(`  Directory: ${resolvedRoot}`)
    console.log('  Bound to:  127.0.0.1 only (not exposed to external network)')
    console.log('  Press Ctrl+C to stop.')
    console.log('')
    if (shouldOpen) {
      openBrowser(url)
    }
  })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const port = args['port'] ? Number(args['port']) : 0
  const shouldOpen = args['no-open'] !== 'true'

  if (args['local'] === 'true') {
    const siteDir = resolve('visual-review-site')
    const snapshotsDir = resolve(args['snapshots-dir'] || 'e2e-snapshots')
    if (existsSync(snapshotsDir)) {
      execFileSync(
        process.execPath,
        [
          resolve('scripts/build-visual-review-site.mjs'),
          '--snapshots-dir',
          snapshotsDir,
          '--site-dir',
          siteDir,
          '--target',
          'main'
        ],
        { stdio: 'inherit' }
      )
    }
    if (!existsSync(join(siteDir, 'index.html'))) {
      throw new Error('No local snapshots found. Run "npm run test:e2e" first.')
    }
    serveDirectory(siteDir, { port, initialPath: '/main/', shouldOpen })
    return
  }

  const repo = args['repo'] || detectRepo()
  const runId = findRunId({
    repo,
    prNumber: args['pr'],
    explicitRunId: args['run'],
    branch: args['branch']
  })

  const cacheDir = resolve('.cache', 'visual-review', `run-${runId}`)
  const forceRefresh = args['refresh'] === 'true'
  if (forceRefresh || !existsSync(join(cacheDir, 'index.html'))) {
    rmSync(cacheDir, { recursive: true, force: true })
    mkdirSync(cacheDir, { recursive: true })
    console.log(`Downloading private visual-review-bundle from CI run ${runId} (${repo})...`)
    execFileSync(
      'gh',
      ['run', 'download', runId, '-R', repo, '-n', 'visual-review-bundle', '-D', cacheDir],
      { stdio: 'inherit' }
    )
  } else {
    console.log(`Using cached visual-review-bundle at ${cacheDir} (pass --refresh to re-download)`)
  }

  let initialPath = '/'
  const indexJsonPath = join(cacheDir, 'index.json')
  if (existsSync(indexJsonPath)) {
    const idx = JSON.parse(readFileSync(indexJsonPath, 'utf8'))
    const preferred =
      (args['pr'] && (idx.entries || []).find((e) => e.target === `pr-${args['pr']}`)) ||
      (idx.entries || [])[0]
    if (preferred?.target) {
      initialPath = `/${preferred.target}/`
    }
  }

  serveDirectory(cacheDir, { port, initialPath, shouldOpen })
}

main()
