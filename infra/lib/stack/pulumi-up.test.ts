import { describe, expect, it } from 'vitest'
import { classifyPermissionError, parseOrphanedDeletes } from './pulumi-up'

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

  it('classifies bootstrap-owned resources (iam policy — needs IAM write, never granted to CI)', () => {
    expect(classifyPermissionError('error: insufficient permissions: write policy: provider=scaleway@1.50.0')).toEqual({
      kind: 'bootstrap-owned',
      resource: 'policy',
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

describe('parseOrphanedDeletes', () => {
  const ACL_URN = 'urn:pulumi:production::infra::scaleway:loadbalancers/acl:Acl::http-to-https'

  // Verbatim (trimmed) from a real failed apply: the inline progress lines carry
  // the URN without the 404 detail; the Diagnostics block pairs them.
  const realFailure = [
    ' -- scaleway:loadbalancers:Acl http-to-https deleting original (2s) error:   sdk-v2/provider2.go:572: sdk.helper_schema: scaleway-sdk-go: http error 404 Not Found: acl not Found: provider=scaleway@1.51.0',
    ` -- scaleway:loadbalancers:Acl http-to-https deleting original (2s) error: deleting ${ACL_URN}: 1 error occurred:`,
    ` -- scaleway:loadbalancers:Acl http-to-https **deleting failed** error: deleting ${ACL_URN}: 1 error occurred:`,
    'Diagnostics:',
    '  scaleway:loadbalancers:Acl (http-to-https):',
    '    error:   sdk-v2/provider2.go:572: sdk.helper_schema: scaleway-sdk-go: http error 404 Not Found: acl not Found: provider=scaleway@1.51.0',
    `    error: deleting ${ACL_URN}: 1 error occurred:`,
    '        * scaleway-sdk-go: http error 404 Not Found: acl not Found',
    '',
    '    error: update failed',
  ].join('\n')

  it('extracts the URN of a delete that 404d, deduplicated across inline and diagnostics lines', () => {
    expect(parseOrphanedDeletes(realFailure)).toEqual([ACL_URN])
  })

  it('returns empty for output with no errors', () => {
    expect(parseOrphanedDeletes('Resources:\n    7 created\n    85 unchanged')).toEqual([])
  })

  it('ignores a delete that failed for a non-404 reason', () => {
    const output = [
      `    error: deleting ${ACL_URN}: 1 error occurred:`,
      '        * scaleway-sdk-go: http error 403 Forbidden: Permission denied',
    ].join('\n')
    expect(parseOrphanedDeletes(output)).toEqual([])
  })

  it('ignores a 404 on a non-delete operation', () => {
    const output = [
      '    error: updating urn:pulumi:production::infra::scaleway:databases/instance:Instance::main-postgres: 1 error occurred:',
      '        * scaleway-sdk-go: http error 404 Not Found: instance not Found',
    ].join('\n')
    expect(parseOrphanedDeletes(output)).toEqual([])
  })

  it('matches the single-line diagnostic form', () => {
    const output = `    error: deleting ${ACL_URN}: scaleway-sdk-go: http error 404 Not Found: acl not Found`
    expect(parseOrphanedDeletes(output)).toEqual([ACL_URN])
  })

  it('collects multiple orphaned deletes', () => {
    const routeUrn = 'urn:pulumi:production::infra::scaleway:loadbalancers/route:Route::ai-route'
    const output = [
      `    error: deleting ${ACL_URN}: 1 error occurred:`,
      '        * scaleway-sdk-go: http error 404 Not Found: acl not Found',
      `    error: deleting ${routeUrn}: 1 error occurred:`,
      '        * scaleway-sdk-go: http error 404 Not Found: route not Found',
    ].join('\n')
    expect(parseOrphanedDeletes(output)).toEqual([ACL_URN, routeUrn])
  })
})
