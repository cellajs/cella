import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { provisionScopedKey, type ScopedKeyConfig } from './scaleway-iam'

type FetchArgs = { url: string; init: RequestInit }

/**
 * Build a fetch mock that matches requests by (method, url-substring) and
 * records every call for assertion. Mirrors the helper in setup-ci-key.test.ts.
 */
function makeFetch(routes: Array<{ method: string; match: string; body: unknown; status?: number }>) {
  const calls: FetchArgs[] = []
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ url, init })

    const route = routes.find((r) => r.method === method && url.includes(r.match))
    if (!route) {
      return new Response(`no mock for ${method} ${url}`, { status: 599 })
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { fn, calls }
}

const baseOpts = {
  callerSecretKey: 'caller-secret',
  organizationId: 'org-1',
  projectId: 'proj-1',
  slug: 'demo',
  log: () => {},
}

const config: ScopedKeyConfig = {
  suffix: 'demo-key',
  appDescription: 'demo application',
  policyDescription: 'demo policy',
  buildRules: ({ projectId }) => [{ permission_set_names: ['ObjectStorageReadOnly'], project_ids: [projectId] }],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-22T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('provisionScopedKey', () => {
  it('derives app/policy names from slug + suffix and applies config rules', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [] } },
      { method: 'POST', match: '/iam/v1alpha1/applications', body: { id: 'app-new', name: 'demo-demo-key' } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [] } },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-new', name: 'demo-demo-key-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-new' } },
    ])
    vi.stubGlobal('fetch', fn)

    const result = await provisionScopedKey(baseOpts, config)

    expect(result).toMatchObject({ accessKey: 'SCWNEW', secretKey: 'sekret', applicationId: 'app-new', organizationId: 'org-1' })

    const appCreate = calls.find((c) => c.url.endsWith('/applications') && c.init.method === 'POST')!
    expect(JSON.parse(appCreate.init.body as string)).toMatchObject({ name: 'demo-demo-key', description: 'demo application' })

    const policyCreate = calls.find((c) => c.url.endsWith('/policies') && c.init.method === 'POST')!
    const policyBody = JSON.parse(policyCreate.init.body as string)
    expect(policyBody.name).toBe('demo-demo-key-policy')
    expect(policyBody.rules).toEqual([{ permission_set_names: ['ObjectStorageReadOnly'], project_ids: ['proj-1'] }])

    const keyCreate = calls.find((c) => c.url.endsWith('/api-keys') && c.init.method === 'POST')!
    expect(JSON.parse(keyCreate.init.body as string).description).toContain('demo-key — rotated 2026-05-22')
  })

  it('reuses an existing application, recreates the policy, and purges orphan keys', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-demo-key' }] } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'demo-demo-key-policy' }] } },
      { method: 'DELETE', match: '/iam/v1alpha1/policies/pol-1', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-demo-key-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [{ access_key: 'OLD1' }, { access_key: 'OLD2' }] } },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/OLD1', body: {} },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/OLD2', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 's', application_id: 'app-1' } },
    ])
    vi.stubGlobal('fetch', fn)

    await provisionScopedKey(baseOpts, config)

    expect(calls.some((c) => c.url.includes('/applications') && c.init.method === 'POST')).toBe(false)
    expect(calls.some((c) => c.url.includes('/policies/pol-1') && c.init.method === 'DELETE')).toBe(true)
    const apiKeyDeletes = calls.filter((c) => c.init.method === 'DELETE' && c.url.includes('/api-keys/'))
    expect(apiKeyDeletes.map((c) => c.url)).toEqual([
      expect.stringContaining('/api-keys/OLD1'),
      expect.stringContaining('/api-keys/OLD2'),
    ])
  })

  it('resolves organization id from project when not provided', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/account/v3/projects/proj-1', body: { organization_id: 'org-resolved' } },
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-demo-key' }] } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [] } },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-demo-key-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCW', secret_key: 's', application_id: 'app-1' } },
    ])
    vi.stubGlobal('fetch', fn)

    const result = await provisionScopedKey({ ...baseOpts, organizationId: undefined }, config)

    expect(result.organizationId).toBe('org-resolved')
    const scopedCalls = calls.filter(
      (c) => c.init.method === 'GET' && (c.url.includes('/applications?') || c.url.includes('/policies?')),
    )
    expect(scopedCalls.length).toBeGreaterThan(0)
    for (const c of scopedCalls) {
      expect(c.url).toContain('organization_id=org-resolved')
    }
  })

  it('throws with a useful message on Scaleway error responses', async () => {
    const { fn } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { message: 'forbidden' }, status: 403 },
    ])
    vi.stubGlobal('fetch', fn)

    await expect(provisionScopedKey(baseOpts, config)).rejects.toThrow(/403.*forbidden/)
  })

  it('skips all policy calls when managePolicy is false (policy owned by Pulumi)', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-demo-key' }] } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 's', application_id: 'app-1' } },
    ])
    vi.stubGlobal('fetch', fn)

    const result = await provisionScopedKey(baseOpts, { ...config, managePolicy: false })

    expect(result).toMatchObject({ accessKey: 'SCWNEW', applicationId: 'app-1' })
    // No policy reads, deletes, or creates — Pulumi owns the policy resource.
    expect(calls.some((c) => c.url.includes('/policies'))).toBe(false)
  })

  it('does not require buildRules when managePolicy is false', async () => {
    const { fn } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-demo-key' }] } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 's', application_id: 'app-1' } },
    ])
    vi.stubGlobal('fetch', fn)

    const { buildRules: _drop, ...noRules } = config
    await expect(provisionScopedKey(baseOpts, { ...noRules, managePolicy: false })).resolves.toMatchObject({ accessKey: 'SCWNEW' })
  })

  it('throws when managePolicy is enabled but buildRules is missing', async () => {
    const { fn } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-demo-key' }] } },
    ])
    vi.stubGlobal('fetch', fn)

    const { buildRules: _drop, ...noRules } = config
    await expect(provisionScopedKey(baseOpts, noRules)).rejects.toThrow(/buildRules is required/)
  })
})
