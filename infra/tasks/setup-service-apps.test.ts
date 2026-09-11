import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provisionScopedKey } from '../lib/scaleway/scaleway-iam';
import { ensureRegistryPrincipals } from './setup-service-apps';

vi.mock('../lib/scaleway/scaleway-iam', () => ({ provisionScopedKey: vi.fn() }));

const base = { callerSecretKey: 'boot-secret', projectId: 'proj', slug: 'cella', mode: 'production' };

beforeEach(() => {
  vi.mocked(provisionScopedKey).mockReset();
  vi.mocked(provisionScopedKey).mockImplementation(
    async (_opts, config) => ({ applicationId: `id-${config.suffix}`, accessKey: '', secretKey: '' }) as never,
  );
});

describe('ensureRegistryPrincipals', () => {
  it('split-VM: one application per registry service plus boot, whatever is enabled', async () => {
    const result = await ensureRegistryPrincipals({ ...base, singleVM: false });
    const suffixes = vi.mocked(provisionScopedKey).mock.calls.map(([, config]) => config.suffix);
    expect(suffixes).toEqual(['vm-backend', 'vm-cdc', 'vm-yjs', 'vm-mcp', 'vm-frontend', 'boot']);
    expect(result.allAppIds).toEqual([
      'id-vm-backend',
      'id-vm-cdc',
      'id-vm-yjs',
      'id-vm-mcp',
      'id-vm-frontend',
      'id-boot',
    ]);
  });

  it('singleVM: only the host application plus boot', async () => {
    const result = await ensureRegistryPrincipals({ ...base, singleVM: true });
    const suffixes = vi.mocked(provisionScopedKey).mock.calls.map(([, config]) => config.suffix);
    expect(suffixes).toEqual(['vm-backend', 'boot']);
    expect(result.serviceAppIds).toEqual({ backend: 'id-vm-backend' });
    expect(result.bootAppId).toBe('id-boot');
  });

  it('creates applications only: policies stay Pulumi-managed and keys are minted per deploy', async () => {
    await ensureRegistryPrincipals({ ...base, singleVM: false });
    for (const [, config] of vi.mocked(provisionScopedKey).mock.calls) {
      expect(config.managePolicy).toBe(false);
      expect(config.mintKey).toBe(false);
    }
  });
});
