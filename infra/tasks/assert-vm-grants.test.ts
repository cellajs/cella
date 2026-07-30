import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../lib/utils/fetch-like'
import { assertVmGrants } from './assert-vm-grants'

/**
 * Build a fetch mock that matches GET requests by url-substring and returns the
 * configured JSON body. Mirrors the helper style in scaleway-iam.test.ts.
 */
function makeFetch(routes: Array<{ match: string; body: unknown; status?: number }>): FetchLike {
  return vi.fn(async (url: string) => {
    const route = routes.find((r) => url.includes(r.match))
    const status = route?.status ?? (route ? 200 : 599)
    const body = route ? JSON.stringify(route.body) : `no mock for ${url}`
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    }
  })
}

const REQUIRED = ['ContainerRegistryReadOnly', 'SecretManagerReadOnly', 'SecretManagerSecretAccess'] as const

/** No groups in the org; the vm-reader app is bound only via its own policies. */
const NO_GROUPS = { match: '/iam/v1alpha1/groups?', body: { groups: [] } }

const baseOpts = {
  secretKey: 'caller-secret',
  applicationId: 'vm-app',
  projectId: 'proj-1',
  organizationId: 'org-1',
  required: REQUIRED,
  log: () => {},
}

describe('assertVmGrants', () => {
  it('passes when the union of policy rules covers all required permission sets', async () => {
    const fetchImpl = makeFetch([
      NO_GROUPS,
      { match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'vm-reader-policy', application_id: 'vm-app' }] } },
      { match: '/iam/v1alpha1/rules?policy_id=pol-1', body: { rules: [{ permission_set_names: [...REQUIRED] }] } },
    ])

    const result = await assertVmGrants({ ...baseOpts, fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.extra).toEqual([])
    expect(result.granted).toEqual([...REQUIRED].sort())
  })

  it('fails when the application holds EXTRA permission sets beyond the required profile', async () => {
    const fetchImpl = makeFetch([
      NO_GROUPS,
      { match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'vm-reader-policy', application_id: 'vm-app' }] } },
      { match: '/iam/v1alpha1/rules?policy_id=pol-1', body: { rules: [{ permission_set_names: [...REQUIRED, 'ObjectStorageFullAccess'] }] } },
    ])

    const result = await assertVmGrants({ ...baseOpts, fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([])
    expect(result.extra).toEqual(['ObjectStorageFullAccess'])
  })

  it('excludes policies bound to other principals (shared-organization leakage)', async () => {
    const fetchImpl = makeFetch([
      NO_GROUPS,
      {
        match: '/iam/v1alpha1/policies?',
        body: {
          policies: [
            { id: 'pol-1', name: 'vm-reader-policy', application_id: 'vm-app' },
            { id: 'pol-admin', name: 'Administrators', group_id: 'grp-admin' },
            { id: 'pol-raak', name: 'raak-operator-policy', application_id: 'other-app' },
          ],
        },
      },
      { match: '/iam/v1alpha1/rules?policy_id=pol-1', body: { rules: [{ permission_set_names: [...REQUIRED] }] } },
      // Rules for pol-admin / pol-raak must never be fetched; if they were, these would add extras.
      { match: '/iam/v1alpha1/rules?policy_id=pol-admin', body: { rules: [{ permission_set_names: ['OrganizationManager'] }] } },
      { match: '/iam/v1alpha1/rules?policy_id=pol-raak', body: { rules: [{ permission_set_names: ['SecretManagerFullAccess'] }] } },
    ])

    const result = await assertVmGrants({ ...baseOpts, fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.extra).toEqual([])
    expect(result.granted).toEqual([...REQUIRED].sort())
  })

  it('includes policies bound to a group the application belongs to', async () => {
    const fetchImpl = makeFetch([
      { match: '/iam/v1alpha1/groups?', body: { groups: [{ id: 'grp-1', application_ids: ['vm-app'] }] } },
      { match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-g', name: 'group-policy', group_id: 'grp-1' }] } },
      { match: '/iam/v1alpha1/rules?policy_id=pol-g', body: { rules: [{ permission_set_names: [...REQUIRED] }] } },
    ])

    const result = await assertVmGrants({ ...baseOpts, fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.granted).toEqual([...REQUIRED].sort())
  })

  it('aggregates permission sets across multiple policies and rules', async () => {
    const fetchImpl = makeFetch([
      NO_GROUPS,
      {
        match: '/iam/v1alpha1/policies?',
        body: { policies: [{ id: 'pol-1', name: 'a', application_id: 'vm-app' }, { id: 'pol-2', name: 'b', application_id: 'vm-app' }] },
      },
      { match: '/iam/v1alpha1/rules?policy_id=pol-1', body: { rules: [{ permission_set_names: ['ContainerRegistryReadOnly'] }] } },
      {
        match: '/iam/v1alpha1/rules?policy_id=pol-2',
        body: { rules: [{ permission_set_names: ['SecretManagerReadOnly'] }, { permission_set_names: ['SecretManagerSecretAccess'] }] },
      },
    ])

    const result = await assertVmGrants({ ...baseOpts, fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('reports the exact missing permission sets (the incident: SecretManagerSecretAccess absent)', async () => {
    const fetchImpl = makeFetch([
      NO_GROUPS,
      { match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'vm-reader-policy', application_id: 'vm-app' }] } },
      { match: '/iam/v1alpha1/rules?policy_id=pol-1', body: { rules: [{ permission_set_names: ['ContainerRegistryReadOnly', 'SecretManagerReadOnly'] }] } },
    ])

    const result = await assertVmGrants({ ...baseOpts, fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['SecretManagerSecretAccess'])
  })

  it('fails closed when the application has no policies bound to it', async () => {
    const fetchImpl = makeFetch([NO_GROUPS, { match: '/iam/v1alpha1/policies?', body: { policies: [] } }])

    const result = await assertVmGrants({ ...baseOpts, fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([...REQUIRED])
  })

  it('resolves organization id from project when not provided', async () => {
    const fetchImpl = makeFetch([
      { match: '/account/v3/projects/proj-1', body: { organization_id: 'org-resolved' } },
      NO_GROUPS,
      { match: '/iam/v1alpha1/policies?', body: { policies: [{ id: 'pol-1', name: 'p', application_id: 'vm-app' }] } },
      { match: '/iam/v1alpha1/rules?policy_id=pol-1', body: { rules: [{ permission_set_names: [...REQUIRED] }] } },
    ])
    const calls: string[] = []
    const tracking: FetchLike = async (url, init) => {
      calls.push(url)
      return fetchImpl(url, init)
    }

    const result = await assertVmGrants({ ...baseOpts, organizationId: undefined, fetchImpl: tracking })

    expect(result.ok).toBe(true)
    expect(calls.some((u) => u.includes('organization_id=org-resolved'))).toBe(true)
  })

  it('throws a useful error on a Scaleway error response', async () => {
    const fetchImpl = makeFetch([NO_GROUPS, { match: '/iam/v1alpha1/policies?', body: { message: 'forbidden' }, status: 403 }])

    await expect(assertVmGrants({ ...baseOpts, fetchImpl })).rejects.toThrow(/403.*forbidden/)
  })
})
