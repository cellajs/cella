import { describe, expect, it, vi } from 'vitest';
import { fakeConfig } from '../tests/helpers/fake-config';
import { installPulumiMocks, writeGenerationKeys } from '../tests/helpers/pulumi-mock';

vi.mock('../lib/scaleway/release-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/scaleway/release-image')>()),
  resolveReleaseImage: async ({ image }: { image: string }) => ({ image, digest: `sha256:${'a'.repeat(64)}` }),
}));

describe('compute with keys staged for another release', () => {
  it('must not let a new machine of one release take the bundle staged for another', async () => {
    // The deploy staged bundles for release `other`; the stack plans a generation of `latest`.
    writeGenerationKeys({
      bootAccessKey: 'ak',
      bootSecretKey: 'sk',
      handoffSecretIds: { 'backend@other': 'handoff-backend', 'frontend@other': 'handoff-frontend' },
    });
    const { setEngineConfig } = await import('../config/engine-config');
    const { services } = fakeConfig();
    setEngineConfig(fakeConfig({ services: { ...services, cdc: { enabled: false }, jobs: { enabled: false } } }));
    await installPulumiMocks();
    await expect(import('./compute')).rejects.toThrow(/generation of latest carries backend, for which the deploy staged no key for that release/);
    vi.unstubAllEnvs();
  });
});
