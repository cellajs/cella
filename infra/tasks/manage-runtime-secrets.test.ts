import { describe, expect, it, vi } from 'vitest'
import { manageRuntimeSecrets } from './manage-runtime-secrets.js'

const prompts = {
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}

const listSecrets = vi.fn()
const getSecretByName = vi.fn()
const ensureSecret = vi.fn()
const putSecretValue = vi.fn()
const deleteSecret = vi.fn()

vi.mock('../src/scaleway-secret-manager.js', () => ({
  createSecretManagerClient: () => ({
    listSecrets,
    getSecretByName,
    ensureSecret,
    putSecretValue,
    deleteSecret,
  }),
}))

function resetMocks() {
  prompts.select.mockReset()
  prompts.password.mockReset()
  prompts.confirm.mockReset()
  listSecrets.mockReset()
  getSecretByName.mockReset()
  ensureSecret.mockReset()
  putSecretValue.mockReset()
  deleteSecret.mockReset()
}

const baseOptions = {
  secretKey: 'caller-secret',
  projectId: 'proj-1',
  region: 'nl-ams',
  path: '/demo-production/',
  prompts,
  log: vi.fn(),
}

describe('manageRuntimeSecrets', () => {
  it('lists operator-managed secrets and reports presence', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('list')
    listSecrets.mockResolvedValueOnce([{ name: 'brevo-api-key', id: 'secret-1' }])

    await manageRuntimeSecrets(baseOptions)

    expect(listSecrets).toHaveBeenCalledWith('/demo-production/')
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Runtime secrets'))
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('brevo-api-key'))
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('missing'))
  })

  it('creates or updates a manual operator-managed secret', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('set').mockResolvedValueOnce('brevoApiKey')
    prompts.password.mockResolvedValueOnce('new-api-key')
    getSecretByName.mockResolvedValueOnce(undefined)
    ensureSecret.mockResolvedValueOnce({ id: 'secret-2', name: 'brevo-api-key' })

    await manageRuntimeSecrets(baseOptions)

    expect(ensureSecret).toHaveBeenCalledWith(expect.objectContaining({ name: 'brevo-api-key' }))
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'secret-2', value: 'new-api-key' }))
  })

  it('deletes an entire secret object only after confirmation', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('delete').mockResolvedValueOnce('githubClientSecret')
    prompts.confirm.mockResolvedValueOnce(true)
    getSecretByName.mockResolvedValueOnce({ id: 'secret-3', name: 'github-client-secret' })

    await manageRuntimeSecrets(baseOptions)

    expect(deleteSecret).toHaveBeenCalledWith('secret-3')
  })

  it('cancels deletion when confirmation is declined', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('delete').mockResolvedValueOnce('githubClientId')
    prompts.confirm.mockResolvedValueOnce(false)
    getSecretByName.mockResolvedValueOnce({ id: 'secret-4', name: 'github-client-id' })

    await manageRuntimeSecrets(baseOptions)

    expect(deleteSecret).not.toHaveBeenCalled()
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Deletion cancelled'))
  })
})