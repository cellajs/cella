/**
 * Decrypt Pulumi passphrase-encrypted stack secrets locally without `pulumi`
 * or any network call. Recovers stored credentials (e.g. the CI deploy key)
 * from just the passphrase + the local Pulumi.<stack>.yaml file.
 *
 * Pulumi's passphrase secret manager uses:
 *   - PBKDF2-SHA256(passphrase, salt, 1_000_000 iterations) → 32-byte key
 *   - AES-256-GCM with 12-byte nonce; ciphertext has the 16-byte tag appended
 *
 * Header line `encryptionsalt: v1:<salt>:v1:<nonce>:<ct>` carries both the
 * salt and an encrypted check value ("pulumi") used to verify the passphrase.
 */
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { escapeRegExp } from './escape-regexp'

const PBKDF2_ITERATIONS = 1_000_000
const KEY_LEN = 32
const GCM_TAG_LEN = 16

function decryptV1(key: Buffer, value: string): string {
  const [version, nonceB64, cipherB64] = value.split(':')
  if (version !== 'v1' || !nonceB64 || !cipherB64) {
    throw new Error(`Unsupported secret format: ${value.slice(0, 16)}…`)
  }
  const nonce = Buffer.from(nonceB64, 'base64')
  const blob = Buffer.from(cipherB64, 'base64')
  const tag = blob.subarray(blob.length - GCM_TAG_LEN)
  const ct = blob.subarray(0, blob.length - GCM_TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** Derive the AES key from passphrase + the salt found in `encryptionsalt`. */
function deriveKey(passphrase: string, encryptionsalt: string): Buffer {
  const [version, saltB64] = encryptionsalt.split(':')
  if (version !== 'v1' || !saltB64) throw new Error(`Unsupported salt format: ${encryptionsalt}`)
  return pbkdf2Sync(passphrase, Buffer.from(saltB64, 'base64'), PBKDF2_ITERATIONS, KEY_LEN, 'sha256')
}

/** Verify a passphrase against the salt header by decrypting the embedded check value. */
function verify(key: Buffer, encryptionsalt: string): boolean {
  // Format: v1:<salt>:v1:<nonce>:<ct>  → check ciphertext is "v1:<nonce>:<ct>"
  const check = encryptionsalt.split(':').slice(2).join(':')
  try {
    return decryptV1(key, check) === 'pulumi'
  } catch {
    return false
  }
}

/**
 * True when `passphrase` decrypts the stack's `encryptionsalt` check value.
 * Returns false (never throws) when the header is missing or the passphrase is
 * wrong, so callers can use it as a plain predicate. `yamlText` is the raw
 * `Pulumi.<stack>.yaml` contents.
 */
export function verifyStackPassphrase(yamlText: string, passphrase: string): boolean {
  const salt = yamlText.match(/^encryptionsalt:\s*(\S+)/m)?.[1]
  if (!salt) return false
  try {
    return verify(deriveKey(passphrase, salt), salt)
  } catch {
    return false
  }
}

/** Pure-string decryption of `secure:` values — exercised via `__testing` only. */
function decryptStackSecretsFromText(text: string, passphrase: string, keys: string[]): Record<string, string> {
  const saltMatch = text.match(/^encryptionsalt:\s*(\S+)/m)
  if (!saltMatch) throw new Error('No encryptionsalt header')
  const salt = saltMatch[1]
  const key = deriveKey(passphrase, salt)
  if (!verify(key, salt)) throw new Error('Bad passphrase')

  const out: Record<string, string> = {}
  for (const k of keys) {
    const m = text.match(new RegExp(`\\b${escapeRegExp(k)}:\\s*\\n\\s+secure:\\s*(\\S+)`, 'm'))
    if (m) out[k] = decryptV1(key, m[1])
  }
  return out
}

// ---------------------------------------------------------------------------
// Internals exposed for testing (do not import from production code).
// ---------------------------------------------------------------------------
export const __testing = { decryptV1, deriveKey, verify, decryptStackSecretsFromText, PBKDF2_ITERATIONS, KEY_LEN, GCM_TAG_LEN }
