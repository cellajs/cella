import { describe, expect, it, vi } from 'vitest';
import { manageRuntimeSecrets } from './manage-runtime-secrets';

const prompts = { select: vi.fn(), password: vi.fn(), confirm: vi.fn() };

const listSecrets = vi.fn();
const getSecretByName = vi.fn();
const ensureSecret = vi.fn();
const putSecretValue = vi.fn();
const deleteSecret = vi.fn();
const provisionManagedKey = vi.fn();

vi.mock('../lib/scaleway/scaleway-secret-manager', () => ({
  createSecretManagerClient: () => ({ listSecrets, getSecretByName, ensureSecret, putSecretValue, deleteSecret }),
}));

vi.mock('./provision-managed-key', () => ({ provisionManagedKey: (...args: unknown[]) => provisionManagedKey(...args) }));

function resetMocks() {
  prompts.select.mockReset();
  prompts.password.mockReset();
  prompts.confirm.mockReset();
  listSecrets.mockReset();
  getSecretByName.mockReset();
  ensureSecret.mockReset();
  putSecretValue.mockReset();
  deleteSecret.mockReset();
  provisionManagedKey.mockReset();
}

const baseOptions = {
  secretKey: 'caller-secret',
  identityKey: async () => ({ secretKey: 'caller-secret', organizationId: 'org-1' }),
  projectId: 'proj-1',
  region: 'nl-ams',
  slug: 'demo',
  mode: 'production',
  prompts,
  log: vi.fn(),
};

describe('manageRuntimeSecrets', () => {
  it('lists operator-managed secrets and reports presence', async () => {
    resetMocks();
    prompts.select.mockResolvedValueOnce('list').mockResolvedValueOnce('exit');
    // Every copy of brevo-api-key has a version → present; github-client-id's copies exist empty (0 versions) → empty, not present.
    // Everything else is missing.
    listSecrets.mockResolvedValueOnce([
      ...['backend', 'mcp', 'jobs'].map((service) => ({
        name: 'brevo-api-key',
        id: `brevo-${service}`,
        path: `/${service}`,
        version_count: 1,
      })),
      ...['backend', 'mcp'].map((service) => ({
        name: 'github-client-id',
        id: `gh-${service}`,
        path: `/${service}/`,
        version_count: 0,
      })),
    ]);

    await manageRuntimeSecrets(baseOptions);

    expect(listSecrets).toHaveBeenCalledWith();
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Runtime secrets'));
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringMatching(/brevo-api-key.*present/));
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringMatching(/github-client-id.*empty/));
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('missing'));
  });

  it('updates every consumer copy of an operator-managed secret with one value', async () => {
    resetMocks();
    prompts.select.mockResolvedValueOnce('set').mockResolvedValueOnce('brevoApiKey').mockResolvedValueOnce('exit');
    prompts.password.mockResolvedValueOnce('new-api-key');
    getSecretByName.mockImplementation(async (name: string, path: string) => ({ id: `${path}${name}`, name, path }));
    putSecretValue.mockResolvedValue({ revision: 7 });

    await manageRuntimeSecrets(baseOptions);

    expect(ensureSecret).not.toHaveBeenCalled();
    for (const service of ['backend', 'mcp', 'jobs']) {
      expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: `/${service}/brevo-api-key`, value: 'new-api-key' }));
    }
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('3 copies'));
  });

  it('refuses to create a missing container and tells the operator to apply first', async () => {
    resetMocks();
    prompts.select.mockResolvedValueOnce('set').mockResolvedValueOnce('brevoApiKey').mockResolvedValueOnce('exit');
    getSecretByName.mockResolvedValueOnce(undefined);

    await manageRuntimeSecrets(baseOptions);

    // Creating the container out-of-band would make the next `pulumi up` 409.
    expect(ensureSecret).not.toHaveBeenCalled();
    expect(putSecretValue).not.toHaveBeenCalled();
    expect(prompts.password).not.toHaveBeenCalled();
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Apply first'));
  });

  it('deletes an entire secret object only after confirmation', async () => {
    resetMocks();
    prompts.select.mockResolvedValueOnce('delete').mockResolvedValueOnce('githubClientSecret').mockResolvedValueOnce('exit');
    prompts.confirm.mockResolvedValueOnce(true);
    getSecretByName.mockResolvedValueOnce({ id: 'secret-3', name: 'github-client-secret' });

    await manageRuntimeSecrets(baseOptions);

    expect(deleteSecret).toHaveBeenCalledWith('secret-3');
  });

  it('cancels deletion when confirmation is declined', async () => {
    resetMocks();
    prompts.select.mockResolvedValueOnce('delete').mockResolvedValueOnce('githubClientId').mockResolvedValueOnce('exit');
    prompts.confirm.mockResolvedValueOnce(false);
    getSecretByName.mockResolvedValueOnce({ id: 'secret-4', name: 'github-client-id' });

    await manageRuntimeSecrets(baseOptions);

    expect(deleteSecret).not.toHaveBeenCalled();
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Deletion cancelled'));
  });

  it('mints a managed key after confirmation, passing the caller identity through', async () => {
    resetMocks();
    prompts.select.mockResolvedValueOnce('mint').mockResolvedValueOnce('ai').mockResolvedValueOnce('exit');
    prompts.confirm.mockResolvedValueOnce(true);
    provisionManagedKey.mockResolvedValueOnce({ applicationId: 'app-ai', seeded: { 'scw-ai-api-key': 1 } });

    await manageRuntimeSecrets(baseOptions);

    expect(provisionManagedKey).toHaveBeenCalledWith(
      expect.objectContaining({ callerSecretKey: 'caller-secret', projectId: 'proj-1', slug: 'demo' }),
    );
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Minted'));
  });

  it('does not mint when the confirmation is declined', async () => {
    resetMocks();
    prompts.select.mockResolvedValueOnce('mint').mockResolvedValueOnce('ai').mockResolvedValueOnce('exit');
    prompts.confirm.mockResolvedValueOnce(false);

    await manageRuntimeSecrets(baseOptions);

    expect(provisionManagedKey).not.toHaveBeenCalled();
    expect(baseOptions.log).toHaveBeenCalledWith(expect.stringContaining('Mint cancelled'));
  });
});
