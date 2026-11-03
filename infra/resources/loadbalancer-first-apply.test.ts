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

describe('the pools of a migration from machines the program made', () => {
  it('must not drop a serving machine before the new ones serve: its address stays beside the reserved ones, checked on the app health path both answer', async () => {
    vi.stubEnv('SCW_SECRET_KEY', 'test-secret-key');
    vi.stubGlobal('fetch', makeFetch([{ method: 'GET', match: '/ipam/v1/', body: { ips: [{ address: '10.0.0.200/24' }] } }]).fn);
    const h = await installPulumiMocks({
      // Production runs in single-process form: every pool lists the host's addresses.
      config: { 'bootstrap:legacyServers': JSON.stringify({ backend: ['10.0.0.41'], 'backend-internal': ['10.0.0.41'], frontend: ['10.0.0.41'] }) },
    });
    await import('./loadbalancer');
    await h.settle();

    expect(h.byType('scaleway:instance/server:Server')).toEqual([]);
    const pools = new Map(h.byType('scaleway:loadbalancers/backend:Backend').map((pool) => [pool.name, pool.inputs]));
    const reserved = (role: string) =>
      ['a', 'b'].map((slot) => String(h.resources.find((r) => r.name === `slot-${role}-${slot}`)?.outputs.address).split('/')[0]);
    expect(pools.get('backend-lb-backend')?.serverIps).toEqual([...reserved('backend'), '10.0.0.41']);
    expect(pools.get('backend-internal-lb-backend')?.serverIps).toEqual([...reserved('backend'), '10.0.0.41']);
    expect(pools.get('frontend-lb-backend')?.serverIps).toEqual([...reserved('backend'), '10.0.0.41']);
    // A legacy machine runs no agent: the agent's port would mark it down at the apply. The shortest check keeps its power-off short.
    expect(pools.get('backend-lb-backend')).toMatchObject({ healthCheckHttp: { uri: '/health', code: 204 }, healthCheckDelay: '1s' });
    expect(pools.get('backend-lb-backend')?.healthCheckPort).toBeUndefined();

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    // The render of the load balancer module takes a few seconds while the whole suite runs.
  }, 20_000);
});
