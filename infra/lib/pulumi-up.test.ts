import { describe, expect, it } from 'vitest'
import { classifyPermissionError } from './pulumi-up.js'

describe('classifyPermissionError', () => {
  it('returns undefined when stderr has no perms diagnostic', () => {
    expect(classifyPermissionError('Previewing update (production):\nResources: 4 unchanged')).toBeUndefined()
  })

  it('classifies bootstrap-owned resources (rdb)', () => {
    expect(classifyPermissionError('error: insufficient permissions: write rdb_instance on …')).toEqual({
      kind: 'bootstrap-owned',
      resource: 'rdb_instance',
    })
  })

  it('classifies bootstrap-owned resources (private_network)', () => {
    expect(classifyPermissionError('  insufficient permissions: write private_network')).toEqual({
      kind: 'bootstrap-owned',
      resource: 'private_network',
    })
  })

  it('classifies bootstrap-owned resources (vpc)', () => {
    expect(classifyPermissionError('insufficient permissions: write vpc')).toEqual({
      kind: 'bootstrap-owned',
      resource: 'vpc',
    })
  })

  it('classifies bootstrap-owned resources (domain_zone)', () => {
    expect(classifyPermissionError('insufficient permissions: write domain_zone')).toEqual({
      kind: 'bootstrap-owned',
      resource: 'domain_zone',
    })
  })

  it('classifies CI-grantable resources', () => {
    expect(classifyPermissionError('insufficient permissions: write object_storage_bucket')).toEqual({
      kind: 'ci-grantable',
      resource: 'object_storage_bucket',
    })
  })

  it('is case-insensitive on the matcher', () => {
    expect(classifyPermissionError('INSUFFICIENT PERMISSIONS: WRITE RDB_ACL')).toEqual({
      kind: 'bootstrap-owned',
      resource: 'RDB_ACL',
    })
  })
})
