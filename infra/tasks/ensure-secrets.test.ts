import { signYjsToken, verifyYjsToken, yjsTokenSigningKey, yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { describe, expect, it } from 'vitest';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { type EnsureSecretsClient, ensureSecrets, generateSecretValue } from './ensure-secrets';

/** Secret Manager as a fake: `path + name` → the value its latest version holds (undefined for an empty container); writes are recorded. */
function fakeClient(store: Record<string, string | undefined>) {
  const writes: Record<string, string> = {};
  const client: EnsureSecretsClient = {
    getSecretByName: async (name, path) =>
      `${path}${name}` in store
        ? ({ id: `${path}${name}`, name, path, version_count: store[`${path}${name}`] === undefined ? 0 : 1 } as SecretManagerSecret)
        : undefined,
    accessLatestValue: async (id) => store[id] ?? '',
    putSecretValue: async (input) => {
      writes[input.secretId] = input.value;
      store[input.secretId] = input.value;
      return {};
    },
  };
  return { client, writes };
}

const cookie: RuntimeSecretDefinition = {
  ...(runtimeSecrets.find((s) => s.secretName === 'cookie-secret') as RuntimeSecretDefinition),
  services: ['backend', 'jobs'],
};

describe('ensureSecrets', () => {
  it('makes one fresh value for every copy of a secret none of whose copies has one', async () => {
    const { client, writes } = fakeClient({ '/backend/cookie-secret': undefined, '/jobs/cookie-secret': undefined });
    await ensureSecrets({ client, secrets: [cookie], generate: () => 'fresh', log: () => {} });
    expect(writes).toEqual({ '/backend/cookie-secret': 'fresh', '/jobs/cookie-secret': 'fresh' });
  });

  it('must not replace a value that exists: a copy without one gets the existing value', async () => {
    const { client, writes } = fakeClient({ '/backend/cookie-secret': 'kept', '/jobs/cookie-secret': undefined });
    await ensureSecrets({ client, secrets: [cookie], generate: () => 'fresh', log: () => {} });
    expect(writes).toEqual({ '/jobs/cookie-secret': 'kept' });
  });

  it('derives the relay public key from the signing key, so the relay verifies what the backend signs', async () => {
    const yjs = runtimeSecrets.filter((s) => s.secretName.startsWith('yjs-token-'));
    const material = 'known-yjs-token-key-material-of-32-chars';
    const { client, writes } = fakeClient({ '/backend/yjs-token-private-key': material, '/yjs/yjs-token-public-key': undefined });
    await ensureSecrets({ client, secrets: yjs, log: () => {} });
    const token = signYjsToken(
      { userId: 'u', entityType: 'attachment', entityId: 'e', tenantId: 't', organizationId: null },
      yjsTokenSigningKey(material),
      60_000,
    );
    expect(verifyYjsToken(token, yjsTokenVerifyKey(writes['/yjs/yjs-token-public-key'] ?? '')).ok).toBe(true);
  });

  it('leaves a copy whose container does not exist yet for the next run', async () => {
    const { client, writes } = fakeClient({ '/backend/cookie-secret': undefined });
    await ensureSecrets({ client, secrets: [cookie], generate: () => 'fresh', log: () => {} });
    expect(writes).toEqual({ '/backend/cookie-secret': 'fresh' });
  });

  it('generates 32 URL-safe characters', () => {
    expect(generateSecretValue()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('must not rotate a key that protects stored data: the data would become unreadable', async () => {
    const dataKey = runtimeSecrets.find((secret) => secret.secretName === 'data-encryption-key') as RuntimeSecretDefinition;
    const { client, writes } = fakeClient({ '/backend/data-encryption-key': 'kept-data-key-of-32-characters-x' });
    await ensureSecrets({
      client,
      secrets: [{ ...dataKey, services: ['backend'] }],
      generate: () => 'fresh',
      rotate: true,
      log: () => {},
    });
    expect(writes).toEqual({});
  });

  it('rotates every copy of a generated secret to one fresh value, and recomputes what derives from it', async () => {
    const yjs = runtimeSecrets.filter((secret) => secret.secretName.startsWith('yjs-token-'));
    const { client, writes } = fakeClient({
      '/backend/cookie-secret': 'old',
      '/jobs/cookie-secret': 'old',
      '/backend/yjs-token-private-key': 'old-material-of-32-characters-xx',
      '/yjs/yjs-token-public-key': 'old-public',
    });
    let n = 0;
    await ensureSecrets({
      client,
      secrets: [cookie, ...yjs],
      generate: () => `fresh-material-${n++}-of-32-characters`,
      rotate: true,
      log: () => {},
    });
    expect(writes['/backend/cookie-secret']).toBe(writes['/jobs/cookie-secret']);
    expect(writes['/backend/cookie-secret']).not.toBe('old');
    const material = writes['/backend/yjs-token-private-key'] ?? '';
    const token = signYjsToken(
      { userId: 'u', entityType: 'attachment', entityId: 'e', tenantId: 't', organizationId: null },
      yjsTokenSigningKey(material),
      60_000,
    );
    expect(verifyYjsToken(token, yjsTokenVerifyKey(writes['/yjs/yjs-token-public-key'] ?? '')).ok).toBe(true);
  });
});
