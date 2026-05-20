// Rasterizes resources/tray/iconTemplate.svg into PNGs the Electron Tray
// can load: iconTemplate.png (16x16) and iconTemplate@2x.png (32x32).
// Also generates a 256x256 preview for visual sanity-checking.
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
  { name: 'iconTemplate.png', size: 16 },
  { name: 'iconTemplate@2x.png', size: 32 },
  { name: 'iconTemplate-preview.png', size: 256 }
]

const svg = await fs.readFile(srcSvg)

for (const { name, size } of targets) {
  const outPath = path.join(outDir, name)
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(outPath)
  const { size: bytes } = await fs.stat(outPath)
  console.log(`  ${name.padEnd(28)} ${size}x${size}  ${bytes} bytes`)
}

console.log('done.')
