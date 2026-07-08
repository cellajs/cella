import { describe, expect, it, vi } from 'vitest'
import { managedKeys } from '../lib/managed-keys'
import { provisionManagedKey } from './provision-managed-key'

const getSecretByName = vi.fn()
const putSecretValue = vi.fn()
const provisionScopedKey = vi.fn()

vi.mock('../lib/scaleway/scaleway-secret-manager', () => ({
  createSecretManagerClient: () => ({ getSecretByName, putSecretValue }),
}))

vi.mock('../lib/scaleway/scaleway-iam', () => ({
  provisionScopedKey: (...args: unknown[]) => provisionScopedKey(...args),
}))

function resetMocks() {
  getSecretByName.mockReset()
  putSecretValue.mockReset()
  provisionScopedKey.mockReset()
}

// biome-ignore lint/style/noNonNullAssertion: fixtures come straight from the real registry.
const s3Key = managedKeys.find((key) => key.id === 's3')!
// biome-ignore lint/style/noNonNullAssertion: fixtures come straight from the real registry.
const aiKey = managedKeys.find((key) => key.id === 'ai')!

const baseOptions = {
  callerSecretKey: 'caller-secret',
  projectId: 'proj-1',
  region: 'nl-ams',
  slug: 'demo',
  path: '/demo-production/',
  log: vi.fn(),
}

describe('provisionManagedKey', () => {
  it('mints a scoped key and writes both halves of an access/secret pair (S3)', async () => {
    resetMocks()
    getSecretByName.mockImplementation(async (name: string) =>
      ({ 's3-access-key-id': { id: 'container-id' }, 's3-access-key-secret': { id: 'container-secret' } })[name],
    )
    provisionScopedKey.mockResolvedValue({ accessKey: 'AK', secretKey: 'SK', applicationId: 'app-s3', organizationId: 'org-1' })
    putSecretValue.mockResolvedValue({ revision: 1 })

    const result = await provisionManagedKey({ ...baseOptions, definition: s3Key })

    // Scoped to Object Storage, in the caller's project, minting a key.
    expect(provisionScopedKey).toHaveBeenCalledTimes(1)
    // biome-ignore lint/style/noNonNullAssertion: asserted called exactly once above.
    const config = provisionScopedKey.mock.calls[0]![1]
    expect(config).toMatchObject({ suffix: 's3', mintKey: true })
    expect(config.buildRules({ projectId: 'proj-1', organizationId: 'org-1' })).toEqual([
      { permission_set_names: ['ObjectStorageFullAccess'], project_ids: ['proj-1'] },
    ])

    // Access key → id container, secret key → secret container, each superseding prior versions.
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'container-id', value: 'AK', disablePrevious: true }))
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'container-secret', value: 'SK', disablePrevious: true }))
    expect(result.applicationId).toBe('app-s3')
  })

  it('writes only the secret half for a single-token key (AI)', async () => {
    resetMocks()
    getSecretByName.mockResolvedValue({ id: 'container-ai' })
    provisionScopedKey.mockResolvedValue({ accessKey: 'AK', secretKey: 'SK', applicationId: 'app-ai', organizationId: 'org-1' })
    putSecretValue.mockResolvedValue({ revision: 3 })

    await provisionManagedKey({ ...baseOptions, definition: aiKey })

    expect(putSecretValue).toHaveBeenCalledTimes(1)
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'container-ai', value: 'SK' }))
  })

  it('aborts without minting when a target container does not exist yet', async () => {
    resetMocks()
    getSecretByName.mockResolvedValue(undefined)

    await expect(provisionManagedKey({ ...baseOptions, definition: aiKey })).rejects.toThrow(/no container yet/)

    // Never mint an IAM key we cannot store — that would orphan a live credential.
    expect(provisionScopedKey).not.toHaveBeenCalled()
    expect(putSecretValue).not.toHaveBeenCalled()
  })
})
