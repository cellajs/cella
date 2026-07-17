import { describe, expect, it, vi } from 'vitest'
import { createRdbClient, type RdbClient, waitForBackupReady } from './scaleway-rdb'

type Call = { url: string; method: string; body: unknown }

/**
 * Fetch stub recording method/url/body. The URL and verb of every write are asserted below because
 * they were captured from the live API (`scw --debug`) rather than read from docs — a silent drift
 * here would only ever be discovered by a destructive call in production.
 */
function makeFetch(routes: Array<{ method: string; match: string; body?: unknown; status?: number }>) {
  const calls: Call[] = []
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ url, method, body: init.body ? JSON.parse(init.body as string) : undefined })

    const route = routes.find((candidate) => candidate.method === method && url.includes(candidate.match))
    if (!route) return new Response(`no mock for ${method} ${url}`, { status: 599 })
    if (route.status === 204) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  })
  return { fn, calls }
}

const client = (fetchImpl: ReturnType<typeof makeFetch>['fn']) =>
  createRdbClient({ secretKey: 'scw-secret', region: 'nl-ams', fetchImpl })

describe('createRdbClient', () => {
  it('finds an instance by exact name', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/instances', body: { instances: [{ id: 'i-1', name: 'cella-postgres', status: 'ready' }], total_count: 1 } },
    ])

    const found = await client(fn).findInstance('cella-postgres')

    expect(found).toMatchObject({ id: 'i-1', status: 'ready' })
    expect(calls[0]).toMatchObject({ url: 'https://api.scaleway.com/rdb/v1/regions/nl-ams/instances?name=cella-postgres' })
  })

  it('does not accept a prefix match for an instance name', async () => {
    // `?name=` is a filter, not an exact match — `cella` must never resolve to `cella-staging`.
    const { fn } = makeFetch([
      { method: 'GET', match: '/instances', body: { instances: [{ id: 'i-2', name: 'cella-postgres-staging', status: 'ready' }], total_count: 1 } },
    ])

    expect(await client(fn).findInstance('cella-postgres')).toBeUndefined()
  })

  it('creates a database with POST .../databases', async () => {
    const { fn, calls } = makeFetch([{ method: 'POST', match: '/databases', body: { name: 'cella' } }])

    await client(fn).createDatabase('i-1', 'cella')

    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.scaleway.com/rdb/v1/regions/nl-ams/instances/i-1/databases',
      body: { name: 'cella' },
    })
  })

  it('deletes a database with DELETE .../databases/{name}', async () => {
    const { fn, calls } = makeFetch([{ method: 'DELETE', match: '/databases/', status: 204 }])

    await client(fn).deleteDatabase('i-1', 'cella')

    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      url: 'https://api.scaleway.com/rdb/v1/regions/nl-ams/instances/i-1/databases/cella',
    })
  })

  it('sets a privilege with PUT .../privileges', async () => {
    const { fn, calls } = makeFetch([
      { method: 'PUT', match: '/privileges', body: { database_name: 'cella', user_name: 'runtime_role', permission: 'all' } },
    ])

    await client(fn).setPrivilege('i-1', 'cella', 'runtime_role', 'all')

    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: 'https://api.scaleway.com/rdb/v1/regions/nl-ams/instances/i-1/privileges',
      body: { database_name: 'cella', user_name: 'runtime_role', permission: 'all' },
    })
  })

  it('creates a backup at the region root, not under the instance', async () => {
    const { fn, calls } = makeFetch([{ method: 'POST', match: '/backups', body: { id: 'bk-1', status: 'creating' } }])

    await client(fn).createBackup({ instanceId: 'i-1', databaseName: 'cella', name: 'pre-reset', expiresAt: '2026-07-24T00:00:00Z' })

    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.scaleway.com/rdb/v1/regions/nl-ams/backups',
      body: { instance_id: 'i-1', database_name: 'cella', name: 'pre-reset', expires_at: '2026-07-24T00:00:00Z' },
    })
  })

  it('omits expires_at when no retention is given', async () => {
    const { fn, calls } = makeFetch([{ method: 'POST', match: '/backups', body: { id: 'bk-1' } }])

    await client(fn).createBackup({ instanceId: 'i-1', databaseName: 'cella', name: 'pre-reset' })

    expect(calls[0]?.body).not.toHaveProperty('expires_at')
  })

  it('surfaces a failed API call rather than returning a partial result', async () => {
    const { fn } = makeFetch([{ method: 'DELETE', match: '/databases/', body: { message: 'denied' }, status: 403 }])

    await expect(client(fn).deleteDatabase('i-1', 'cella')).rejects.toThrow(/403/)
  })
})

describe('waitForBackupReady', () => {
  const stub = (statuses: string[]): RdbClient =>
    ({
      getBackup: vi.fn(async () => ({
        id: 'bk-1',
        name: 'pre-reset',
        database_name: 'cella',
        status: statuses.shift() ?? 'ready',
      })),
    }) as unknown as RdbClient

  it('polls until the backup reports ready', async () => {
    const client = stub(['creating', 'creating', 'ready'])

    const backup = await waitForBackupReady(client, 'bk-1', { intervalMs: 0, sleep: async () => {} })

    expect(backup.status).toBe('ready')
    expect(client.getBackup).toHaveBeenCalledTimes(3)
  })

  it('throws on an errored backup instead of waiting out the timeout', async () => {
    await expect(waitForBackupReady(stub(['error']), 'bk-1', { intervalMs: 0, sleep: async () => {} })).rejects.toThrow(/failed/)
  })

  it('throws once the deadline passes — the delete must not proceed on a stuck backup', async () => {
    let clock = 0
    const client = stub(Array(50).fill('creating'))

    await expect(
      waitForBackupReady(client, 'bk-1', {
        timeoutMs: 1_000,
        intervalMs: 400,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms
        },
      }),
    ).rejects.toThrow(/not ready after 1s \(status: creating\)/)
  })
})
