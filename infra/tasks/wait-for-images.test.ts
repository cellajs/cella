import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { IMAGE_REUSE, imageRef, imageServices, parseArgs, TAGGED_SERVICES, waitForImages } from './wait-for-images.js'

const TAG = 'abc1234'

describe('service lists stay in lockstep with infra source', () => {
  // Read the real modules as text (same pattern as deploy-tags.test.ts) so the
  // hardcoded TAGGED_SERVICES here can't drift from the canonical definitions
  // without failing a test.
  const reconcilerSrc = readFileSync(resolve(__dirname, '../reconciler/index.ts'), 'utf-8')
  const deployTagsSrc = readFileSync(resolve(__dirname, '../modules/deploy-tags.ts'), 'utf-8')

  it('matches reconcilerServices in infra/reconciler/index.ts', () => {
    for (const svc of TAGGED_SERVICES) {
      expect(reconcilerSrc, `reconcilerServices missing '${svc}'`).toContain(`'${svc}'`)
    }
  })

  it('matches taggedServices in infra/modules/deploy-tags.ts', () => {
    for (const svc of TAGGED_SERVICES) {
      expect(deployTagsSrc, `taggedServices missing '${svc}'`).toContain(`'${svc}'`)
    }
  })
})

describe('imageServices', () => {
  it('excludes services that reuse another image', () => {
    expect(imageServices()).toEqual(['backend', 'cdc', 'yjs', 'frontend'])
  })

  it('excludes exactly the reuse-mapped services from the tagged set', () => {
    const reused = Object.keys(IMAGE_REUSE)
    const expected = TAGGED_SERVICES.filter((s) => !reused.includes(s))
    expect(imageServices()).toEqual(expected)
  })

  it('maps ai onto the backend image', () => {
    expect(IMAGE_REUSE.ai).toBe('backend')
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

  it('never waits for an ai image', async () => {
    const inspect = vi.fn(async (_ref: string) => true)
    await waitForImages({ registry: 'r', namespace: 'n', tag: TAG, inspect, sleep: noSleep, log: noLog })
    const inspectedRefs = inspect.mock.calls.map((c) => c[0])
    expect(inspectedRefs.some((ref) => ref.includes('/ai:'))).toBe(false)
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

  it('parses a --services override, restricting to known image services', () => {
    // `ai` (reuse-only) and `bogus` (unknown) are dropped; order is preserved.
    expect(parseArgs(['--registry', 'rg.x', '--ns', 'cella', '--tag', TAG, '--services', 'backend,ai,frontend,bogus']).services).toEqual([
      'backend',
      'frontend',
    ])
  })

  it('leaves services undefined when --services is omitted', () => {
    expect(parseArgs(['--registry', 'rg.x', '--ns', 'cella', '--tag', TAG]).services).toBeUndefined()
  })
})
