/**
 * Smoke tests for `infra/modules/network.ts` — proves the mock harness can
 * render a Pulumi module end-to-end without a Scaleway provider.
 *
 * State is shared across the file: Node ESM caches the module, so a second
 * `await import(...)` would not re-execute its top-level resource constructors.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { flushPulumi, installPulumiMocks, type MockHarness } from '../helpers/pulumi-mock.js'

let h: MockHarness

beforeAll(async () => {
  // bootstrap:applyInProgress gates compute off, which keeps the
  // image-tag pin assertion in helpers.ts from firing in unit tests that
  // don't care about compute.
  h = await installPulumiMocks({ stack: 'production', config: { 'bootstrap:applyInProgress': 'test' } })
  await import('../../modules/network.js')
  await flushPulumi()
})

describe('network module', () => {
  it('creates at least one VPC and one PrivateNetwork', () => {
    const types = h.resources.map((r) => r.type)
    const vpcs = types.filter((t) => /vpc/i.test(t) && !/privateNetwork/i.test(t))
    const pns = types.filter((t) => /privateNetwork/i.test(t))
    expect(types.length, `captured: ${types.join(', ')}`).toBeGreaterThan(0)
    expect(vpcs.length).toBeGreaterThanOrEqual(1)
    expect(pns.length).toBeGreaterThanOrEqual(1)
  })

  it('private network is scoped to an RFC1918 IPv4 range', () => {
    const pn = h.resources.find((r) => /privateNetwork/i.test(r.type))
    expect(pn).toBeDefined()
    // biome-ignore lint/suspicious/noExplicitAny: raw pulumi mock input state
    const subnet = (pn!.inputs.ipv4Subnet as any)?.subnet as string
    expect(subnet).toMatch(/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/)
  })

  it('every captured resource carries the standard tag set', () => {
    expect(h.resources.length).toBeGreaterThan(0)
    for (const r of h.resources) {
      expect(r.inputs.tags, `${r.name} should be tagged`).toBeDefined()
    }
  })
})
