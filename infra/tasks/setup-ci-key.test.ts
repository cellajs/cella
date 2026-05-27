import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupCiKey } from './setup-ci-key.js'

type FetchArgs = { url: string; init: RequestInit }

/**
 * Build a fetch mock that matches requests by (method, url-substring) and
 * records every call for assertion.
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-22T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('setupCiKey', () => {
  it('reuses existing application, recreates policy, mints a new API key', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-ci-deploy' }] } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'demo-ci-deploy-policy' }] } },
      { method: 'DELETE', match: '/iam/v1alpha1/policies/pol-1', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-ci-deploy-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-1' } },
    ])
    vi.stubGlobal('fetch', fn)

    const result = await setupCiKey(baseOpts)

    expect(result).toMatchObject({ accessKey: 'SCWNEW', secretKey: 'sekret', applicationId: 'app-1' })
    expect(fn).toHaveBeenCalledTimes(6)

    // Application reused (no POST), policy always recreated (DELETE + POST).
    expect(calls.some((c) => c.url.includes('/applications') && c.init.method === 'POST')).toBe(false)
    expect(calls.some((c) => c.url.includes('/policies/pol-1') && c.init.method === 'DELETE')).toBe(true)
    expect(calls.some((c) => c.url.endsWith('/policies') && c.init.method === 'POST')).toBe(true)

    // API key request includes today's date in description.
    const apiKeyCall = calls.find((c) => c.url.endsWith('/api-keys') && c.init.method === 'POST')!
    const body = JSON.parse(apiKeyCall.init.body as string)
    expect(body).toMatchObject({
      application_id: 'app-1',
      default_project_id: 'proj-1',
      description: expect.stringContaining('2026-05-22'),
    })

    // Auth header propagated.
    expect((apiKeyCall.init.headers as Record<string, string>)['X-Auth-Token']).toBe('caller-secret')
  })

  it('creates application + policy when neither exists', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [] } },
      { method: 'POST', match: '/iam/v1alpha1/applications', body: { id: 'app-new', name: 'demo-ci-deploy' } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [] } },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-new', name: 'demo-ci-deploy-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-new' } },
    ])
    vi.stubGlobal('fetch', fn)

    const result = await setupCiKey(baseOpts)

    expect(result.applicationId).toBe('app-new')
    expect(fn).toHaveBeenCalledTimes(6)

    const appCreate = calls.find((c) => c.url.endsWith('/applications') && c.init.method === 'POST')!
    expect(JSON.parse(appCreate.init.body as string)).toMatchObject({
      name: 'demo-ci-deploy',
      organization_id: 'org-1',
    })

    const policyCreate = calls.find((c) => c.url.endsWith('/policies') && c.init.method === 'POST')!
    const policyBody = JSON.parse(policyCreate.init.body as string)
    expect(policyBody.application_id).toBe('app-new')
    expect(policyBody.rules).toHaveLength(2)
    // Project-scoped rule binds to project id.
    expect(policyBody.rules[0].project_ids).toEqual(['proj-1'])
    expect(policyBody.rules[0].permission_set_names).toContain('ObjectStorageFullAccess')
    // Org-scoped rule covers DNS.
    expect(policyBody.rules[1].organization_id).toBe('org-1')
    expect(policyBody.rules[1].permission_set_names).toContain('DomainsDNSFullAccess')
  })

  it('resolves organization id from project when not provided', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/account/v3/projects/proj-1', body: { organization_id: 'org-resolved' } },
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-ci-deploy' }] } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'demo-ci-deploy-policy' }] } },
      { method: 'DELETE', match: '/iam/v1alpha1/policies/pol-1', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-ci-deploy-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCW', secret_key: 's', application_id: 'app-1' } },
    ])
    vi.stubGlobal('fetch', fn)

    await setupCiKey({ ...baseOpts, organizationId: undefined })

    // Subsequent applications/policies list calls should carry the resolved org id.
    const scopedCalls = calls.filter(
      (c) => c.init.method === 'GET' && (c.url.includes('/applications?') || c.url.includes('/policies?')),
    )
    expect(scopedCalls.length).toBeGreaterThan(0)
    for (const c of scopedCalls) {
      expect(c.url).toContain('organization_id=org-resolved')
    }
  })

  it('deletes pre-existing API keys before minting a fresh one', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-ci-deploy' }] } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'demo-ci-deploy-policy' }] } },
      { method: 'DELETE', match: '/iam/v1alpha1/policies/pol-1', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-ci-deploy-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [{ access_key: 'SCWOLD1' }, { access_key: 'SCWOLD2' }] } },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/SCWOLD1', body: {} },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/SCWOLD2', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-1' } },
    ])
    vi.stubGlobal('fetch', fn)

    await setupCiKey(baseOpts)

    const apiKeyDeletes = calls.filter((c) => c.init.method === 'DELETE' && c.url.includes('/api-keys/'))
    expect(apiKeyDeletes.map((c) => c.url)).toEqual([
      expect.stringContaining('/api-keys/SCWOLD1'),
      expect.stringContaining('/api-keys/SCWOLD2'),
    ])
  })

  it('throws with a useful message on Scaleway error responses', async () => {
    const { fn } = makeFetch([
      {
        method: 'GET',
        match: '/iam/v1alpha1/applications?',
        body: { message: 'forbidden', type: 'permissions_denied' },
        status: 403,
      },
    ])
    vi.stubGlobal('fetch', fn)

    await expect(setupCiKey(baseOpts)).rejects.toThrow(/403.*forbidden/)
  })
})
