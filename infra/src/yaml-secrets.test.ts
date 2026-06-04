import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findUnencryptedSecrets, KNOWN_SECRET_KEYS } from './yaml-secrets.js'

const infraDir = resolve(fileURLToPath(import.meta.url), '../..')

describe('findUnencryptedSecrets', () => {
  it('passes the committed Pulumi.production.yaml', () => {
    const text = readFileSync(resolve(infraDir, 'Pulumi.production.yaml'), 'utf8')
    expect(findUnencryptedSecrets(text)).toEqual([])
  })

  it('flags a plaintext known secret', () => {
    const yaml = [
      'encryptionsalt: v1:abc=',
      'config:',
      '  scaleway:secretKey: SCWSECRETPLAINTEXT',
      '  scaleway:projectId: abc',
    ].join('\n')
    expect(findUnencryptedSecrets(yaml)).toEqual([{ key: 'scaleway:secretKey', reason: 'plaintext' }])
  })

  it('flags a known secret without the secure: child line', () => {
    const yaml = [
      'config:',
      '  infra:cookieSecret:',
      '    value: notSecure',
    ].join('\n')
    expect(findUnencryptedSecrets(yaml)).toEqual([{ key: 'infra:cookieSecret', reason: 'malformed-secure' }])
  })

  it('flags suffix-matched keys not in the allowlist', () => {
    const yaml = [
      'config:',
      '  infra:thirdPartyApiKey: PLAINTEXT',
    ].join('\n')
    expect(findUnencryptedSecrets(yaml)).toEqual([{ key: 'infra:thirdPartyApiKey', reason: 'plaintext' }])
  })

  it('ignores allowlisted suffix-matched keys (projectId, region)', () => {
    const yaml = [
      'config:',
      '  scaleway:projectId: e2e322db',
      '  scaleway:region: fr-par',
    ].join('\n')
    expect(findUnencryptedSecrets(yaml)).toEqual([])
  })

  it('passes when known secrets use the secure: form', () => {
    const yaml = [
      'config:',
      '  infra:cookieSecret:',
      '    secure: v1:nonce:ciphertext',
      '  scaleway:secretKey:',
      '    secure: v1:nonce:ciphertext',
    ].join('\n')
    expect(findUnencryptedSecrets(yaml)).toEqual([])
  })

  it('KNOWN_SECRET_KEYS includes every secret consumed in modules/*.ts', () => {
    // Locks the allowlist against accidental removal.
    expect(KNOWN_SECRET_KEYS).toEqual(
      expect.arrayContaining([
        'scaleway:accessKey',
        'scaleway:secretKey',
        'infra:dbPassword',
        'infra:cookieSecret',
        'infra:unsubscribeSecret',
        'infra:cdcSecret',
        'infra:yjsSecret',
        'infra:brevoApiKey',
        'infra:scwAiApiKey',
      ]),
    )
  })
})
