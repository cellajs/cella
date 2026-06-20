import { describe, expect, it } from 'vitest'
import { type FetchLike, type SecretToCheck, assertSecretsDeliverable, serviceNamesFromServicesJson } from './assert-secrets-deliverable'

const REGION = 'fr-par'
const PROJECT = 'proj-1'
const KEY = 'scw-secret-key'

const b64 = (value: string) => Buffer.from(value, 'utf-8').toString('base64')

interface FakeSecret {
  /** Secret value as stored; null = no accessible version (404 on access). */
  value: string | null
}

/**
 * Build a fetch double that resolves a secret id by name then serves its latest
 * version, mirroring the two Secret Manager calls the task makes. A name absent
 * from the map lists empty (secret does not exist).
 */
function fakeFetch(secrets: Record<string, FakeSecret>): FetchLike {
  const idByName = new Map(Object.keys(secrets).map((name, i) => [name, `id-${i}`]))
  const byId = new Map([...idByName].map(([name, id]) => [id, secrets[name]!]))
  return async (url) => {
    if (url.includes('/secrets?')) {
      const name = decodeURIComponent(new URL(url).searchParams.get('name') ?? '')
      const id = idByName.get(name)
      const body = JSON.stringify({ secrets: id ? [{ id, name }] : [] })
      return { ok: true, status: 200, text: async () => body }
    }
    const id = url.match(/secrets\/([^/]+)\/versions/)?.[1] ?? ''
    const secret = byId.get(id)
    if (!secret || secret.value === null) {
      return { ok: false, status: 404, text: async () => 'NoSuchVersion' }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: b64(secret.value!) }) }
  }
}

const silent = () => {}

describe('assertSecretsDeliverable', () => {
  it('passes when every required secret is present and single-line', async () => {
    const secrets: SecretToCheck[] = [
      { envVar: 'DATABASE_URL', secretName: 'database-url', required: true },
      { envVar: 'DATABASE_SSL_CA', secretName: 'database-ssl-ca', required: true },
    ]
    const res = await assertSecretsDeliverable({
      secretKey: KEY,
      region: REGION,
      projectId: PROJECT,
      secrets,
      log: silent,
      fetchImpl: fakeFetch({
        'database-url': { value: 'postgres://u:p@h:5432/db' },
        // base64-encoded PEM is single-line on the wire — deliverable.
        'database-ssl-ca': { value: b64('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----') },
      }),
    })
    expect(res.ok).toBe(true)
    expect(res.checked).toBe(2)
    expect(res.offenders).toEqual([])
  })

  it('flags a present-but-multiline value regardless of required', async () => {
    const res = await assertSecretsDeliverable({
      secretKey: KEY,
      region: REGION,
      projectId: PROJECT,
      secrets: [{ envVar: 'DATABASE_SSL_CA', secretName: 'database-ssl-ca', required: false }],
      log: silent,
      // Stored as a RAW multi-line PEM — the exact value that took prod down.
      fetchImpl: fakeFetch({ 'database-ssl-ca': { value: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----' } }),
    })
    expect(res.ok).toBe(false)
    expect(res.offenders).toEqual([{ envVar: 'DATABASE_SSL_CA', secretName: 'database-ssl-ca', reason: 'multiline' }])
  })

  it('flags a missing required secret but skips a missing optional one', async () => {
    const res = await assertSecretsDeliverable({
      secretKey: KEY,
      region: REGION,
      projectId: PROJECT,
      secrets: [
        { envVar: 'COOKIE_SECRET', secretName: 'cookie-secret', required: true },
        { envVar: 'OPENAI_API_KEY', secretName: 'openai-api-key', required: false },
      ],
      log: silent,
      // Neither secret exists; only the required one is an offender.
      fetchImpl: fakeFetch({}),
    })
    expect(res.ok).toBe(false)
    expect(res.offenders).toEqual([{ envVar: 'COOKIE_SECRET', secretName: 'cookie-secret', reason: 'missing' }])
  })
})

describe('serviceNamesFromServicesJson', () => {
  it('extracts known service names and drops unknown rows', () => {
    const raw = JSON.stringify([{ service: 'backend' }, { service: 'bogus' }, { service: 'frontend' }])
    expect(serviceNamesFromServicesJson(raw)).toEqual(['backend', 'frontend'])
  })
})
