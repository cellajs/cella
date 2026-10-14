import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import { provisionScopedKey } from '../lib/scaleway/scaleway-iam';
import { ensureMachineIdentities, missingMachineIdentities } from './machine-identities';

vi.mock('../lib/scaleway/scaleway-iam', () => ({ provisionScopedKey: vi.fn() }));
vi.mock('../lib/scaleway/iam-client', () => ({ resolveApplicationIdByName: vi.fn() }));

const base = { callerSecretKey: 'boot-secret', organizationId: 'org-1', projectId: 'proj', slug: 'cella', mode: 'production' };

beforeEach(() => {
  vi.mocked(provisionScopedKey).mockReset();
  vi.mocked(provisionScopedKey).mockImplementation(
    async (_opts, config) => ({ applicationId: `id-${config.suffix}`, accessKey: '', secretKey: '' }) as never,
  );
});

describe('ensureMachineIdentities', () => {
  it('one application per registry service plus boot and builder, whatever is enabled and wherever it runs', async () => {
    const result = await ensureMachineIdentities(base);
    const suffixes = vi.mocked(provisionScopedKey).mock.calls.map(([, config]) => config.suffix);
    expect(suffixes).toEqual(['vm-backend', 'vm-cdc', 'vm-yjs', 'vm-mcp', 'vm-oauth', 'vm-jobs', 'vm-frontend', 'boot', 'builder']);
    expect(result.allAppIds).toEqual([
      'id-vm-backend',
      'id-vm-cdc',
      'id-vm-yjs',
      'id-vm-mcp',
      'id-vm-oauth',
      'id-vm-jobs',
      'id-vm-frontend',
      'id-boot',
      'id-builder',
    ]);
  });

  it('creates applications only: their policies and standing keys are written apart', async () => {
    await ensureMachineIdentities(base);
    for (const [, config] of vi.mocked(provisionScopedKey).mock.calls) {
      expect(config.managePolicy).toBe(false);
      expect(config.mintKey).toBe(false);
    }
  });
});

describe('missingMachineIdentities', () => {
  const check = { secretKey: 'operator-secret', organizationId: 'org-1', slug: 'cella', mode: 'production' };

  it('names the applications the registry needs and Scaleway does not have, without creating one', async () => {
    vi.mocked(resolveApplicationIdByName).mockImplementation(async (_auth, _org, name) =>
      name.endsWith('-vm-jobs') || name.endsWith('-boot') ? null : 'id',
    );

    expect(await missingMachineIdentities(check)).toEqual(['cella-production-vm-jobs', 'cella-production-boot']);
    expect(provisionScopedKey).not.toHaveBeenCalled();
  });

  it('is empty when every principal exists, and asks for every registry service', async () => {
    vi.mocked(resolveApplicationIdByName).mockReset();
    vi.mocked(resolveApplicationIdByName).mockResolvedValue('id');

    expect(await missingMachineIdentities(check)).toEqual([]);
    expect(vi.mocked(resolveApplicationIdByName).mock.calls.map(([, , name]) => name)).toEqual([
      ...['backend', 'cdc', 'yjs', 'mcp', 'oauth', 'jobs', 'frontend'].map((service) => `cella-production-vm-${service}`),
      'cella-production-boot',
      'cella-production-builder',
    ]);
  });
});
