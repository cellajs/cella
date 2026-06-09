import { describe, expect, it, vi } from 'vitest'
import { migrateRuntimeSecrets } from './migrate-runtime-secrets.js'

const getSecretByName = vi.fn()
const ensureSecret = vi.fn()
const putSecretValue = vi.fn()

vi.mock('../src/scaleway-secret-manager.js', () => ({
  createSecretManagerClient: () => ({
    getSecretByName,
    ensureSecret,
    putSecretValue,
  }),
}))

function resetMocks() {
  getSecretByName.mockReset()
  ensureSecret.mockReset()
  putSecretValue.mockReset()
}

const baseOptions = {
  secretKey: 'caller-secret',
  projectId: 'proj-1',
  region: 'nl-ams',
  path: '/demo-production/',
  log: vi.fn(),
}

describe('migrateRuntimeSecrets', () => {
  it('seeds operator-managed secrets from legacy stack values when the secret has no versions', async () => {
    resetMocks()
    getSecretByName.mockResolvedValue(undefined)
    ensureSecret.mockResolvedValue({ id: 'secret-1', name: 'admin-email' })

    await migrateRuntimeSecrets({
      ...baseOptions,
      valuesByLegacyKey: {
        'infra:adminEmail': 'admin@example.com',
      },
    })

    expect(ensureSecret).toHaveBeenCalledWith(expect.objectContaining({ name: 'admin-email' }))
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({
      secretId: 'secret-1',
      value: 'admin@example.com',
    }))
  })

  it('does not overwrite operator-managed secrets that already have versions', async () => {
    resetMocks()
    getSecretByName.mockResolvedValue({ id: 'secret-2', name: 'brevo-api-key', version_count: 2 })

    await migrateRuntimeSecrets({
      ...baseOptions,
      valuesByLegacyKey: {
        'infra:brevoApiKey': 'brevo-key',
      },
    })

    expect(ensureSecret).not.toHaveBeenCalled()
    expect(putSecretValue).not.toHaveBeenCalled()
  })
})