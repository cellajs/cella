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
vi.mock('../lib/scaleway/boot-image', () => ({
  resolveBootImage: async () => ({ image: 'infra-boot', digest: `sha256:${'a'.repeat(64)}` }),
}));

/** The deploy's minted keys, as tasks/mint-generation-keys.ts writes them for the Pulumi program. */
const keys = {
  bootAccessKey: 'SCWBOOTACCESSKEY',
  bootSecretKey: 'boot-secret-key-value',
  handoffSecretIds: { backend: 'handoff-backend-id', frontend: 'handoff-frontend-id' },
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

const serviceOf = (server: CapturedResource) => server.name.split('-')[1] as keyof typeof keys.handoffSecretIds;

describe('compute module', () => {
  it('attaches the closed security group to every generation VM', () => {
    const securityGroup = h.oneOfType('scaleway:instance/securityGroup:SecurityGroup');
    expect(securityGroup.inputs).toMatchObject({ inboundDefaultPolicy: 'drop', inboundRules: [] });
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

  it('bakes the minted boot key into every VM and hands each VM its own service bundle only', () => {
    for (const server of servers) {
      const cloudInit = cloudInitOf(server);
      expect(cloudInit).toContain(`<<'SCW_ACCESS_KEY_EOF'\n${keys.bootAccessKey}\nSCW_ACCESS_KEY_EOF`);
      expect(cloudInit).toContain(`<<'SCW_SECRET_KEY_EOF'\n${keys.bootSecretKey}\nSCW_SECRET_KEY_EOF`);
      const { plan } = bootPlanOf(server);
      expect(plan.serviceKeyHandoff?.secretId, server.name).toBe(keys.handoffSecretIds[serviceOf(server)]);
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
      // The manifest names each secret's env var and Secret Manager id; any other field would be a value baked into cloud-init.
      const manifest = (raw.files as { runtimeSecretManifest: Record<string, unknown>[] }).runtimeSecretManifest;
      for (const entry of manifest) {
        expect(Object.keys(entry).sort()).toEqual(['envVar', 'required', 'secretId']);
        expect(entry.secretId, String(entry.envVar)).toMatch(/^secret-.*-id$/);
      }
      expect(
        manifest.map((entry) => entry.envVar),
        server.name,
      ).toEqual(runtimeSecretsForConsumer(serviceOf(server)).map((secret) => secret.envVar));
    }
  });
});
