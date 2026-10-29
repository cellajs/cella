import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = { getSecretByName: vi.fn(), accessLatestValue: vi.fn(), ensureSecret: vi.fn(), putSecretValue: vi.fn() };
const createSecretManagerClient = vi.fn(() => client);
vi.mock('../lib/scaleway/scaleway-secret-manager', () => ({
  createSecretManagerClient: (...args: unknown[]) => createSecretManagerClient(...(args as [])),
}));

const { readCustodiedPassphrase, storeCustodiedPassphrase } = await import('./passphrase-custody');

const opts = { secretKey: 'operator-secret', region: 'nl-ams', projectId: 'project-1' };

beforeEach(() => {
  vi.resetAllMocks();
  createSecretManagerClient.mockReturnValue(client);
});

describe('readCustodiedPassphrase', () => {
  it('reads the passphrase from the engine folder, which no VM may read', async () => {
    client.getSecretByName.mockResolvedValue({ id: 'secret-1' });
    client.accessLatestValue.mockResolvedValue('correct horse');

    await expect(readCustodiedPassphrase(opts)).resolves.toBe('correct horse');
    expect(client.getSecretByName).toHaveBeenCalledWith('pulumi-passphrase', '/engine/');
    expect(createSecretManagerClient).toHaveBeenCalledWith({ secretKey: 'operator-secret', region: 'nl-ams', projectId: 'project-1' });
  });

  it('is undefined for a stack that stored none yet, so the caller asks once', async () => {
    client.getSecretByName.mockResolvedValue(undefined);
    await expect(readCustodiedPassphrase(opts)).resolves.toBeUndefined();
    expect(client.accessLatestValue).not.toHaveBeenCalled();
  });
});

describe('storeCustodiedPassphrase', () => {
  it('must not keep serving an old passphrase after a rotation: the new version disables the one before', async () => {
    client.ensureSecret.mockResolvedValue({ id: 'secret-1' });

    await storeCustodiedPassphrase({ ...opts, passphrase: 'new horse' });

    expect(client.ensureSecret).toHaveBeenCalledWith(expect.objectContaining({ name: 'pulumi-passphrase', path: '/engine/' }));
    expect(client.putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'secret-1', value: 'new horse', disablePrevious: true }));
  });
});
