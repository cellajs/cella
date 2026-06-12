import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSecretManagerClient } from './scaleway-secret-manager'

type FetchArgs = { url: string; init: RequestInit }

function makeFetch(routes: Array<{ method: string; match: string; body: unknown; status?: number }>) {
  const calls: FetchArgs[] = []
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ url, init })

    const route = routes.find((candidate) => candidate.method === method && url.includes(candidate.match))
    if (!route) {
      return new Response(`no mock for ${method} ${url}`, { status: 599 })
    }

    if (route.status === 204) {
      return new Response(null, { status: 204 })
    }

    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { fn, calls }
}

const baseOptions = {
  secretKey: 'caller-secret',
  region: 'nl-ams',
  projectId: 'proj-1',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSecretManagerClient', () => {
  it('lists secrets under a path', async () => {
    const { fn, calls } = makeFetch([
      {
        method: 'GET',
        match: '/secret-manager/v1beta1/regions/nl-ams/secrets?',
        body: { secrets: [{ id: 'secret-1', name: 'cookie-secret', path: '/demo-production/' }], total_count: 1 },
      },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    const secrets = await client.listSecrets('/demo-production/')

    expect(secrets).toEqual([{ id: 'secret-1', name: 'cookie-secret', path: '/demo-production/' }])
    expect(calls[0]?.url).toContain('project_id=proj-1')
    // Trailing slash is normalized away: Scaleway stores/filters paths without it.
    expect(calls[0]?.url).toContain('path=%2Fdemo-production')
    expect(calls[0]?.url).not.toContain('path=%2Fdemo-production%2F')
    expect(calls[0]?.url).toContain('scheduled_for_deletion=false')
  })

  it('reuses an existing secret container in ensureSecret', async () => {
    const { fn, calls } = makeFetch([
      {
        method: 'GET',
        match: '/secret-manager/v1beta1/regions/nl-ams/secrets?',
        body: { secrets: [{ id: 'secret-1', name: 'cookie-secret', path: '/demo-production/' }], total_count: 1 },
      },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    const secret = await client.ensureSecret({
      name: 'cookie-secret',
      path: '/demo-production/',
      description: 'Cookie signing secret',
    })

    expect(secret.id).toBe('secret-1')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).not.toContain('name=')
  })

  it('finds an existing container when stored path has no trailing slash but lookup uses one', async () => {
    // Regression: Scaleway normalizes `/demo-production/` → `/demo-production`
    // on store. A re-run that looks up with the trailing slash must still find
    // the container, otherwise ensureSecret POSTs a duplicate (400).
    const { fn } = makeFetch([
      {
        method: 'GET',
        match: '/secret-manager/v1beta1/regions/nl-ams/secrets?',
        body: { secrets: [{ id: 'secret-9', name: 'vm-reader-key', path: '/demo-production' }], total_count: 1 },
      },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    const secret = await client.getSecretByName('vm-reader-key', '/demo-production/')

    expect(secret?.id).toBe('secret-9')
  })

  it('creates a new secret container when ensureSecret does not find one', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/secret-manager/v1beta1/regions/nl-ams/secrets?', body: { secrets: [], total_count: 0 } },
      { method: 'POST', match: '/secret-manager/v1beta1/regions/nl-ams/secrets', body: { id: 'secret-2', name: 'cdc-secret', path: '/demo-production/' } },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    const secret = await client.ensureSecret({
      name: 'cdc-secret',
      path: '/demo-production/',
      description: 'CDC authentication secret',
      protect: true,
    })

    expect(secret.id).toBe('secret-2')
    const createCall = calls.find((call) => call.init.method === 'POST')
    expect(createCall).toBeDefined()
    expect(JSON.parse(createCall!.init.body as string)).toMatchObject({
      project_id: 'proj-1',
      name: 'cdc-secret',
      path: '/demo-production/',
      protected: true,
    })
  })

  it('creates a new version with base64 encoded data', async () => {
    const { fn, calls } = makeFetch([
      { method: 'POST', match: '/secrets/secret-3/versions', body: { revision: 2 } },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    await client.putSecretValue({ secretId: 'secret-3', value: 'super-secret', disablePrevious: true })

    const createVersion = calls[0]
    expect(createVersion?.url).toContain('/secrets/secret-3/versions')
    expect(JSON.parse(createVersion!.init.body as string)).toMatchObject({
      data: Buffer.from('super-secret', 'utf8').toString('base64'),
      disable_previous: true,
    })
  })

  it('accesses and decodes the latest secret value', async () => {
    const { fn } = makeFetch([
      {
        method: 'GET',
        match: '/secrets/secret-4/versions/latest/access',
        body: {
          secret_id: 'secret-4',
          revision: 3,
          data: Buffer.from('decoded-value', 'utf8').toString('base64'),
        },
      },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    const value = await client.accessLatestValue('secret-4')

    expect(value).toBe('decoded-value')
  })

  it('deletes an entire secret object', async () => {
    const { fn, calls } = makeFetch([
      { method: 'DELETE', match: '/secrets/secret-5', body: {}, status: 204 },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    await client.deleteSecret('secret-5')

    expect(calls[0]?.url).toContain('/secrets/secret-5')
    expect(calls[0]?.init.method).toBe('DELETE')
  })

  it('throws a useful error on Scaleway failures', async () => {
    const { fn } = makeFetch([
      {
        method: 'GET',
        match: '/secret-manager/v1beta1/regions/nl-ams/secrets?',
        body: { message: 'forbidden' },
        status: 403,
      },
    ])
    vi.stubGlobal('fetch', fn)

    const client = createSecretManagerClient({ ...baseOptions, fetchImpl: fn })
    await expect(client.listSecrets('/demo-production/')).rejects.toThrow(/403.*forbidden/)
  })
})