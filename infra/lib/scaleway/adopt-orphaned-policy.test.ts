import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.fn()
vi.mock('node:child_process', () => ({ spawnSync: (...args: unknown[]) => spawnSyncMock(...args) }))

const findPolicyIdByNameMock = vi.fn()
vi.mock('./scaleway-iam', () => ({ findPolicyIdByName: (...args: unknown[]) => findPolicyIdByNameMock(...args) }))

import { adoptOrphanedPolicy, stackExportHasResource } from './adopt-orphaned-policy'

const POLICY_TYPE = 'scaleway:iam/policy:Policy'

const exportWith = (resources: Array<{ urn: string; type: string }>) => JSON.stringify({ deployment: { resources } })

describe('stackExportHasResource', () => {
  it('finds a resource by type and urn suffix', () => {
    const json = exportWith([
      { urn: 'urn:pulumi:production::infra::pulumi:pulumi:Stack::infra-production', type: 'pulumi:pulumi:Stack' },
      { urn: 'urn:pulumi:production::infra::scaleway:iam/policy:Policy::vm-reader-policy', type: POLICY_TYPE },
    ])
    expect(stackExportHasResource(json, POLICY_TYPE, 'vm-reader-policy')).toBe(true)
  })

  it('returns false when the type matches but the name does not', () => {
    const json = exportWith([{ urn: 'urn:pulumi:production::infra::scaleway:iam/policy:Policy::other-policy', type: POLICY_TYPE }])
    expect(stackExportHasResource(json, POLICY_TYPE, 'vm-reader-policy')).toBe(false)
  })

  it('returns false on empty or malformed export', () => {
    expect(stackExportHasResource('', POLICY_TYPE, 'vm-reader-policy')).toBe(false)
    expect(stackExportHasResource('{}', POLICY_TYPE, 'vm-reader-policy')).toBe(false)
    expect(stackExportHasResource('not json', POLICY_TYPE, 'vm-reader-policy')).toBe(false)
  })
})

const opts = {
  stack: 'organization/infra/production',
  cwd: '/infra',
  env: {},
  pulumiName: 'vm-reader-policy',
  policyName: 'cella-vm-reader-policy',
  secretKey: 'boot-secret',
  organizationId: 'org-1',
  log: () => {},
}

describe('adoptOrphanedPolicy', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset()
    findPolicyIdByNameMock.mockReset()
  })

  it('is a no-op when the policy is already in state', async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: exportWith([{ urn: 'urn:pulumi:production::infra::scaleway:iam/policy:Policy::vm-reader-policy', type: POLICY_TYPE }]),
    })
    expect(await adoptOrphanedPolicy(opts)).toBe('in-state')
    expect(findPolicyIdByNameMock).not.toHaveBeenCalled()
    expect(spawnSyncMock).toHaveBeenCalledTimes(1) // only the export, no import
  })

  it('imports the policy when it exists in Scaleway but not in state', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([]) }) // export: not in state
    findPolicyIdByNameMock.mockResolvedValueOnce('pol-123')
    spawnSyncMock.mockReturnValueOnce({ status: 0 }) // import succeeds
    expect(await adoptOrphanedPolicy(opts)).toBe('imported')
    const importCall = spawnSyncMock.mock.calls[1]!
    expect(importCall[0]).toBe('pulumi')
    expect(importCall[1]).toEqual(['import', POLICY_TYPE, 'vm-reader-policy', 'pol-123', '--stack', opts.stack, '--yes', '--non-interactive'])
  })

  it('reports absent when the policy is in neither state nor Scaleway', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([]) })
    findPolicyIdByNameMock.mockResolvedValueOnce(undefined)
    expect(await adoptOrphanedPolicy(opts)).toBe('absent')
    expect(spawnSyncMock).toHaveBeenCalledTimes(1) // no import
  })

  it('reports unavailable (no throw) when the Scaleway lookup fails', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([]) })
    findPolicyIdByNameMock.mockRejectedValueOnce(new Error('403'))
    expect(await adoptOrphanedPolicy(opts)).toBe('unavailable')
  })

  it('throws when the import subprocess fails', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([]) })
    findPolicyIdByNameMock.mockResolvedValueOnce('pol-123')
    spawnSyncMock.mockReturnValueOnce({ status: 1 })
    await expect(adoptOrphanedPolicy(opts)).rejects.toThrow(/pulumi import of vm-reader-policy/)
  })
})
