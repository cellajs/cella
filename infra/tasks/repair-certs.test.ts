import { describe, expect, it } from 'vitest'
import { type LiveCertStatus, planCertRepairs, type StateCert } from './repair-certs'

const cert = (name: string): StateCert => ({
  urn: `urn:pulumi:production::infra::scaleway:loadbalancers/certificate:Certificate::${name}`,
  id: `nl-ams-1/${name}-uuid`,
})

const live = (entries: Record<string, LiveCertStatus>): Map<string, LiveCertStatus> =>
  new Map(Object.entries(entries).map(([name, status]) => [`nl-ams-1/${name}-uuid`, status]))

describe('planCertRepairs', () => {
  it('repairs only errored certs, carrying the ACME detail as the reason', () => {
    const repairs = planCertRepairs(
      [cert('api'), cert('www'), cert('apex')],
      live({
        api: { status: 'ready' },
        www: { status: 'error', statusDetails: 'acme: NXDOMAIN looking up A for www.example.com' },
        apex: { status: 'pending' },
      }),
    )
    expect(repairs).toHaveLength(1)
    expect(repairs[0]).toMatchObject({ certId: 'www-uuid', zone: 'nl-ams-1', deleteLive: true })
    expect(repairs[0]!.reason).toContain('NXDOMAIN')
  })

  it('prunes state-only when the live certificate is gone', () => {
    const repairs = planCertRepairs([cert('api')], live({ api: 'missing' }))
    expect(repairs).toEqual([
      expect.objectContaining({ certId: 'api-uuid', deleteLive: false }),
    ])
  })

  it('is a no-op for healthy fleets and malformed ids', () => {
    expect(planCertRepairs([cert('api')], live({ api: { status: 'ready' } }))).toEqual([])
    expect(planCertRepairs([{ urn: 'urn::x', id: 'not-a-scaleway-id' }], new Map())).toEqual([])
    expect(planCertRepairs([], new Map())).toEqual([])
  })
})
