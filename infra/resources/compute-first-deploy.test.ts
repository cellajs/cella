import { describe, expect, it, vi } from 'vitest';
import { fakeConfig } from '../tests/helpers/fake-config';
import { installPulumiMocks } from '../tests/helpers/pulumi-mock';

describe('compute on a stack that never had a machine', () => {
  it("plans the first generation in a preview without the deploy's plan: the preflight previews before the deploy writes it", async () => {
    vi.stubEnv('INFRA_RELEASE_PLAN_FILE', '');
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
