import { verify } from 'node:crypto'

// Ed25519 public key. The matching private key lives in .stint-private-key.pem
// (gitignored). To rotate: run `npm run keygen`, update this constant, and
// re-ship. Old keys will stop working, so email existing buyers the new key.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAQTSWvVctAadxJaeUli+zfrri0F5hB7V/vccUgTEtNm0=
-----END PUBLIC KEY-----`

/**
 * Key format: "<uuid>.<base64url_ed25519_signature>"
 *
 * To generate a valid key, run:
 *   STINT_KEY_PATH=.stint-private-key.pem node scripts/generate-license.mjs
 *
 * Returns true iff the key is well-formed and the signature verifies against
 * the embedded public key. Does NOT check any server — fully offline.
 */
export function verifyLicenseKey(key: string): boolean {
  const trimmed = key.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot === -1) return false

  const payload = trimmed.slice(0, dot)
  const sig = trimmed.slice(dot + 1)

  if (!payload || !sig) return false

  try {
    return verify(
      null,
      Buffer.from(payload),
      PUBLIC_KEY_PEM,
      Buffer.from(sig, 'base64url')
    )
  } catch {
    return false
  }
}
