import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runtimeSecrets } from '../lib/runtime-secrets';
import { fakeConfig } from '../tests/helpers/fake-config';
import {
  bootPlanIn,
  type CapturedResource,
  cloudConfigFile,
  installPulumiMocks,
  type MockHarness,
  testDeployKey,
  unwrapSecret,
  writeReleasePlan,
} from '../tests/helpers/pulumi-mock';

let h: MockHarness;
let servers: CapturedResource[];

beforeAll(async () => {
  writeReleasePlan();
  // Split-VM with the two services whose env needs no load balancer address: one VM each for the API and the SPA proxy;
  // the cdc and jobs workers are off.
  const { setEngineConfig } = await import('../config/engine-config');
  const { services } = fakeConfig();
  setEngineConfig(fakeConfig({ services: { ...services, cdc: { enabled: false }, jobs: { enabled: false } } }));
  h = await installPulumiMocks();
  await import('./compute');
  await h.settle();
  servers = h.byType('scaleway:instance/server:Server');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const cloudInitOf = (server: CapturedResource) => String(unwrapSecret(server.inputs.cloudInit));

/** The boot plan a VM writes. */
const bootPlanOf = (server: CapturedResource) => bootPlanIn(cloudInitOf(server), '/etc/cella/boot-plan.json');

const serviceOf = (server: CapturedResource) => server.name.split('-')[1] as 'backend' | 'frontend';

describe('compute module', () => {
  it("closes the security group of every zone, and attaches the environment zone's to every generation VM", () => {
    const groups = h.byType('scaleway:instance/securityGroup:SecurityGroup');
    for (const group of groups) expect(group.inputs, group.name).toMatchObject({ inboundDefaultPolicy: 'drop', inboundRules: [] });
    const securityGroup = groups.find((group) => group.name === 'compute-sg');
    if (!securityGroup) throw new Error('no compute-sg');
    expect(servers.map((server) => server.name).sort()).toEqual([
      expect.stringMatching(/^vm-backend-[0-9a-f]{10}$/),
      expect.stringMatching(/^vm-frontend-[0-9a-f]{10}$/),
    ]);
    for (const server of servers) {
      expect(server.inputs.securityGroupId, server.name).toBe(`${securityGroup.name}-id`);
    }
  });

  it("must not give a machine a key or a secret value: its user data holds links that end, the release's digests and the plan", () => {
    const secretVars = new Set(runtimeSecrets.map((secret) => secret.envVar));
    for (const server of servers) {
      const cloudInit = cloudInitOf(server);
      expect(cloudInit.startsWith('#cloud-config\n'), server.name).toBe(true);
      expect(cloudInit, server.name).not.toContain(testDeployKey.secretKey);
      expect(cloudInit, server.name).not.toMatch(/scw-secret-key|docker login|S3_ACCESS_KEY/);
      const { plan } = bootPlanOf(server);
      const envVars = plan.files.env.split('\n').map((line) => line.split('=')[0] ?? '');
      expect(
        envVars.filter((name) => secretVars.has(name) || name.startsWith('S3_')),
        server.name,
      ).toEqual([]);
      // Every link names one object of the boot-diag bucket and ends within minutes; the env file is the machine's own.
      const links = [plan.links.env, plan.links.bootAccount, ...plan.links.archives.map((archive) => archive.url)];
      for (const link of links)
        expect(link, server.name).toMatch(
          /^https:\/\/cella-[a-z-]*boot-diag\.s3\.[a-z-]+\.scw\.cloud\/.+X-Amz-Expires=(900|1800)&.*X-Amz-Signature=/,
        );
      expect(plan.links.env).toContain(`/env/${serviceOf(server)}.env?`);
      expect(plan.links.bootAccount).toContain('x-id=PutObject');
    }
  });

  it("loads every image a machine starts from the release's archive, at the digest of the plan", () => {
    for (const server of servers) {
      const { plan } = bootPlanOf(server);
      expect(
        plan.links.archives.map((archive) => [archive.name, archive.sha256]),
        server.name,
      ).toEqual([[serviceOf(server), 'a'.repeat(64)]]);
      const tags = plan.files.env.split('\n').filter((line) => /^[A-Z0-9]+_TAG=/.test(line));
      expect(tags, server.name).toEqual([`${serviceOf(server).toUpperCase()}_TAG=latest`]);
      expect(cloudConfigFile(cloudInitOf(server), '/etc/cella/boot.env')).toMatch(
        /^BOOT_IMAGE=.+\/infra-boot:latest\nBOOT_ARCHIVE_SHA256=a{64}\nBOOT_ARCHIVE_URL=https:/,
      );
    }
  });
});
