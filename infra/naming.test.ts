import { describe, expect, it } from 'vitest'
import { deriveInfra } from './naming.js'

/**
 * Build a minimal AppConfig-shaped fixture. The full type has many fields but
 * deriveInfra only reads the ones below; cast keeps this fast and decoupled
 * from the rest of shared/.
 */
function fakeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: 'cella',
    mode: 'production' as const,
    domain: 'cella.dev',
    frontendUrl: 'https://www.cella.dev',
    backendUrl: 'https://api.cella.dev',
    yjsUrl: 'wss://yjs.cella.dev',
    aiApiUrl: 'https://ai.cella.dev',
    securityEmail: 'security@cella.dev',
    s3: {
      host: 's3.nl-ams.scw.cloud',
      region: 'nl-ams',
      publicBucket: 'cella-public',
      privateBucket: 'cella-private',
    },
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: typed via cast for test fixture
  } as any
}

describe('deriveInfra', () => {
  it('derives stable naming for the canonical production config', () => {
    const d = deriveInfra(fakeConfig())
    expect(d.naming.prefix).toBe('cella')
    expect(d.naming.frontendBucket).toBe('cella-frontend')
    expect(d.naming.publicBucket).toBe('cella-public')
    expect(d.naming.privateBucket).toBe('cella-private')
    expect(d.naming.pulumiStateBucket).toBe('cella-pulumi-state')
    expect(d.naming.resource('lb')).toBe('cella-lb')
  })

  it('registryNamespace strips hyphens (Scaleway constraint)', () => {
    expect(deriveInfra(fakeConfig({ slug: 'my-cool-app' })).naming.registryNamespace).toBe('mycoolapp')
  })

  it('registryNamespace pads short slugs to meet Scaleway 4-char minimum', () => {
    expect(deriveInfra(fakeConfig({ slug: 'rak' })).naming.registryNamespace).toBe('rakapp')
  })

  it('all bucket names are unique within a stack', () => {
    const d = deriveInfra(fakeConfig())
    const names = [
      d.naming.frontendBucket,
      d.naming.publicBucket,
      d.naming.privateBucket,
      d.naming.pulumiStateBucket,
    ]
    expect(new Set(names).size).toBe(names.length)
  })

  it('parses every hostname from its URL', () => {
    const d = deriveInfra(fakeConfig())
    expect(d.domains.zone).toBe('cella.dev')
    expect(d.domains.app).toBe('www.cella.dev')
    expect(d.domains.api).toBe('api.cella.dev')
    expect(d.domains.yjs).toBe('yjs.cella.dev')
    expect(d.domains.ai).toBe('ai.cella.dev')
  })

  it('hasDomain is false for localhost', () => {
    const d = deriveInfra(
      fakeConfig({
        domain: 'localhost',
        frontendUrl: 'http://localhost:3000',
        backendUrl: 'http://localhost:4000',
        yjsUrl: 'ws://localhost:4002',
        aiApiUrl: 'http://localhost:4003',
      }),
    )
    expect(d.hasDomain).toBe(false)
  })

  it('mode flags reflect appConfig.mode', () => {
    const dev = deriveInfra(fakeConfig({ mode: 'development' }))
    expect(dev.isProduction).toBe(false)

    const prod = deriveInfra(fakeConfig({ mode: 'production' }))
    expect(prod.isProduction).toBe(true)
  })

  it('tags always include env/app/managed-by', () => {
    const d = deriveInfra(fakeConfig({ slug: 'cella', mode: 'staging' }))
    expect(d.tags).toEqual(['env=staging', 'app=cella', 'managed-by=pulumi'])
  })

  it('region and zone are consistent (zone = region-1)', () => {
    const d = deriveInfra(fakeConfig())
    expect(d.region).toBe('nl-ams')
    expect(d.zone).toBe('nl-ams-1')
  })
})
