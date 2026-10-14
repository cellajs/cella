import { signYjsToken, verifyYjsToken, yjsTokenSigningKey, yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { beforeAll, describe, expect, it } from 'vitest';
import { runtimeSecrets } from '../lib/runtime-secrets';
import { secretCopies } from '../lib/scaleway/secret-paths';
import { installPulumiMocks, type MockHarness, unwrapSecret } from '../tests/helpers/pulumi-mock';

const material = 'known-yjs-token-key-material-of-32-chars';
let h: MockHarness;
let slug: string;

beforeAll(async () => {
  // The signing key comes from stack config, so its public half is known.
  h = await installPulumiMocks({ deferCompute: true, config: { 'infra:yjsTokenPrivateKey': material } });
  await import('./secrets');
  ({ slug } = (await import('../pulumi-context')).naming);
  await h.settle();
});

const containers = () => h.resources.filter((r) => r.type === 'scaleway:secrets/secret:Secret');
const versions = () => h.resources.filter((r) => r.type === 'scaleway:secrets/version:Version');

describe('secrets module', () => {
  it('files one copy of every runtime secret in the folder of each consumer, never at the root', () => {
    for (const definition of runtimeSecrets) {
      const paths = containers()
        .filter((r) => r.inputs.name === definition.secretName)
        .map((r) => String(r.inputs.path))
        .sort();
      // The machine grants are conditioned on these folders (tests/unit/secret-scope.test.ts proves what each covers).
      expect(paths, definition.id).toEqual(
        secretCopies(definition, slug, 'production')
          .map((copy) => copy.path)
          .sort(),
      );
      for (const path of paths) expect(path).toMatch(new RegExp(`^/${slug}-production/[^/]+/$`));
    }
  });

  it('writes a version into every copy of a pulumi-owned secret and never into an operator-supplied one', () => {
    const versioned = new Set(versions().map((r) => r.inputs.secretId));
    for (const definition of runtimeSecrets) {
      for (const container of containers().filter((r) => r.inputs.name === definition.secretName)) {
        expect(versioned.has(`${container.name}-id`), `${definition.id} ${container.name}`).toBe(definition.valueSource === 'pulumi');
      }
    }
  });

  it('generates every random secret value with at least 32 characters', () => {
    const randoms = h.resources.filter((r) => r.type === 'random:index/randomPassword:RandomPassword');
    expect(randoms.length).toBeGreaterThan(0);
    for (const random of randoms) expect(random.inputs.length, random.name).toBeGreaterThanOrEqual(32);
  });

  it('writes the relay public key derived from the signing key, and no second random value', () => {
    const versionData = Object.fromEntries(versions().map((r) => [r.name, unwrapSecret(r.inputs.data)]));
    expect(versionData['secret-version-yjs-token-private-key@backend']).toBe(material);
    // The relay's key verifies what the backend signs from the same material.
    const token = signYjsToken(
      { userId: 'u', entityType: 'attachment', entityId: 'e', tenantId: 't', organizationId: null },
      yjsTokenSigningKey(material),
      60_000,
    );
    const relayKey = yjsTokenVerifyKey(String(versionData['secret-version-yjs-token-public-key@yjs']));
    expect(verifyYjsToken(token, relayKey).ok).toBe(true);
    const randoms = h.resources.filter((r) => r.type === 'random:index/randomPassword:RandomPassword').map((r) => r.name);
    expect(randoms).not.toContain('generated-yjs-token-public-key');
    expect(randoms).not.toContain('generated-yjs-token-private-key');
  });
});
