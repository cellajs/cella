import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.fn()
vi.mock('node:child_process', () => ({ spawnSync: (...args: unknown[]) => spawnSyncMock(...args) }))

const listSecretsMock = vi.fn()
vi.mock('./scaleway-secret-manager', () => ({
  createSecretManagerClient: () => ({ listSecrets: (...args: unknown[]) => listSecretsMock(...args) }),
}))

// A controlled two-secret operator set so the test is independent of the fork
// runtime-secrets config.
vi.mock('./runtime-secrets', () => ({
  operatorManagedRuntimeSecrets: [
    { id: 'adminEmail', secretName: 'admin-email' },
    { id: 'brevoApiKey', secretName: 'brevo-api-key' },
  ],
}))

import { adoptOrphanedSecrets } from './adopt-orphaned-secrets'

const SECRET_TYPE = 'scaleway:secrets/secret:Secret'
const exportWith = (resources: Array<{ urn: string; type: string }>) => JSON.stringify({ deployment: { resources } })
const stateResource = (name: string) => ({ urn: `urn:pulumi:production::infra::${SECRET_TYPE}::${name}`, type: SECRET_TYPE })

const opts = {
  stack: 'organization/infra/production',
  cwd: '/infra',
  env: {},
  secretKey: 'boot-secret',
  projectId: 'proj-1',
  region: 'nl-ams',
  path: '/raak-production/',
  log: () => {},
}

describe('adoptOrphanedSecrets', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset()
    listSecretsMock.mockReset()
  })

  it('is a no-op when every operator container is already in state', async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: exportWith([stateResource('secret-admin-email'), stateResource('secret-brevo-api-key')]),
    })
    const result = await adoptOrphanedSecrets(opts)
    expect(result.imported).toEqual([])
    expect(result.outcomes).toEqual({ 'admin-email': 'in-state', 'brevo-api-key': 'in-state' })
    expect(listSecretsMock).not.toHaveBeenCalled()
    expect(spawnSyncMock).toHaveBeenCalledTimes(1) // only the export, no list, no import
  })

  it('imports a container present in Scaleway but missing from state', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([stateResource('secret-admin-email')]) }) // brevo missing
    listSecretsMock.mockResolvedValueOnce([{ name: 'brevo-api-key', id: 'uuid-brevo', region: 'nl-ams', path: '/raak-production' }])
    spawnSyncMock.mockReturnValueOnce({ status: 0 }) // import succeeds
    const result = await adoptOrphanedSecrets(opts)
    expect(result.outcomes['admin-email']).toBe('in-state')
    expect(result.imported).toEqual(['brevo-api-key'])
    const importCall = spawnSyncMock.mock.calls[1]
    expect(importCall[0]).toBe('pulumi')
    expect(importCall[1]).toEqual([
      'import',
      SECRET_TYPE,
      'secret-brevo-api-key',
      'nl-ams/uuid-brevo',
      '--stack',
      opts.stack,
      '--yes',
      '--non-interactive',
    ])
  })

  it('falls back to the option region when a live secret omits its region', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([stateResource('secret-brevo-api-key')]) }) // admin-email missing
    listSecretsMock.mockResolvedValueOnce([{ name: 'admin-email', id: 'uuid-admin', path: '/raak-production' }]) // no region field
    spawnSyncMock.mockReturnValueOnce({ status: 0 })
    const result = await adoptOrphanedSecrets(opts)
    expect(result.imported).toEqual(['admin-email'])
    expect(spawnSyncMock.mock.calls[1][1]).toContain('nl-ams/uuid-admin')
  })

  it('marks a secret absent when it exists in neither state nor Scaleway', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([stateResource('secret-admin-email')]) })
    listSecretsMock.mockResolvedValueOnce([]) // brevo absent in Scaleway too
    const result = await adoptOrphanedSecrets(opts)
    expect(result.outcomes['brevo-api-key']).toBe('absent')
    expect(result.imported).toEqual([])
    expect(spawnSyncMock).toHaveBeenCalledTimes(1) // export only, no import
  })

  it('skips adoption (unavailable) when the live secret list cannot be queried', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([]) })
    listSecretsMock.mockRejectedValueOnce(new Error('403'))
    const result = await adoptOrphanedSecrets(opts)
    expect(result.unavailable).toBe(true)
    expect(result.imported).toEqual([])
    expect(result.outcomes).toEqual({ 'admin-email': 'unavailable', 'brevo-api-key': 'unavailable' })
    expect(spawnSyncMock).toHaveBeenCalledTimes(1) // no import attempted
  })

  it('throws when a pulumi import fails', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: exportWith([]) })
    listSecretsMock.mockResolvedValueOnce([{ name: 'admin-email', id: 'uuid-admin', region: 'nl-ams', path: '/raak-production' }])
    spawnSyncMock.mockReturnValueOnce({ status: 1 }) // import fails
    await expect(adoptOrphanedSecrets(opts)).rejects.toThrow(/pulumi import of secret-admin-email/)
  })
})
