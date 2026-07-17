import { describe, expect, it } from 'vitest'
import { defineServices } from '../../compose/infrastructure'
import { appServices } from '../../config/services.config'

/** Minimal valid service entry to hang lbPathBegin variations on. */
const base = {
  image: 'r/x:latest',
  port: 4000,
  healthTimeoutSeconds: 60,
  startPeriod: '10s',
  replacementStrategy: 'lb-overlap',
  instanceType: 'DEV1-S',
} as const

// lbPathBegin feeds the LB's raw matchPathBegin string; a malformed or
// duplicated prefix silently misroutes traffic, so defineServices rejects it
// at synth/plan time.
describe('lbPathBegin registry validation', () => {
  it('accepts a single lowercase segment with a leading slash', () => {
    expect(() => defineServices({ a: { ...base, lbRoute: 'default', lbPathBegin: '/api' } })).not.toThrow()
  })

  it('rejects a prefix on an internal-only service (no lbRoute → no LB backend)', () => {
    expect(() => defineServices({ a: { ...base, lbPathBegin: '/api' } })).toThrow(/without lbRoute/)
  })

  it("rejects lbRoute 'path' without a prefix (nothing would route to it)", () => {
    expect(() => defineServices({ a: { ...base, lbRoute: 'path' } })).toThrow(/no lbPathBegin/)
  })

  it('rejects trailing slashes, nested segments, and uppercase', () => {
    for (const bad of ['/api/', '/api/v1', '/API', 'api']) {
      // @ts-expect-error: 'api' (no leading slash) is also a type error; the rest fail at runtime
      expect(() => defineServices({ a: { ...base, lbRoute: 'default', lbPathBegin: bad } })).toThrow(/lbPathBegin/)
    }
  })

  it('rejects two services claiming the same prefix', () => {
    expect(() =>
      defineServices({
        a: { ...base, lbRoute: 'default', lbPathBegin: '/api' },
        b: { ...base, lbRoute: 'host', lbPathBegin: '/api' },
      }),
    ).toThrow(/unique/)
  })
})

describe('shipped registry declares the same-origin prefixes', () => {
  it('backend, yjs, and mcp carry their path prefixes; cdc and frontend stay off', () => {
    expect(appServices.backend.lbPathBegin).toBe('/api')
    expect(appServices.yjs.lbPathBegin).toBe('/yjs')
    expect(appServices.mcp.lbPathBegin).toBe('/mcp')
    expect('lbPathBegin' in appServices.cdc).toBe(false)
    expect('lbPathBegin' in appServices.frontend).toBe(false)
  })
})
