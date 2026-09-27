import { signYjsToken, verifyYjsToken, yjsTokenSigningKey, yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { beforeAll, describe, expect, it } from 'vitest';
import { runtimeSecrets } from '../lib/runtime-secrets';
import { secretPathFor } from '../lib/scaleway/secret-paths';
import { installPulumiMocks, type MockHarness, unwrapSecret } from '../tests/helpers/pulumi-mock';

const material = 'known-yjs-token-key-material-of-32-chars';
let h: MockHarness;

beforeAll(async () => {
  // The signing key comes from stack config, so its public half is known.
  h = await installPulumiMocks({ deferCompute: true, config: { 'infra:yjsTokenPrivateKey': material } });
  await import('./secrets');
  await h.settle();
});

const containers = () => h.resources.filter((r) => r.type === 'scaleway:secrets/secret:Secret');
const versions = () => h.resources.filter((r) => r.type === 'scaleway:secrets/version:Version');

describe('secrets module', () => {
  it('files every runtime secret under its consumer folder of the stack, never at the root', () => {
    expect(
      containers()
        .map((r) => r.inputs.name)
        .sort(),
    ).toEqual(runtimeSecrets.map((s) => s.secretName).sort());
    for (const definition of runtimeSecrets) {
      const path = String(containers().find((r) => r.inputs.name === definition.secretName)?.inputs.path);
      // The VM grants are conditioned on these folders (tests/unit/secret-scope.test.ts proves what each covers), so the container must sit in the folder its consumer set owns.
      expect(path, definition.id).toBe(secretPathFor(definition, 'cella', 'production'));
      expect(path).toMatch(/^\/cella-production\/.+\/$/);
    }
  });

  it('writes a version for every pulumi-owned secret and never for an operator-supplied one', () => {
    const versioned = new Set(versions().map((r) => r.inputs.secretId));
    for (const definition of runtimeSecrets) {
      const container = containers().find((r) => r.inputs.name === definition.secretName);
      expect(versioned.has(`${container?.name}-id`), definition.id).toBe(definition.valueSource === 'pulumi');
    }
  });

  it('generates every random secret value with at least 32 characters', () => {
    const randoms = h.resources.filter((r) => r.type === 'random:index/randomPassword:RandomPassword');
    expect(randoms.length).toBeGreaterThan(0);
    for (const random of randoms) expect(random.inputs.length, random.name).toBeGreaterThanOrEqual(32);
  });

  it('writes the relay public key derived from the signing key, and no second random value', () => {
    const versionData = Object.fromEntries(versions().map((r) => [r.name, unwrapSecret(r.inputs.data)]));
    expect(versionData['secret-version-yjs-token-private-key']).toBe(material);
    // The relay's key verifies what the backend signs from the same material.
    const token = signYjsToken(
      { userId: 'u', entityType: 'attachment', entityId: 'e', tenantId: 't', organizationId: null },
      yjsTokenSigningKey(material),
      60_000,
    );
    const relayKey = yjsTokenVerifyKey(String(versionData['secret-version-yjs-token-public-key']));
    expect(verifyYjsToken(token, relayKey).ok).toBe(true);
    const randoms = h.resources
      .filter((r) => r.type === 'random:index/randomPassword:RandomPassword')
      .map((r) => r.name);
    expect(randoms).not.toContain('generated-yjs-token-public-key');
    expect(randoms).not.toContain('generated-yjs-token-private-key');
  });
});
