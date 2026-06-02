// Generates a signed Stint license key for a paying customer.
//
// Usage:
//   node scripts/generate-license.mjs
//
// Reads the private key from .stint-private-key.pem in the repo root.
// Outputs a license key you can email to the customer.
//
// Keep .stint-private-key.pem secret. It is gitignored.

import { sign, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = path.join(root, '.stint-private-key.pem')

let privateKey
try {
  privateKey = readFileSync(keyPath, 'utf8')
} catch {
  console.error(`Error: private key not found at ${keyPath}`)
  console.error('Run `npm run keygen` once to generate it, then update the public key in src/main/license/verify.ts.')
  process.exit(1)
}

const payload = randomUUID()
const signature = sign(null, Buffer.from(payload), privateKey).toString('base64url')
const licenseKey = `${payload}.${signature}`

console.log('\nStint license key (send this to the customer):\n')
console.log(licenseKey)
console.log()
