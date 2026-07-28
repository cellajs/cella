import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../utils/fetch-like'
import { resolveDnsProjectIds, resolveDnsZoneProjectId } from './dns-zone-project'

function zonesFetch(zones: Array<{ domain: string; subdomain: string; project_id: string }>): FetchLike {
  return vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ dns_zones: zones }) }))
}

const auth = (fetchImpl: FetchLike) => ({ secretKey: 'sk', fetchImpl })

describe('resolveDnsZoneProjectId', () => {
  it('matches the exact zone', async () => {
    const fetchImpl = zonesFetch([{ domain: 'cella.dev', subdomain: '', project_id: 'proj-apex' }])
    await expect(resolveDnsZoneProjectId(auth(fetchImpl), 'cella.dev')).resolves.toBe('proj-apex')
  })

  it('matches the parent zone serving a subdomain (staging on the production apex)', async () => {
    const fetchImpl = zonesFetch([{ domain: 'cella.dev', subdomain: '', project_id: 'proj-apex' }])
    await expect(resolveDnsZoneProjectId(auth(fetchImpl), 'staging.cella.dev')).resolves.toBe('proj-apex')
  })

  it('prefers the most specific zone over the apex', async () => {
    const fetchImpl = zonesFetch([
      { domain: 'cella.dev', subdomain: '', project_id: 'proj-apex' },
      { domain: 'cella.dev', subdomain: 'staging', project_id: 'proj-staging' },
    ])
    await expect(resolveDnsZoneProjectId(auth(fetchImpl), 'staging.cella.dev')).resolves.toBe('proj-staging')
  })

  it('does not suffix-match unrelated domains', async () => {
    const fetchImpl = zonesFetch([{ domain: 'lla.dev', subdomain: '', project_id: 'proj-other' }])
    await expect(resolveDnsZoneProjectId(auth(fetchImpl), 'cella.dev')).resolves.toBeUndefined()
  })

  it('returns undefined for an empty dnsZone without calling the API', async () => {
    const fetchImpl = zonesFetch([])
    await expect(resolveDnsZoneProjectId(auth(fetchImpl), '')).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('resolveDnsProjectIds', () => {
  it('returns app project + zone project when they differ', async () => {
    const fetchImpl = zonesFetch([{ domain: 'cella.dev', subdomain: '', project_id: 'proj-apex' }])
    await expect(resolveDnsProjectIds(auth(fetchImpl), 'staging.cella.dev', 'proj-app')).resolves.toEqual(['proj-app', 'proj-apex'])
  })

  it('deduplicates when the zone lives in the app project', async () => {
    const fetchImpl = zonesFetch([{ domain: 'cella.dev', subdomain: '', project_id: 'proj-app' }])
    await expect(resolveDnsProjectIds(auth(fetchImpl), 'cella.dev', 'proj-app')).resolves.toEqual(['proj-app'])
  })

  it('falls back to the app project when the zone lookup fails', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 403, text: async () => '{"message":"forbidden"}' })
    await expect(resolveDnsProjectIds(auth(fetchImpl), 'cella.dev', 'proj-app')).resolves.toEqual(['proj-app'])
  })
})
