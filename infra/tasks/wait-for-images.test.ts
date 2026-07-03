import { describe, expect, it, vi } from 'vitest'
import { imageRef, imageServices, imageServicesFromBuildMatrix, parseArgs, waitForImages } from './wait-for-images'

const TAG = 'abc1234'

describe('imageServices', () => {
  it('excludes services that reuse another image (e.g. mcp → backend)', () => {
    expect(imageServices()).toEqual(['backend', 'cdc', 'yjs', 'frontend'])
    expect(imageServices()).not.toContain('mcp')
  })
})

describe('imageRef', () => {
  it('assembles registry/ns/service:tag', () => {
    expect(imageRef('rg.nl-ams.scw.cloud', 'cella', 'backend', TAG)).toBe('rg.nl-ams.scw.cloud/cella/backend:abc1234')
  })
})

describe('waitForImages', () => {
  const noSleep = vi.fn(async () => {})
  const noLog = () => {}

  it('resolves ok when every image is immediately present', async () => {
    const inspect = vi.fn(async () => true)
    const out = await waitForImages({ registry: 'r', namespace: 'n', tag: TAG, inspect, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: true, missing: [] })
    // one inspect per image service (4), no retries
    expect(inspect).toHaveBeenCalledTimes(4)
  })

  it('retries a not-yet-present image then succeeds', async () => {
    let calls = 0
    const inspect = vi.fn(async () => {
      calls++
      // backend appears on its 2nd check; everything else immediately
      return !(calls === 1)
    })
    const out = await waitForImages({ registry: 'r', namespace: 'n', tag: TAG, inspect, attempts: 3, sleep: noSleep, log: noLog })
    expect(out.ok).toBe(true)
  })

  it('reports images that never appear', async () => {
    const inspect = vi.fn(async (ref: string) => !ref.includes('/yjs:'))
    const out = await waitForImages({ registry: 'r', namespace: 'n', tag: TAG, inspect, attempts: 2, sleep: noSleep, log: noLog })
    expect(out.ok).toBe(false)
    expect(out.missing).toEqual(['r/n/yjs:abc1234'])
  })

  it('never waits for an mcp image', async () => {
    const inspect = vi.fn(async (_ref: string) => true)
    await waitForImages({ registry: 'r', namespace: 'n', tag: TAG, inspect, sleep: noSleep, log: noLog })
    const inspectedRefs = inspect.mock.calls.map((c) => c[0])
    expect(inspectedRefs.some((ref) => ref.includes('/mcp:'))).toBe(false)
  })

  it('waits only for the explicit services override', async () => {
    const inspect = vi.fn(async (_ref: string) => true)
    await waitForImages({ registry: 'r', namespace: 'n', tag: TAG, inspect, services: ['backend', 'cdc', 'frontend'], sleep: noSleep, log: noLog })
    const inspectedRefs = inspect.mock.calls.map((c) => c[0])
    expect(inspectedRefs).toEqual(['r/n/backend:abc1234', 'r/n/cdc:abc1234', 'r/n/frontend:abc1234'])
    expect(inspectedRefs.some((ref) => ref.includes('/yjs:'))).toBe(false)
  })
})

describe('parseArgs', () => {
  it('parses required flags and applies defaults', () => {
    expect(parseArgs(['--registry', 'rg.x', '--ns', 'cella', '--tag', TAG])).toEqual({
      registry: 'rg.x',
      namespace: 'cella',
      tag: TAG,
      attempts: 80,
      intervalMs: 15000,
    })
  })

  it('throws when a required flag is missing', () => {
    expect(() => parseArgs(['--registry', 'rg.x', '--tag', TAG])).toThrow(/Usage/)
  })

  it('leaves services undefined when no override is given', () => {
    expect(parseArgs(['--registry', 'rg.x', '--ns', 'cella', '--tag', TAG]).services).toBeUndefined()
  })

  it('parses a build matrix JSON override', () => {
    const matrix = JSON.stringify([{ service: 'backend' }, { service: 'mcp' }, { service: 'frontend' }, { service: 'bogus' }])
    expect(imageServicesFromBuildMatrix(matrix)).toEqual(['backend', 'frontend'])
    expect(parseArgs(['--registry', 'rg.x', '--ns', 'cella', '--tag', TAG, '--build-images-json', matrix]).services).toEqual(['backend', 'frontend'])
  })
})
