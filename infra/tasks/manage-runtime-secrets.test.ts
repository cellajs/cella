import { describe, expect, it, vi } from 'vitest'
import { manageRuntimeSecrets } from './manage-runtime-secrets'

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

vi.mock('../lib/scaleway-secret-manager', () => ({
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
    prompts.select.mockResolvedValueOnce('list').mockResolvedValueOnce('exit')
    // brevo-api-key has a version (content) → present; github-client-id exists as an
    // empty container (0 versions) → empty, not present. Everything else is missing.
    listSecrets.mockResolvedValueOnce([
      { name: 'brevo-api-key', id: 'secret-1', version_count: 1 },
      { name: 'github-client-id', id: 'secret-2', version_count: 0 },
    ])

    await manageRuntimeSecrets(baseOptions)

    expect(listSecrets).toHaveBeenCalledWith('/demo-production/')
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Runtime secrets'))
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringMatching(/brevo-api-key.*present/))
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringMatching(/github-client-id.*empty/))
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('missing'))
  })

  it('updates an existing operator-managed secret', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('set').mockResolvedValueOnce('brevoApiKey').mockResolvedValueOnce('exit')
    prompts.password.mockResolvedValueOnce('new-api-key')
    getSecretByName.mockResolvedValueOnce({ id: 'secret-2', name: 'brevo-api-key' })
    putSecretValue.mockResolvedValueOnce({ revision: 7, secret_id: 'secret-2' })

    await manageRuntimeSecrets(baseOptions)

    expect(ensureSecret).not.toHaveBeenCalled()
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'secret-2', value: 'new-api-key' }))
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('revision 7'))
  })

  it('refuses to create a missing container and tells the operator to deploy first', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('set').mockResolvedValueOnce('brevoApiKey').mockResolvedValueOnce('exit')
    getSecretByName.mockResolvedValueOnce(undefined)

    await manageRuntimeSecrets(baseOptions)

    // Creating the container out-of-band would make the next `pulumi up` 409.
    expect(ensureSecret).not.toHaveBeenCalled()
    expect(putSecretValue).not.toHaveBeenCalled()
    expect(prompts.password).not.toHaveBeenCalled()
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Deploy first'))
  })

  it('deletes an entire secret object only after confirmation', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('delete').mockResolvedValueOnce('githubClientSecret').mockResolvedValueOnce('exit')
    prompts.confirm.mockResolvedValueOnce(true)
    getSecretByName.mockResolvedValueOnce({ id: 'secret-3', name: 'github-client-secret' })

    await manageRuntimeSecrets(baseOptions)

    expect(deleteSecret).toHaveBeenCalledWith('secret-3')
  })

  it('cancels deletion when confirmation is declined', async () => {
    resetMocks()
    prompts.select.mockResolvedValueOnce('delete').mockResolvedValueOnce('githubClientId').mockResolvedValueOnce('exit')
    prompts.confirm.mockResolvedValueOnce(false)
    getSecretByName.mockResolvedValueOnce({ id: 'secret-4', name: 'github-client-id' })

    await manageRuntimeSecrets(baseOptions)

    expect(deleteSecret).not.toHaveBeenCalled()
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Deletion cancelled'))
  })
})