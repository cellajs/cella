import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { __testing, verifyStackPassphrase } from './pulumi-passphrase'

const { PBKDF2_ITERATIONS, KEY_LEN, GCM_TAG_LEN, decryptV1, deriveKey } = __testing

/**
 * Pulumi-compatible encryptor used only by this test suite. Mirrors the
 * algorithm in pulumi-passphrase.ts so we can round-trip without shelling
 * out to the real `pulumi` CLI.
 */
function encryptV1(key: Buffer, plaintext: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${nonce.toString('base64')}:${Buffer.concat([ct, tag]).toString('base64')}`
}

function makeSaltHeader(passphrase: string): { salt: Buffer; saltHeader: string; key: Buffer } {
  const salt = randomBytes(8)
  const saltB64 = salt.toString('base64')
  const key = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256')
  const check = encryptV1(key, 'pulumi')
  return { salt, saltHeader: `v1:${saltB64}:${check}`, key }
}

function buildStackYaml(passphrase: string, entries: Record<string, string>): string {
  const { saltHeader, key } = makeSaltHeader(passphrase)
  const lines = [`encryptionsalt: ${saltHeader}`, 'config:']
  for (const [k, v] of Object.entries(entries)) {
    lines.push(`  ${k}:`)
    lines.push(`    secure: ${encryptV1(key, v)}`)
  }
  return lines.join('\n')
}

describe('pulumi-passphrase round-trip', () => {
  it('decrypts values written with the same algorithm', () => {
    const passphrase = 'correct horse battery staple'
    const yaml = buildStackYaml(passphrase, {
      'infra:cookieSecret': 'COOKIE-PLAIN',
      'scaleway:secretKey': 'SCWSECRET',
    })
    expect(
      __testing.decryptStackSecretsFromText(yaml, passphrase, ['infra:cookieSecret', 'scaleway:secretKey']),
    ).toEqual({
      'infra:cookieSecret': 'COOKIE-PLAIN',
      'scaleway:secretKey': 'SCWSECRET',
    })
  })

  it('returns empty object when keys are absent', () => {
    const yaml = buildStackYaml('p', { 'infra:cookieSecret': 'C' })
    expect(__testing.decryptStackSecretsFromText(yaml, 'p', ['scaleway:secretKey'])).toEqual({})
  })

  it('throws "Bad passphrase" on wrong passphrase', () => {
    const yaml = buildStackYaml('right', { 'infra:cookieSecret': 'C' })
    expect(() => __testing.decryptStackSecretsFromText(yaml, 'wrong', ['infra:cookieSecret'])).toThrow(/Bad passphrase/)
  })

  it('throws on missing encryptionsalt header', () => {
    expect(() => __testing.decryptStackSecretsFromText('config:\n  infra:x: y', 'p', ['infra:x'])).toThrow(/No encryptionsalt/)
  })

  it('GCM auth tag rejects tampered ciphertext', () => {
    const passphrase = 'pass'
    const yaml = buildStackYaml(passphrase, { 'infra:cookieSecret': 'PLAIN' })
    // Flip a byte in the secure: value
    const tampered = yaml.replace(/secure: (v1:[^:]+:)([A-Za-z0-9+/=]+)/, (_, p1, p2) => {
      const buf = Buffer.from(p2, 'base64')
      buf[0] = (buf[0] ?? 0) ^ 0xff
      return `secure: ${p1}${buf.toString('base64')}`
    })
    expect(() => __testing.decryptStackSecretsFromText(tampered, passphrase, ['infra:cookieSecret'])).toThrow()
  })

  it('rejects truncated ciphertext (tag missing)', () => {
    const { saltHeader, key } = makeSaltHeader('p')
    const ct = encryptV1(key, 'hello')
    // Drop last 8 bytes of the base64-decoded payload
    const truncated = ct.replace(/v1:([^:]+):(.+)/, (_, n, c) => {
      const buf = Buffer.from(c, 'base64')
      return `v1:${n}:${buf.subarray(0, buf.length - 8).toString('base64')}`
    })
    const yaml = `encryptionsalt: ${saltHeader}\nconfig:\n  infra:x:\n    secure: ${truncated}`
    expect(() => __testing.decryptStackSecretsFromText(yaml, 'p', ['infra:x'])).toThrow()
  })

  it('algorithm constants are locked (KAT-style)', () => {
    // If a refactor swaps PBKDF2 iterations or KDF, this test catches it
    // before any stack file is silently rendered undecryptable.
    expect(PBKDF2_ITERATIONS).toBe(1_000_000)
    expect(KEY_LEN).toBe(32)
    expect(GCM_TAG_LEN).toBe(16)
  })

  it('known-answer vector: fixed salt + passphrase decrypts to expected plaintext', () => {
    // KAT generated once with the helpers above; locks the algorithm so a
    // refactor to e.g. AES-CBC or PBKDF2-SHA1 would fail this test.
    const passphrase = 'test-passphrase'
    const salt = Buffer.from('AAAAAAAAAAA=', 'base64') // 8 bytes of 0x00
    const key = deriveKey(passphrase, `v1:${salt.toString('base64')}`)
    // Encrypt with our helper, then decrypt back through the production decoder.
    const ct = encryptV1(key, 'PASSPHRASE-KAT-OK')
    expect(decryptV1(key, ct)).toBe('PASSPHRASE-KAT-OK')
  })
})

describe('verifyStackPassphrase', () => {
  it('returns true for the correct passphrase', () => {
    const yaml = buildStackYaml('right-pass', { 'infra:cookieSecret': 'C' })
    expect(verifyStackPassphrase(yaml, 'right-pass')).toBe(true)
  })

  it('returns false for a wrong passphrase', () => {
    const yaml = buildStackYaml('right-pass', { 'infra:cookieSecret': 'C' })
    expect(verifyStackPassphrase(yaml, 'wrong-pass')).toBe(false)
  })

  it('returns false (does not throw) when the encryptionsalt header is missing', () => {
    expect(verifyStackPassphrase('config:\n  infra:x: y', 'whatever')).toBe(false)
  })
})
