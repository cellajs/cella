import { describe, expect, it } from 'vitest';
import { fakeConfig } from '../../tests/helpers/fake-config';
import { machineRoles } from '../machine-roles';
import { deriveInfra } from '../naming';
import { staticEnv } from './static-env';

const envOf = (text: string) =>
  Object.fromEntries(text.split('\n').map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

function render(singleVM: boolean, role: string) {
  const { services } = fakeConfig();
  const config = fakeConfig({ singleVM, services: { ...services, yjs: { ...services.yjs, enabled: true } } });
  const machine = machineRoles(config).find((candidate) => candidate.role === role);
  if (!machine) throw new Error(`no role ${role}`);
  const { naming, region } = deriveInfra(config);
  return envOf(
    staticEnv({
      role: machine,
      registry: 'rg.fr-par.scw.cloud/cella',
      release: 'abc',
      agentDir: '/etc/cella',
      lbInternalAddress: '10.0.0.200',
      suppliers: { APP_ORIGIN: ({ serviceUrl }) => serviceUrl('frontend'), FRONTEND_CSP: () => 'csp', ORIGIN_HOST: () => 'bucket' },
      context: { naming, region, mode: 'production', serviceUrl: (slug) => `https://${slug}.example` },
    }),
  );
}

describe("a machine's static env", () => {
  it("dials the backend's internal listener at the load balancer's private address, which follows every switch, never a machine's", () => {
    expect(render(false, 'cdc').BACKEND_INTERNAL_URL).toBe('http://10.0.0.200:14005');
    expect(render(false, 'yjs').BACKEND_INTERNAL_URL).toBe('http://10.0.0.200:14005');
  });

  it('collapses a folded worker on the single-process host to its own process', () => {
    expect(render(true, 'backend').BACKEND_INTERNAL_URL).toBe('http://127.0.0.1:4005');
  });

  it('names the release tag of every image it runs and the agent it starts', () => {
    expect(render(false, 'backend')).toMatchObject({
      REGISTRY: 'rg.fr-par.scw.cloud/cella',
      BACKEND_TAG: 'abc',
      AGENT_TAG: 'abc',
      AGENT_DIR: '/etc/cella',
    });
  });
});
