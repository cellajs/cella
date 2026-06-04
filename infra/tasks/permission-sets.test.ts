import { describe, expect, it } from 'vitest'
import { ORG_PERMISSION_SETS, PROJECT_PERMISSION_SETS } from './setup-ci-key.js'

/**
 * Lock the CI key's permission sets. Any addition must be deliberate and visible
 * in a PR; changing this test is the code-review trigger.
 *
 * Forbidden permissions are listed explicitly so a regex/typo can't sneak them
 * in (e.g. `IAMManager` would let the CI key mint more API keys for itself —
 * a self-rotating super-key).
 */

const FORBIDDEN = [
  'IAMManager',
  'IAMFullAccess',
  'ProjectManager',
  'OrganizationManager',
  'BillingManager',
  'BillingFullAccess',
  'AccountManager',
]

describe('CI key permission sets', () => {
  it('PROJECT_PERMISSION_SETS exact membership snapshot', () => {
    expect([...PROJECT_PERMISSION_SETS].sort()).toEqual([
      'BlockStorageFullAccess',
      'ContainerRegistryFullAccess',
      'EdgeServicesFullAccess',
      'IPAMFullAccess',
      'InstancesFullAccess',
      'LoadBalancersFullAccess',
      'ObjectStorageFullAccess',
      'ObservabilityFullAccess',
      'PrivateNetworksFullAccess',
      'RelationalDatabasesReadOnly',
      'SecretManagerFullAccess',
      'VPCReadOnly',
    ])
  })

  it('ORG_PERMISSION_SETS exact membership snapshot', () => {
    expect([...ORG_PERMISSION_SETS]).toEqual(['DomainsDNSFullAccess'])
  })

  it('does not include any privilege-escalation permission', () => {
    const all = [...PROJECT_PERMISSION_SETS, ...ORG_PERMISSION_SETS]
    for (const forbidden of FORBIDDEN) {
      expect(all, `permission set '${forbidden}' must not be granted to the CI key`).not.toContain(forbidden)
    }
  })

  it('every project permission set ends with FullAccess or ReadOnly', () => {
    // Catches typos like `InstancesFullAcess` early.
    for (const p of PROJECT_PERMISSION_SETS) {
      expect(p, `permission '${p}' must end in FullAccess or ReadOnly`).toMatch(/(FullAccess|ReadOnly)$/)
    }
  })
})
