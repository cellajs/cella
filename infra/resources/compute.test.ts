import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runtimeSecrets, runtimeSecretsForConsumer } from '../lib/runtime-secrets';
import { fakeConfig } from '../tests/helpers/fake-config';
import {
  bootPlanIn,
  type CapturedResource,
  installPulumiMocks,
  type MockHarness,
  unwrapSecret,
  writeGenerationKeys,
} from '../tests/helpers/pulumi-mock';

// A new generation refuses to plan without a pinnable boot image; the registry lookup is a network call, so it answers a fixed digest here.
vi.mock('../lib/scaleway/release-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/scaleway/release-image')>()),
  resolveReleaseImage: async ({ image }: { image: string }) => ({ image, digest: `sha256:${'a'.repeat(64)}` }),
}));

/** The deploy's staged keys, as tasks/stage-generation-keys.ts writes them for the Pulumi program. */
const keys = {
  bootAccessKey: 'SCWBOOTACCESSKEY',
  bootSecretKey: 'boot-secret-key-value',
  // Keyed by service and release; the test stack's release is `latest`.
  handoffSecretIds: { 'backend@latest': 'handoff-backend-id', 'frontend@latest': 'handoff-frontend-id' },
};

let h: MockHarness;
let servers: CapturedResource[];

beforeAll(async () => {
  writeGenerationKeys(keys);
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

  it('pulls images from a private registry namespace', () => {
    expect(h.oneOfType('scaleway:registry/namespace:Namespace').inputs.isPublic).toBe(false);
  });

  it('pins every image a new machine starts to the digest its release tag resolved to', () => {
    for (const server of servers) {
      const tags = bootPlanOf(server)
        .plan.files.env.split('\n')
        .filter((line) => /^[A-Z0-9]+_TAG=/.test(line));
      expect(tags, server.name).toEqual([expect.stringMatching(new RegExp(`^${serviceOf(server).toUpperCase()}_TAG=[^@]+@sha256:a{64}$`))]);
    }
  });

  it('bakes the minted boot key into every VM and hands each VM the bundles of the services it carries only', () => {
    for (const server of servers) {
      const cloudInit = cloudInitOf(server);
      expect(cloudInit).toContain(`<<'SCW_ACCESS_KEY_EOF'\n${keys.bootAccessKey}\nSCW_ACCESS_KEY_EOF`);
      expect(cloudInit).toContain(`<<'SCW_SECRET_KEY_EOF'\n${keys.bootSecretKey}\nSCW_SECRET_KEY_EOF`);
      const { plan } = bootPlanOf(server);
      expect(
        plan.serviceKeyHandoffs?.map((handoff) => [handoff.service, handoff.secretId]),
        server.name,
      ).toEqual([[serviceOf(server), keys.handoffSecretIds[`${serviceOf(server)}@latest`]]]);
      // Only the upload-signing service gets its key exported as S3 env.
      expect(plan.exportS3Env, server.name).toBe(serviceOf(server) === 'backend' ? true : undefined);
    }
  });

  it('delivers runtime secrets by manifest reference, never as an env value', () => {
    const secretVars = new Set(runtimeSecrets.map((secret) => secret.envVar));
    for (const server of servers) {
      const { plan, raw } = bootPlanOf(server);
      const envVars = plan.files.env.split('\n').map((line) => line.split('=')[0] ?? '');
      expect(
        envVars.filter((name) => secretVars.has(name)),
        server.name,
      ).toEqual([]);
      // The manifest names each secret's env var, Secret Manager id and the service whose copy it is; any other field would be a value baked
      // into cloud-init. On its own machine a service reads its own copies only.
      const manifest = (raw.files as { runtimeSecretManifest: Record<string, unknown>[] }).runtimeSecretManifest;
      for (const entry of manifest) {
        expect(Object.keys(entry).sort()).toEqual(['envVar', 'required', 'secretId', 'service']);
        expect(entry.service, String(entry.envVar)).toBe(serviceOf(server));
        expect(entry.secretId, String(entry.envVar)).toMatch(/^secret-.*-id$/);
      }
      expect(
        manifest.map((entry) => entry.envVar),
        server.name,
      ).toEqual(runtimeSecretsForConsumer(serviceOf(server)).map((secret) => secret.envVar));
    }
  });
});
