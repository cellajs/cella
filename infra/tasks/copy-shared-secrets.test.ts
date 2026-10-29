import { describe, expect, it } from 'vitest';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { type CopySharedClient, copySharedSecrets, copyStep } from './copy-shared-secrets';

const container = (id: string, versions: number) => ({ id, name: 'brevo-api-key', path: '/', version_count: versions }) as SecretManagerSecret;
const definition = { id: 'brevoApiKey', secretName: 'brevo-api-key', services: ['backend', 'jobs'], valueSource: 'operator' } as never;

/** A Secret Manager keyed by `path + name`, recording every write and delete. */
function fakeClient(secrets: Record<string, { id: string; versions: number; value?: string }>) {
  const writes: Array<{ secretId: string; value: string }> = [];
  const deleted: string[] = [];
  const client: CopySharedClient = {
    getSecretByName: async (name, path) => {
      const found = secrets[`${path}${name}`];
      return found ? ({ id: found.id, name, path, version_count: found.versions } as SecretManagerSecret) : undefined;
    },
    accessLatestValue: async (id) => Object.values(secrets).find((secret) => secret.id === id)?.value ?? '',
    putSecretValue: async (input) => {
      writes.push({ secretId: input.secretId, value: input.value });
      return { revision: 1 };
    },
    deleteSecret: async (id) => {
      deleted.push(id);
    },
  };
  return { client, writes, deleted };
}

describe('copyStep', () => {
  it('fills only the copies without a value, and removes the shared container', () => {
    const step = copyStep(container('shared', 1), [
      { service: 'backend', path: '/b/', container: container('b', 0) },
      { service: 'jobs', path: '/j/', container: container('j', 2) },
    ]);
    expect(step).toEqual({ fill: [container('b', 0)], remove: true });
  });

  it('must not delete the shared container while a copy does not exist: it holds the only value', () => {
    expect(copyStep(container('shared', 1), [{ service: 'backend', path: '/b/' }])).toEqual({ fill: [], remove: false });
  });

  it('has nothing to do without a shared container', () => {
    expect(copyStep(undefined, [])).toBeUndefined();
  });
});

describe('copySharedSecrets', () => {
  it("moves an operator value into every consumer's copy, then deletes the shared container", async () => {
    const { client, writes, deleted } = fakeClient({
      '/shared/backend/jobs/brevo-api-key': { id: 'shared', versions: 1, value: 'brevo-value' },
      '/backend/brevo-api-key': { id: 'b', versions: 0 },
      '/jobs/brevo-api-key': { id: 'j', versions: 0 },
    });
    expect(await copySharedSecrets({ client, secrets: [definition], log: () => {} })).toEqual(['brevo-api-key']);
    expect(writes).toEqual([
      { secretId: 'b', value: 'brevo-value' },
      { secretId: 'j', value: 'brevo-value' },
    ]);
    expect(deleted).toEqual(['shared']);
  });

  it('must not overwrite a copy an operator set after the move started', async () => {
    const { client, writes } = fakeClient({
      '/shared/backend/jobs/brevo-api-key': { id: 'shared', versions: 1, value: 'old' },
      '/backend/brevo-api-key': { id: 'b', versions: 1 },
      '/jobs/brevo-api-key': { id: 'j', versions: 0 },
    });
    await copySharedSecrets({ client, secrets: [definition], log: () => {} });
    expect(writes).toEqual([{ secretId: 'j', value: 'old' }]);
  });
});
