import { createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { escapeRegExp } from '../utils/escape-regexp'

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

/** Verify a passphrase against Pulumi's passphrase secret-manager check value. */
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
 * Generate a strong Pulumi passphrase (the equivalent of
 * `openssl rand -base64 24`): 24 random bytes, base64-encoded.
 */
export function generatePassphrase(): string {
  return randomBytes(24).toString('base64')
}

/**
 * True when this `pulumi version` output supports non-interactive passphrase
 * rotation: `stack change-secrets-provider passphrase` reading the NEW
 * passphrase from stdin: added in v3.44.0 (pulumi/pulumi#11094). Older CLIs
 * fail with "passphrase rotation requires an interactive terminal".
 * Unparseable output (e.g. a dev build) is not blocked; pulumi itself errors
 * if it is genuinely too old. Pure.
 */
export function supportsStdinPassphraseRotation(versionOutput: string): boolean {
  const match = versionOutput.match(/v?(\d+)\.(\d+)\.\d+/)
  if (!match) return true
  const [major, minor] = [Number(match[1]), Number(match[2])]
  return major > 3 || (major === 3 && minor >= 44)
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

/** Pure-string decryption of `secure:` values, exercised via `__testing` only. */
function decryptStackSecretsFromText(text: string, passphrase: string, keys: string[]): Record<string, string> {
  const salt = text.match(/^encryptionsalt:\s*(\S+)/m)?.[1]
  if (!salt) throw new Error('No encryptionsalt header')
  const key = deriveKey(passphrase, salt)
  if (!verify(key, salt)) throw new Error('Bad passphrase')

  const out: Record<string, string> = {}
  for (const k of keys) {
    const value = text.match(new RegExp(`\\b${escapeRegExp(k)}:\\s*\\n\\s+secure:\\s*(\\S+)`, 'm'))?.[1]
    if (value) out[k] = decryptV1(key, value)
  }
  return out
}

// Internals exposed for testing (do not import from production code).
export const __testing = { decryptV1, deriveKey, verify, decryptStackSecretsFromText, PBKDF2_ITERATIONS, KEY_LEN, GCM_TAG_LEN }
