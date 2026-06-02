// Rasterizes resources/icon.svg into the PNGs needed by Electron and
// electron-builder. Run after changing the app icon SVG.
//
// Run: npm run build:app-icon

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcSvg = path.join(root, 'resources/icon.svg')

const targets = [
  // Used by Electron in dev mode (tray/window icon)
  { out: path.join(root, 'resources/icon.png'), size: 512 },
  // Used by electron-builder to generate .icns (macOS) and .ico (Windows)
  { out: path.join(root, 'build/icon.png'), size: 512 }
]

const svg = await fs.readFile(srcSvg)

for (const { out, size } of targets) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(out)
  const { size: bytes } = await fs.stat(out)
  console.log(`  ${path.relative(root, out).padEnd(24)} ${size}x${size}  ${bytes} bytes`)
}

console.log('done.')
