import { describe, expect, it } from 'vitest'
import { archiveComputeImagesByName, type FetchLike } from './archive-compute-image'

interface Call {
  url: string
  method: string
  body?: string
}

function makeFetch(listImages: Array<{ id: string; name: string }>, opts: { listStatus?: number; patchStatus?: number } = {}) {
  const calls: Call[] = []
  const fn: FetchLike = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ url, method, body: init.body })
    if (method === 'GET') {
      const status = opts.listStatus ?? 200
      return { ok: status < 400, status, text: async () => (status < 400 ? JSON.stringify({ images: listImages }) : 'list error') }
    }
    const status = opts.patchStatus ?? 200
    return { ok: status < 400, status, text: async () => (status < 400 ? '{}' : 'patch error') }
  }
  return { fn, calls }
}

const base = {
  secretKey: 'secret-key',
  projectId: 'proj-1',
  zone: 'nl-ams-1',
  imageName: 'cella-docker-node-agent-v1',
  now: () => new Date('2026-06-20T10:00:00.000Z'),
}

describe('archiveComputeImagesByName', () => {
  it('renames each exact-name match to a unique archived name and returns their ids', async () => {
    const { fn, calls } = makeFetch([
      { id: 'aaaaaaaa-1111-2222-3333-444444444444', name: 'cella-docker-node-agent-v1' },
      { id: 'bbbbbbbb-1111-2222-3333-444444444444', name: 'cella-docker-node-agent-v1-archived-old' }, // prefix match, must be ignored
    ])

    const archived = await archiveComputeImagesByName({ ...base, fetchImpl: fn })

    expect(archived).toEqual(['aaaaaaaa-1111-2222-3333-444444444444'])
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0]?.url).toContain('/images/aaaaaaaa-1111-2222-3333-444444444444')
    expect(JSON.parse(patches[0]?.body ?? '{}').name).toBe('cella-docker-node-agent-v1-archived-2026-06-20T10-00-00-000-aaaaaaaa')
  })

  it('is a no-op when no image holds the stable name (fresh bootstrap)', async () => {
    const { fn, calls } = makeFetch([])
    const archived = await archiveComputeImagesByName({ ...base, fetchImpl: fn })
    expect(archived).toEqual([])
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
  })

  it('scopes the list query to the zone, project and name', async () => {
    const { fn, calls } = makeFetch([])
    await archiveComputeImagesByName({ ...base, fetchImpl: fn })
    expect(calls[0]?.url).toContain('/instance/v1/zones/nl-ams-1/images?')
    expect(calls[0]?.url).toContain('project=proj-1')
    expect(calls[0]?.url).toContain('name=cella-docker-node-agent-v1')
  })

  it('throws when the list call fails', async () => {
    const { fn } = makeFetch([], { listStatus: 403 })
    await expect(archiveComputeImagesByName({ ...base, fetchImpl: fn })).rejects.toThrow(/list images failed \(403\)/)
  })

  it('throws when a rename fails', async () => {
    const { fn } = makeFetch([{ id: 'aaaaaaaa-1111-2222-3333-444444444444', name: 'cella-docker-node-agent-v1' }], { patchStatus: 409 })
    await expect(archiveComputeImagesByName({ ...base, fetchImpl: fn })).rejects.toThrow(/rename image .* failed \(409\)/)
  })
})
