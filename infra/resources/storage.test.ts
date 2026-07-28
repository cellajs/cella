import { beforeAll, describe, expect, it } from 'vitest'
import { flushPulumi, installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock'

let h: MockHarness

beforeAll(async () => {
  h = await installPulumiMocks({
    stack: 'production',
// Deferring compute skips image-pin validation because these tests render only storage.
// The mock IAM API supplies CI and VM application IDs normally absent from stack config.
    config: { 'bootstrap:computeDeferred': 'test' },
  })
  await import('./storage')
  await flushPulumi()
})

describe('storage module', () => {
  it('creates exactly four Object Storage buckets', () => {
    const buckets = h.resources.filter(
      (r) => /bucket(?!Policy|Website)/i.test(r.type) && !/Policy|Website/i.test(r.type),
    )
    expect(buckets.map((b) => b.name).sort(), `captured: ${h.resources.map((r) => r.type).join(', ')}`).toEqual(
      ['boot-diag-bucket', 'frontend-bucket', 'private-uploads-bucket', 'public-uploads-bucket'],
    )
  })

  it('public buckets (frontend, public-uploads) carry a Principal:* read policy', () => {
    const policies = h.resources.filter((r) => /bucketPolicy/i.test(r.type))
    const named = Object.fromEntries(policies.map((p) => [p.name, p]))

    expect(named['frontend-policy']).toBeDefined()
    expect(named['public-uploads-policy']).toBeDefined()

    for (const name of ['frontend-policy', 'public-uploads-policy']) {
      const policyJson = String(named[name]?.inputs.policy ?? '')
      expect(policyJson, `${name} should reference Principal:*`).toMatch(/"Principal"\s*:\s*"\*"/)
      expect(policyJson, `${name} should allow s3:GetObject`).toMatch(/s3:GetObject/)
    }
  })

  it('private uploads bucket has NO public BucketPolicy', () => {
    const policies = h.resources.filter((r) => /bucketPolicy/i.test(r.type))
    const privatePolicies = policies.filter((p) => /private/i.test(p.name))
    expect(privatePolicies).toHaveLength(0)
  })

  it('boot diagnostics bucket grants VM write to boot-diag/ only, never public read', () => {
    const policies = h.resources.filter((r) => /bucketPolicy/i.test(r.type))
    const policy = policies.find((p) => p.name === 'boot-diag-policy')
    expect(policy).toBeDefined()
    const policyJson = String(policy?.inputs.policy ?? '')
    expect(policyJson).not.toMatch(/"Principal"\s*:\s*"\*"/)
    expect(policyJson).toMatch(/VmWriteBootDiagnostics/)
    expect(policyJson).toMatch(/application_id:/)
    expect(policyJson).toMatch(/s3:PutObject/)
    expect(policyJson).toMatch(/boot-diag\/*/)
    const parsed = JSON.parse(policyJson) as { Statement: Array<{ Sid: string; Action: string[]; Resource: string[] }> }
    const vmWrite = parsed.Statement.find((s) => s.Sid === 'VmWriteBootDiagnostics')
    expect(vmWrite?.Action).toEqual(['s3:PutObject'])
    // Derive the bucket name from the captured resource so this holds for any fork slug.
    const bootDiagBucketName = String(h.resources.find((r) => r.name === 'boot-diag-bucket')?.inputs.name ?? '')
    expect(vmWrite?.Resource).toEqual([`${bootDiagBucketName}/boot-diag/*`])
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

  it('provisions no S3 website hosting (Caddy owns the SPA fallback over the REST endpoint)', () => {
    expect(h.resources.filter((r) => /bucketWebsiteConfiguration/i.test(r.type))).toHaveLength(0)
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

  it('frontend bucket purges noncurrent versions and orphaned delete markers', () => {
    const bucket = h.resources.find((r) => r.name === 'frontend-bucket')
    expect(bucket).toBeDefined()
    // biome-ignore lint/suspicious/noExplicitAny: raw input shape
    const rules = (bucket?.inputs.lifecycleRules as any[]) ?? []
    const rule = rules.find((r) => r.id === 'cleanup-old-versions')
    expect(rule, 'cleanup-old-versions lifecycle rule must exist').toBeDefined()
    expect(rule.enabled).toBe(true)
    // Noncurrent versions keep their original keys: they are not addressable
    // via a key prefix, so cleanup must use noncurrentVersionExpiration. A
    // prefix-scoped expiration matches nothing and retains versions forever.
    expect(rule.prefix ?? '').toBe('')
    expect(rule.noncurrentVersionExpiration?.noncurrentDays).toBeGreaterThan(0)
    expect(rule.expiration?.expiredObjectDeleteMarker).toBe(true)
    expect(rule.expiration?.days, 'expiredObjectDeleteMarker cannot combine with expiration.days').toBeUndefined()
  })

  it('boot diagnostics bucket expires old boot-diag objects', () => {
    const bucket = h.resources.find((r) => r.name === 'boot-diag-bucket')
    expect(bucket).toBeDefined()
    // biome-ignore lint/suspicious/noExplicitAny: raw input shape
    const rules = (bucket?.inputs.lifecycleRules as any[]) ?? []
    const rule = rules.find((r) => r.id === 'expire-boot-diag')
    expect(rule).toBeDefined()
    expect(rule.enabled).toBe(true)
    expect(rule.prefix).toBe('boot-diag/')
    expect(rule.expiration?.days).toBe(30)
  })
})
