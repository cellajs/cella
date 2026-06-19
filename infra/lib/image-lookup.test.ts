import { describe, expect, it, vi } from 'vitest'
import { type FetchLike, lookupImageByName } from './image-lookup'

const NAME = 'cella-docker-node-agent-v1'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) }
}

describe('lookupImageByName', () => {
  it('reports not-found when no image matches', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ images: [] })) as unknown as FetchLike
    const out = await lookupImageByName({ secretKey: 'k', zone: 'nl-ams-1', name: NAME, fetchImpl })
    expect(out).toEqual({ exists: false, count: 0 })
  })

  it('ignores prefix/substring matches the API returns, keeping only exact names', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ images: [{ id: 'a', name: `${NAME}-old` }, { id: 'b', name: 'other' }] }),
    ) as unknown as FetchLike
    const out = await lookupImageByName({ secretKey: 'k', zone: 'nl-ams-1', name: NAME, fetchImpl })
    expect(out.exists).toBe(false)
  })

  it('returns the newest image when several share the exact name', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        images: [
          { id: 'old', name: NAME, modification_date: '2026-06-01T00:00:00Z' },
          { id: 'new', name: NAME, modification_date: '2026-06-19T00:00:00Z' },
        ],
      }),
    ) as unknown as FetchLike
    const out = await lookupImageByName({ secretKey: 'k', zone: 'nl-ams-1', name: NAME, fetchImpl })
    expect(out).toEqual({ exists: true, count: 2, newest: { id: 'new', name: NAME } })
  })

  it('scopes the query to zone + project and authenticates', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ images: [{ id: 'a', name: NAME }] })) as unknown as FetchLike
    await lookupImageByName({ secretKey: 'secret', zone: 'nl-ams-1', name: NAME, projectId: 'proj-1', fetchImpl })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/instance/v1/zones/nl-ams-1/images?')
    expect(url).toContain(`name=${encodeURIComponent(NAME)}`)
    expect(url).toContain('project=proj-1')
    expect(init.headers['X-Auth-Token']).toBe('secret')
  })

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'denied' }, false, 403)) as unknown as FetchLike
    await expect(lookupImageByName({ secretKey: 'k', zone: 'nl-ams-1', name: NAME, fetchImpl })).rejects.toThrow(/403/)
  })
})
