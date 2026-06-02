// Rasterizes resources/tray/iconTemplate.svg into PNGs the Electron Tray
// can load: iconTemplate.png (16px tall) and iconTemplate@2x.png (32px tall).
// Width is auto-calculated from the SVG viewBox aspect ratio.
// Also generates a preview PNG for visual sanity-checking.
//
// Run: npm run build:icons

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcSvg = path.join(root, 'resources/tray/iconTemplate.svg')
const outDir = path.join(root, 'resources/tray')

const targets = [
  { name: 'iconTemplate.png', height: 16 },
  { name: 'iconTemplate@2x.png', height: 32 },
  { name: 'iconTemplate-preview.png', height: 220 }
]

const svg = await fs.readFile(srcSvg)

for (const { name, height } of targets) {
  const outPath = path.join(outDir, name)
  // resize({ height }) preserves the SVG aspect ratio automatically
  await sharp(svg, { density: 512 }).resize({ height }).png().toFile(outPath)
  const meta = await sharp(outPath).metadata()
  const { size: bytes } = await fs.stat(outPath)
  console.log(`  ${name.padEnd(32)} ${meta.width}x${meta.height}  ${bytes} bytes`)
}

// 1×1 transparent PNG used when a context is running (icon is hidden)
const emptyPath = path.join(outDir, 'iconEmpty.png')
await sharp({
  create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
}).png().toFile(emptyPath)
const { size: emptyBytes } = await fs.stat(emptyPath)
console.log(`  ${'iconEmpty.png'.padEnd(32)} 1x1  ${emptyBytes} bytes`)

console.log('done.')
