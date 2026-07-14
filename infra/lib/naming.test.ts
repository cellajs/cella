import { describe, expect, it } from 'vitest'
import { fakeConfig } from '../tests/helpers/fake-config'
import { serviceEndpoints } from './services'
import { deriveInfra } from './naming'

describe('deriveInfra', () => {
  it('derives stable naming for the canonical production config', () => {
    const d = deriveInfra(fakeConfig())
    expect(d.naming.prefix).toBe('cella')
    expect(d.naming.frontendBucket).toBe('cella-frontend')
    expect(d.naming.publicBucket).toBe('cella-public')
    expect(d.naming.privateBucket).toBe('cella-private')
    expect(d.naming.pulumiStateBucket).toBe('cella-pulumi-state-v2')
    expect(d.naming.bootDiagBucket).toBe('cella-boot-diag')
    expect(d.naming.resource('lb')).toBe('cella-lb')
  })

  it('registryNamespace strips hyphens (Scaleway constraint)', () => {
    expect(deriveInfra(fakeConfig({ slug: 'my-cool-app' })).naming.registryNamespace).toBe('mycoolapp')
  })

  it('all bucket names are unique within a stack', () => {
    const d = deriveInfra(fakeConfig())
    const names = [
      d.naming.frontendBucket,
      d.naming.publicBucket,
      d.naming.privateBucket,
      d.naming.pulumiStateBucket,
      d.naming.bootDiagBucket,
    ]
    expect(new Set(names).size).toBe(names.length)
  })

  it('exposes the DNS zone', () => {
    expect(deriveInfra(fakeConfig()).dnsZone).toBe('cellajs.com')
  })

  it('derives every public service host from the registry', () => {
    const bySlug = new Map(serviceEndpoints(fakeConfig()).map((e) => [e.slug, e.host]))
    expect(bySlug.get('frontend')).toBe('www.cellajs.com')
    expect(bySlug.get('backend')).toBe('api.cellajs.com')
    expect(bySlug.get('yjs')).toBe('yjs.cellajs.com')
    expect(bySlug.get('mcp')).toBe('mcp.cellajs.com')
    // cdc is internal-only (no lbRoute) → no endpoint
    expect(bySlug.has('cdc')).toBe(false)
  })

  it('hasDomain is false for localhost', () => {
    const d = deriveInfra(
      fakeConfig({
        domain: 'localhost',
        frontendUrl: 'http://localhost:3000',
        backendUrl: 'http://localhost:4000',
        yjsUrl: 'ws://localhost:4002',
        mcpUrl: 'http://localhost:4003',
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

  it('tagsAsMap carries the same tags as real key→value pairs', () => {
    const d = deriveInfra(fakeConfig({ slug: 'cella', mode: 'staging' }))
    expect(d.tagsAsMap).toEqual({ env: 'staging', app: 'cella', 'managed-by': 'pulumi' })
    // Guard against the historic `split(':')` bug: no key may embed `=`,
    // and no value may be undefined.
    for (const [key, value] of Object.entries(d.tagsAsMap)) {
      expect(key).not.toContain('=')
      expect(value).toBeTypeOf('string')
    }
  })

  it('region and zone are consistent (zone = region-1)', () => {
    const d = deriveInfra(fakeConfig())
    expect(d.region).toBe('nl-ams')
    expect(d.zone).toBe('nl-ams-1')
  })
})
