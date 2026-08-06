import { describe, expect, it, vi } from 'vitest';
import { managedKeys } from '../lib/managed-keys';
import { provisionManagedKey } from './provision-managed-key';

const getSecretByName = vi.fn();
const putSecretValue = vi.fn();
const provisionScopedKey = vi.fn();

vi.mock('../lib/scaleway/scaleway-secret-manager', () => ({
  createSecretManagerClient: () => ({ getSecretByName, putSecretValue }),
}));

vi.mock('../lib/scaleway/scaleway-iam', () => ({
  provisionScopedKey: (...args: unknown[]) => provisionScopedKey(...args),
}));

function resetMocks() {
  getSecretByName.mockReset();
  putSecretValue.mockReset();
  provisionScopedKey.mockReset();
}

const aiKey = managedKeys.find((key) => key.id === 'ai')!;

/** Synthetic two-half definition: the registry's s3 key is retired (REQ-20),
 *  but the accessKey+secretKey assignment path must stay covered. Targets are
 *  real registry ids so runtimeSecretById resolves them. */
const pairKey = {
  ...aiKey,
  id: 'pair',
  suffix: 'pair',
  label: 'Pair fixture',
  permissionSets: ['ObjectStorageFullAccess'] as const,
  assign: { accessKey: 'adminEmail', secretKey: 'brevoApiKey' },
} as unknown as typeof aiKey;

const baseOptions = {
  callerSecretKey: 'caller-secret',
  projectId: 'proj-1',
  region: 'nl-ams',
  slug: 'demo',
  mode: 'production',
  path: '/demo-production/',
  log: vi.fn(),
};

describe('provisionManagedKey', () => {
  it('mints a scoped key and writes both halves of an access/secret pair', async () => {
    resetMocks();
    getSecretByName.mockImplementation(
      async (name: string) =>
        ({ 'admin-email': { id: 'container-id' }, 'brevo-api-key': { id: 'container-secret' } })[name],
    );
    provisionScopedKey.mockResolvedValue({
      accessKey: 'AK',
      secretKey: 'SK',
      applicationId: 'app-pair',
      organizationId: 'org-1',
    });
    putSecretValue.mockResolvedValue({ revision: 1 });

    const result = await provisionManagedKey({ ...baseOptions, definition: pairKey });

    // Scoped to Object Storage, in the caller's project, minting a key.
    expect(provisionScopedKey).toHaveBeenCalledTimes(1);
    const config = provisionScopedKey.mock.calls[0]![1];
    expect(config).toMatchObject({ suffix: 'pair', mintKey: true });
    expect(config.buildRules({ projectId: 'proj-1', organizationId: 'org-1' })).toEqual([
      { permission_set_names: ['ObjectStorageFullAccess'], project_ids: ['proj-1'] },
    ]);

    // Access key → id container, secret key → secret container, each superseding prior versions.
    expect(putSecretValue).toHaveBeenCalledWith(
      expect.objectContaining({ secretId: 'container-id', value: 'AK', disablePrevious: true }),
    );
    expect(putSecretValue).toHaveBeenCalledWith(
      expect.objectContaining({ secretId: 'container-secret', value: 'SK', disablePrevious: true }),
    );
    expect(result.applicationId).toBe('app-pair');
  });

  it('writes only the secret half for a single-token key (AI)', async () => {
    resetMocks();
    getSecretByName.mockResolvedValue({ id: 'container-ai' });
    provisionScopedKey.mockResolvedValue({
      accessKey: 'AK',
      secretKey: 'SK',
      applicationId: 'app-ai',
      organizationId: 'org-1',
    });
    putSecretValue.mockResolvedValue({ revision: 3 });

    await provisionManagedKey({ ...baseOptions, definition: aiKey });

    expect(putSecretValue).toHaveBeenCalledTimes(1);
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'container-ai', value: 'SK' }));
  });

  it('aborts without minting when a target container does not exist yet', async () => {
    resetMocks();
    getSecretByName.mockResolvedValue(undefined);

    await expect(provisionManagedKey({ ...baseOptions, definition: aiKey })).rejects.toThrow(/no container yet/);

    // Never mint an IAM key we cannot store. That would orphan a live credential.
    expect(provisionScopedKey).not.toHaveBeenCalled();
    expect(putSecretValue).not.toHaveBeenCalled();
  });
});
