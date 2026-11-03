import { describe, expect, it, vi } from 'vitest';
import { fakeConfig } from '../tests/helpers/fake-config';
import { bootPlanIn, installPulumiMocks, unwrapSecret, writeReleasePlan } from '../tests/helpers/pulumi-mock';

describe('compute on a singleVM host', () => {
  it('starts every container the host carries, each image once from its archive, with the env file of the host', async () => {
    writeReleasePlan();
    const { setEngineConfig } = await import('../config/engine-config');
    setEngineConfig(fakeConfig({ singleVM: true }));
    const h = await installPulumiMocks();
    await import('./compute');
    await h.settle();

    const [host, ...others] = h.byType('scaleway:instance/server:Server');
    expect(others).toEqual([]);
    const { plan } = bootPlanIn(String(unwrapSecret(host?.inputs.cloudInit)), '/etc/cella/boot-plan.json');
    expect(plan.services).toEqual(['backend', 'frontend']);
    expect(plan.links.archives.map((archive) => archive.name)).toEqual(['backend', 'frontend']);
    expect(plan.links.env).toContain('/env/backend.env?');
    vi.unstubAllEnvs();
  });
});
