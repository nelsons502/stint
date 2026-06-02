// One-time keypair rotation script.
// Run this if you need to generate a fresh keypair (e.g. key compromise).
//
// Usage:
//   node scripts/keygen.mjs
//
// After running:
//  1. Replace the PUBLIC_KEY_PEM constant in src/main/license/verify.ts
//     with the new public key printed below.
//  2. The new .stint-private-key.pem is written automatically.
//  3. Re-ship the app. All old keys stop working — email affected customers
//     regenerated keys using `npm run generate-license`.
//
// WARNING: This overwrites .stint-private-key.pem. Back up the old one first
// if you still need to generate keys for the old version.

import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = path.join(root, '.stint-private-key.pem')

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
})

writeFileSync(keyPath, privateKey, { mode: 0o600 })

console.log('\nPrivate key written to .stint-private-key.pem (gitignored).\n')
console.log('Copy this public key into src/main/license/verify.ts:\n')
console.log(publicKey)
