import { describe, expect, it, vi } from 'vitest';
import { serviceNames } from '../lib/services';
import { fakeConfig } from '../tests/helpers/fake-config';
import { bootPlanIn, installPulumiMocks, unwrapSecret, writeGenerationKeys } from '../tests/helpers/pulumi-mock';

vi.mock('../lib/scaleway/release-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/scaleway/release-image')>()),
  resolveReleaseImage: async ({ image }: { image: string }) => ({ image, digest: `sha256:${'a'.repeat(64)}` }),
}));

describe('compute on a singleVM host', () => {
  it('gives the host the key of every service it carries, so each copy its manifest reads has the key that reads it', async () => {
    writeGenerationKeys(Object.fromEntries(serviceNames.map((slug) => [slug, { accessKey: `ak-${slug}`, secretKey: `sk-${slug}` }])));
    const { setEngineConfig } = await import('../config/engine-config');
    setEngineConfig(fakeConfig({ singleVM: true }));
    const h = await installPulumiMocks();
    await import('./compute');
    await h.settle();

    const [host, ...others] = h.byType('scaleway:instance/server:Server');
    expect(others).toEqual([]);
    const cloudInit = String(unwrapSecret(host?.inputs.cloudInit));
    const { plan } = bootPlanIn(cloudInit, '/etc/cella/boot-plan.json');
    const keyFiles = plan.serviceSecretKeyFiles ?? {};
    expect(Object.keys(keyFiles).length).toBeGreaterThan(0);
    for (const entry of plan.files.runtimeSecretManifest) expect([plan.service, ...Object.keys(keyFiles)]).toContain(entry.service);
    for (const [service, file] of Object.entries(keyFiles)) expect(cloudInit).toContain(`cat > ${file} <<'SCW_SECRET_KEY_EOF'\nsk-${service}\n`);
    vi.unstubAllEnvs();
  });
});
