// Rebuilds better-sqlite3 for either Node or Electron ABI. Used by
// pretest/predev hooks to switch between the two without state confusion.
//
// Why this script exists: @electron/rebuild writes a `.forge-meta` marker
// next to the .node binary recording the ABI it last built for. If we swap
// the binary via `npm rebuild` (Node ABI), the marker still claims Electron
// — so the next `electron-builder install-app-deps` silently no-ops.
// Wiping build/Release first kills both the stale binary AND the marker.

import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'

const target = process.argv[2]
if (target !== 'electron' && target !== 'node') {
  console.error('Usage: rebuild-bsq.mjs <electron|node>')
  process.exit(1)
}

const releaseDir = 'node_modules/better-sqlite3/build/Release'
if (existsSync(releaseDir)) {
  rmSync(releaseDir, { recursive: true, force: true })
}

const cmd =
  target === 'electron'
    ? 'npx --no-install electron-builder install-app-deps'
    : 'npm rebuild better-sqlite3'

console.log(`Rebuilding better-sqlite3 for ${target} ABI…`)
execSync(cmd, { stdio: 'inherit' })

const binPath = `${releaseDir}/better_sqlite3.node`
if (!existsSync(binPath)) {
  console.error(`\nERROR: rebuild reported success but ${binPath} doesn't exist`)
  process.exit(1)
}
console.log(`✓ ${binPath} is in place`)
