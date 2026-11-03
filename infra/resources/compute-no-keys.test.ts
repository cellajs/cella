import { describe, expect, it, vi } from 'vitest';
import { fakeConfig } from '../tests/helpers/fake-config';
import { installPulumiMocks } from '../tests/helpers/pulumi-mock';

describe('compute without the release plan', () => {
  it('must not make a machine that boots nothing: an update that would make a new generation refuses', async () => {
    vi.stubEnv('INFRA_RELEASE_PLAN_FILE', '');
    const { setEngineConfig } = await import('../config/engine-config');
    const { services } = fakeConfig();
    setEngineConfig(fakeConfig({ services: { ...services, cdc: { enabled: false }, jobs: { enabled: false } } }));
    await installPulumiMocks();
    await expect(import('./compute')).rejects.toThrow('planning a NEW backend generation without INFRA_RELEASE_PLAN_FILE');
    vi.unstubAllEnvs();
  });
});
