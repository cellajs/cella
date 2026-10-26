import { describe, expect, it, vi } from 'vitest';
import { fakeConfig } from '../tests/helpers/fake-config';
import { installPulumiMocks } from '../tests/helpers/pulumi-mock';

vi.mock('../lib/scaleway/release-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/scaleway/release-image')>()),
  resolveReleaseImage: async ({ image }: { image: string }) => ({ image, digest: `sha256:${'a'.repeat(64)}` }),
}));

describe('compute on a stack that never had a machine', () => {
  it("plans the first generation in a preview without the deploy's keys: the preflight previews before the keys are minted", async () => {
    vi.stubEnv('INFRA_GENERATION_KEYS_FILE', '');
    const { setEngineConfig } = await import('../config/engine-config');
    const { services } = fakeConfig();
    setEngineConfig(fakeConfig({ services: { ...services, cdc: { enabled: false }, jobs: { enabled: false } } }));
    const h = await installPulumiMocks({ preview: true });
    await import('./compute');
    await h.settle();

    const servers = h.byType('scaleway:instance/server:Server');
    expect(servers.length).toBeGreaterThan(0);
    vi.unstubAllEnvs();
  });
});
