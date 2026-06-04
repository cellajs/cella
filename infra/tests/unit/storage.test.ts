/**
 * Smoke tests for `infra/modules/storage.ts` — guards the public/private
 * access split between the three buckets.
 *
 * Critical invariants:
 *   - Frontend + public-uploads buckets MUST have a BucketPolicy that grants
 *     Principal '*' s3:GetObject so the SPA + uploaded public assets are
 *     directly readable.
 *   - Private uploads bucket MUST NOT have a public BucketPolicy — access is
 *     gated by signed URLs only.
 *   - CORS on upload buckets must restrict allowedOrigins to the configured
 *     frontend URL (no '*').
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { flushPulumi, installPulumiMocks, type MockHarness } from '../helpers/pulumi-mock.js'

let h: MockHarness

beforeAll(async () => {
  h = await installPulumiMocks({
    stack: 'production',
    // bootstrap:applyInProgress gates compute off so helpers.ts skips the
    // image-tag pin assertion (these tests don't render compute).
    config: { 'infra:applicationId': '00000000-0000-0000-0000-000000000001', 'bootstrap:applyInProgress': 'test' },
  })
  await import('../../modules/storage.js')
  await flushPulumi()
})

describe('storage module', () => {
  it('creates exactly three Object Storage buckets', () => {
    const buckets = h.resources.filter(
      (r) => /bucket(?!Policy|Website)/i.test(r.type) && !/Policy|Website/i.test(r.type),
    )
    expect(buckets.map((b) => b.name).sort(), `captured: ${h.resources.map((r) => r.type).join(', ')}`).toEqual(
      ['frontend-bucket', 'private-uploads-bucket', 'public-uploads-bucket'],
    )
  })

  it('public buckets (frontend, public-uploads) carry a Principal:* read policy', () => {
    const policies = h.resources.filter((r) => /bucketPolicy/i.test(r.type))
    const named = Object.fromEntries(policies.map((p) => [p.name, p]))

    expect(named['frontend-policy']).toBeDefined()
    expect(named['public-uploads-policy']).toBeDefined()

    for (const name of ['frontend-policy', 'public-uploads-policy']) {
      const policyJson = String(named[name].inputs.policy ?? '')
      expect(policyJson, `${name} should reference Principal:*`).toMatch(/"Principal"\s*:\s*"\*"/)
      expect(policyJson, `${name} should allow s3:GetObject`).toMatch(/s3:GetObject/)
    }
  })

  it('private uploads bucket has NO public BucketPolicy', () => {
    const policies = h.resources.filter((r) => /bucketPolicy/i.test(r.type))
    const privatePolicies = policies.filter((p) => /private/i.test(p.name))
    expect(privatePolicies).toHaveLength(0)
  })

  it('upload buckets restrict CORS allowedOrigins (no wildcard)', () => {
    const uploadBuckets = h.resources.filter(
      (r) => /bucket(?!Policy|Website)/i.test(r.type) && !/Policy|Website/i.test(r.type) && /uploads/i.test(r.name),
    )
    expect(uploadBuckets.length).toBeGreaterThan(0)
    for (const b of uploadBuckets) {
      // biome-ignore lint/suspicious/noExplicitAny: raw input shape
      const cors = (b.inputs.corsRules as any[]) ?? []
      expect(cors.length, `${b.name} should have CORS rules`).toBeGreaterThan(0)
      for (const rule of cors) {
        expect(rule.allowedOrigins).not.toContain('*')
        expect(rule.allowedMethods).toEqual(expect.arrayContaining(['GET']))
      }
    }
  })

  it('frontend bucket has website configuration with index.html fallback', () => {
    const sites = h.resources.filter((r) => /bucketWebsiteConfiguration/i.test(r.type))
    expect(sites).toHaveLength(1)
    // biome-ignore lint/suspicious/noExplicitAny: raw input shape
    const idx = (sites[0].inputs.indexDocument as any)?.suffix
    // biome-ignore lint/suspicious/noExplicitAny: raw input shape
    const err = (sites[0].inputs.errorDocument as any)?.key
    expect(idx).toBe('index.html')
    expect(err).toBe('index.html')
  })

  it('frontend bucket expires stale assets/ chunks but never root entry files', () => {
    const bucket = h.resources.find((r) => r.name === 'frontend-bucket')
    expect(bucket).toBeDefined()
    // biome-ignore lint/suspicious/noExplicitAny: raw input shape
    const rules = (bucket?.inputs.lifecycleRules as any[]) ?? []
    const assetRule = rules.find((r) => r.id === 'expire-stale-assets')
    expect(assetRule, 'expire-stale-assets lifecycle rule must exist').toBeDefined()
    expect(assetRule.enabled).toBe(true)
    // Prefix-scoped to assets/ so root entry files (index.html, sw.js, ...) are untouched.
    expect(assetRule.prefix).toBe('assets/')
    expect(assetRule.expiration?.days).toBeGreaterThan(0)
  })
})
