import type { ComponentResourceOptions } from '@pulumi/pulumi';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { agentPort } from '../lib/machine-roles';
import { servicesByName } from '../lib/services';
import { makeFetch } from '../tests/helpers/fake-fetch';
import { type CapturedResource, installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

// The propagation and readiness gates are dynamic resources whose providers poll the network; a plain component stands in so the graph they gate renders.
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

// Split mode with the path-routed WebSocket relay enabled, so a pool with WebSocket timeouts and an internal-listener consumer both render.
vi.mock('../config/engine-config', async () => {
  const { fakeConfig } = await import('../tests/helpers/fake-config');
  const { services } = fakeConfig();
  return { engineConfig: fakeConfig({ services: { ...services, yjs: { ...services.yjs, enabled: true } } }) };
});

let h: MockHarness;
const named = (name: string): CapturedResource => {
  const resource = h.resources.find((r) => r.name === name);
  if (!resource) throw new Error(`no resource named ${name}; captured: ${h.resources.map((r) => r.name).join(', ')}`);
  return resource;
};
const id = (name: string) => `${name}-id`;

beforeAll(async () => {
  // The LB resolves its private-network address from IPAM over HTTPS.
  vi.stubEnv('SCW_SECRET_KEY', 'test-secret-key');
  vi.stubGlobal('fetch', makeFetch([{ method: 'GET', match: '/ipam/v1/', body: { ips: [{ address: '10.0.0.200/24' }] } }]).fn);
  h = await installPulumiMocks();
  await import('./loadbalancer');
  await import('./dns');
  await h.settle();
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('load balancer', () => {
  it('terminates TLS on 443 with a certificate per public host, and redirects plain HTTP to https', () => {
    const https = named('https-frontend');
    expect(https.inputs.inboundPort).toBe(443);
    const certificates = h.byType('scaleway:loadbalancers/certificate:Certificate');
    expect(certificates.map((c) => (c.inputs.letsencrypt as { commonName: string }).commonName).sort()).toEqual(['cellajs.com', 'www.cellajs.com']);
    expect([...(https.inputs.certificateIds as string[])].sort()).toEqual(certificates.map((c) => id(c.name)).sort());

    const http = named('http-frontend');
    expect(http.inputs.inboundPort).toBe(80);
    const redirect = h.byType('scaleway:loadbalancers/acl:Acl').find((acl) => acl.inputs.frontendId === id(http.name));
    expect(redirect?.inputs.match).toEqual({ httpFilter: 'acl_http_filter_none' });
    expect(redirect?.inputs.action).toEqual({
      type: 'redirect',
      redirects: [{ type: 'scheme', target: 'https', code: 301 }],
    });
  });

  it('redirects the zone apex to the app host, except the worker script, which the app answers so a worker kept on the apex is replaced', () => {
    const https = named('https-frontend');
    const acls = h
      .byType('scaleway:loadbalancers/acl:Acl')
      .filter((acl) => acl.inputs.frontendId === id(https.name))
      .sort((a, b) => Number(a.inputs.index) - Number(b.inputs.index))
      .map((acl) => [acl.inputs.action, acl.inputs.match]);
    expect(acls).toEqual([
      [{ type: 'allow' }, { httpFilter: 'path_begin', httpFilterValues: ['/sw.js'] }],
      [
        { type: 'redirect', redirects: [{ type: 'location', target: 'https://www.cellajs.com/{{path}}?{{query}}', code: 301 }] },
        { httpFilter: 'http_header_match', httpFilterOption: 'host', httpFilterValues: ['cellajs.com'] },
      ],
    ]);
  });

  it('publishes the public hosts at the LB and restricts certificate issuance to the LB certificate authority', () => {
    const records = h.byType('scaleway:domain/record:Record');
    expect(records.filter((r) => r.inputs.type === 'A').map((r) => [r.name, r.inputs.name, r.inputs.data])).toEqual([
      ['app-dns', 'www', '203.0.113.10'],
      ['apex-dns', '', '203.0.113.10'],
    ]);
    expect(records.filter((r) => r.inputs.type === 'CAA').map((r) => r.inputs.data)).toEqual([
      '0 issue "letsencrypt.org"',
      '0 iodef "mailto:security@cellajs.com"',
    ]);
  });

  it('exposes the internal listener only through a frontend that admits the private network and denies the rest', () => {
    const frontends = h.byType('scaleway:loadbalancers/frontend:Frontend');
    expect(frontends.map((f) => f.name).sort()).toEqual(['backend-internal-frontend', 'http-frontend', 'https-frontend']);
    const subnet = (h.oneOfType('scaleway:network/privateNetwork:PrivateNetwork').inputs.ipv4Subnet as { subnet: string }).subnet;
    const internal = named('backend-internal-frontend');
    expect(internal.inputs.certificateIds).toBeUndefined();
    const acls = h
      .byType('scaleway:loadbalancers/acl:Acl')
      .filter((acl) => acl.inputs.frontendId === id(internal.name))
      .sort((a, b) => Number(a.inputs.index) - Number(b.inputs.index))
      .map((acl) => [acl.inputs.action, acl.inputs.match]);
    expect(acls).toEqual([
      [{ type: 'allow' }, { ipSubnets: [subnet] }],
      [{ type: 'deny' }, { httpFilter: 'acl_http_filter_none' }],
    ]);
    // Its pool forwards to the internal listener and kills sessions on mark-down; every public pool forwards to the service's app port.
    const backends = h.byType('scaleway:loadbalancers/backend:Backend');
    const internalPool = backends.find((b) => id(b.name) === internal.inputs.backendId);
    const backendService = servicesByName.get('backend');
    expect(internalPool?.inputs).toMatchObject({
      forwardPort: backendService?.internalPort,
      onMarkedDownAction: 'shutdown_sessions',
      timeoutTunnel: '1h',
    });
    for (const pool of backends.filter((b) => b !== internalPool)) {
      const service = servicesByName.get(pool.name.replace('-lb-backend', '') as never);
      expect(pool.inputs.forwardPort, pool.name).toBe(service?.healthPort);
    }
    // No public frontend or route reaches the internal pool; the path routes lead to their own service.
    const routes = h.byType('scaleway:loadbalancers/route:Route');
    const publicTargets = [named('https-frontend'), named('http-frontend'), ...routes].map((r) => r.inputs.backendId);
    expect(publicTargets).not.toContain(id(internalPool?.name ?? ''));
    expect(routes.map((r) => [r.inputs.matchPathBegin, r.inputs.backendId]).sort()).toEqual([
      ['/api', id('backend-lb-backend')],
      ['/yjs', id('yjs-lb-backend')],
    ]);
    expect(named('https-frontend').inputs.backendId).toBe(id('frontend-lb-backend'));
  });

  it("lists each role's two reserved addresses in its pools for good, and moves traffic by the agent's answer at the shortest check", () => {
    const lb = named('main-lb');
    expect(lb.inputs.privateNetworks).toEqual([{ privateNetworkId: id('main-private-network') }]);
    for (const pool of h.byType('scaleway:loadbalancers/backend:Backend')) {
      const slug = pool.name.replace(/-(internal-)?lb-backend$/, '');
      const reserved = ['a', 'b'].map((slot) => named(`slot-${slug}-${slot}`));
      expect(
        reserved.map((r) => r.inputs.tags),
        pool.name,
      ).toEqual([expect.arrayContaining([`cella-production-${slug}-a`]), expect.arrayContaining([`cella-production-${slug}-b`])]);
      expect(pool.inputs.serverIps, pool.name).toEqual(reserved.map((r) => String(r.outputs.address).split('/')[0]));
      // Measured: a 503 takes a server out 1.3 s later at these values, and none of 447 requests during the switch failed.
      expect(pool.inputs, pool.name).toMatchObject({
        healthCheckPort: agentPort(slug),
        healthCheckHttp: { uri: `/health/${slug}`, code: 200 },
        healthCheckDelay: '1s',
        healthCheckTimeout: '1s',
        healthCheckMaxRetries: 2,
        healthCheckTransientDelay: '0.5s',
      });
    }
  });

  it('keeps the resource names of the live stack, so an update replaces no certificate, record or pool', () => {
    // Renaming a Pulumi resource replaces it: a new certificate waits on issuance and a new record on propagation, both with the old one gone.
    const names = h.resources.map((r) => r.name);
    for (const name of ['app-dns', 'apex-dns', 'app-cert', 'apex-cert', 'https-frontend', 'http-frontend', 'main-lb', 'lb-ip']) {
      expect(names).toContain(name);
    }
  });
});
