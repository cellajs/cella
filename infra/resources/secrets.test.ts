import { signYjsToken, verifyYjsToken, yjsTokenSigningKey, yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { beforeAll, describe, expect, it } from 'vitest';
import { flushPulumi, installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

const material = 'known-yjs-token-key-material-of-32-chars';
let h: MockHarness;

beforeAll(async () => {
  h = await installPulumiMocks({
    stack: 'production',
    // Deferring compute skips image-pin validation; the signing key comes from stack config so its public half is known.
    config: { 'bootstrap:computeDeferred': 'test', 'infra:yjsTokenPrivateKey': material },
  });
  await import('./secrets');
  await flushPulumi();
});

/** A secret input arrives wrapped in Pulumi's secret envelope; the plain value sits under `value`. */
const unwrap = (input: unknown) =>
  input && typeof input === 'object' && 'value' in input ? (input as { value: unknown }).value : input;

describe('secrets module', () => {
  it('writes the relay public key derived from the signing key, and no second random value', () => {
    const versions = Object.fromEntries(
      h.resources
        .filter((r) => r.type === 'scaleway:secrets/version:Version')
        .map((r) => [r.name, unwrap(r.inputs.data)]),
    );
    expect(versions['secret-version-yjs-token-private-key']).toBe(material);
    // The relay's key verifies what the backend signs from the same material.
    const token = signYjsToken(
      { userId: 'u', entityType: 'attachment', tenantId: 't', organizationId: null },
      yjsTokenSigningKey(material),
      60_000,
    );
    const relayKey = yjsTokenVerifyKey(String(versions['secret-version-yjs-token-public-key']));
    expect(verifyYjsToken(token, relayKey).ok).toBe(true);
    const randoms = h.resources
      .filter((r) => r.type === 'random:index/randomPassword:RandomPassword')
      .map((r) => r.name);
    expect(randoms).not.toContain('generated-yjs-token-public-key');
    expect(randoms).not.toContain('generated-yjs-token-private-key');
  });
});
