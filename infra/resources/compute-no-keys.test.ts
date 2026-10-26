import { describe, expect, it, vi } from 'vitest';
import { fakeConfig } from '../tests/helpers/fake-config';
import { installPulumiMocks } from '../tests/helpers/pulumi-mock';

vi.mock('../lib/scaleway/release-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/scaleway/release-image')>()),
  resolveReleaseImage: async ({ image }: { image: string }) => ({ image, digest: `sha256:${'a'.repeat(64)}` }),
}));

describe('compute without the deploy keys', () => {
  it('must not bake an empty key: an update that would make a new generation refuses', async () => {
    vi.stubEnv('INFRA_GENERATION_KEYS_FILE', '');
    const { setEngineConfig } = await import('../config/engine-config');
    const { services } = fakeConfig();
    setEngineConfig(fakeConfig({ services: { ...services, cdc: { enabled: false }, jobs: { enabled: false } } }));
    await installPulumiMocks();
    await expect(import('./compute')).rejects.toThrow('planning a NEW backend generation without INFRA_GENERATION_KEYS_FILE');
    vi.unstubAllEnvs();
  });
});
