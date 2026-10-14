import type { ComponentResourceOptions } from '@pulumi/pulumi';
import { describe, expect, it, vi } from 'vitest';
import { makeFetch } from '../tests/helpers/fake-fetch';
import { installPulumiMocks } from '../tests/helpers/pulumi-mock';

// The propagation and readiness gates poll the network; a plain component stands in.
vi.mock('./dns-cert-gates', async () => {
  const pulumi = await import('@pulumi/pulumi');
  class Gate extends pulumi.ComponentResource {
    constructor(name: string, _args: unknown, opts?: ComponentResourceOptions) {
      super('test:gate:Gate', name, {}, opts);
      this.registerOutputs({});
    }
  }
  return { DnsPropagationGate: Gate, CertReadyGate: Gate };
});

describe('the load balancer on a setup that has no machine yet', () => {
  it('is made with its records and certificates and empty pools, so the first deploy writes no DNS', async () => {
    vi.stubEnv('SCW_SECRET_KEY', 'test-secret-key');
    vi.stubGlobal('fetch', makeFetch([{ method: 'GET', match: '/ipam/v1/', body: { ips: [{ address: '10.0.0.200/24' }] } }]).fn);
    const h = await installPulumiMocks({ deferCompute: true });
    await import('./loadbalancer');
    await h.settle();

    expect(h.byType('scaleway:instance/server:Server')).toEqual([]);
    expect(h.byType('scaleway:loadbalancers/loadBalancer:LoadBalancer')).toHaveLength(1);
    expect(h.byType('scaleway:domain/record:Record').length).toBeGreaterThan(0);
    expect(h.byType('scaleway:loadbalancers/certificate:Certificate').length).toBeGreaterThan(0);
    const backends = h.byType('scaleway:loadbalancers/backend:Backend');
    expect(backends.length).toBeGreaterThan(0);
    for (const backend of backends) expect(backend.inputs.serverIps ?? []).toEqual([]);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
