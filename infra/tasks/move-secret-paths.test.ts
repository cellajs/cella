import { describe, expect, it } from 'vitest';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { moveSecretPaths } from './move-secret-paths';

/** Secret Manager as a fake: every container with its path and latest value; every call recorded. */
function fakeClient(containers: Array<{ id: string; name: string; path: string; value?: string }>) {
  const calls: string[] = [];
  const live = new Map(containers.map((container) => [container.id, { ...container }]));
  const client = {
    listSecrets: async () =>
      [...live.values()].map(({ id, name, path, value }) => ({ id, name, path, version_count: value === undefined ? 0 : 1 }) as SecretManagerSecret),
    accessLatestValue: async (id: string) => live.get(id)?.value ?? '',
    putSecretValue: async ({ secretId, value }: { secretId: string; value: string }) => {
      calls.push(`put ${secretId}`);
      const container = live.get(secretId);
      if (container) container.value = value;
    },
    moveSecret: async (id: string, path: string) => {
      calls.push(`move ${id} ${path}`);
      const container = live.get(id);
      if (container) container.path = path;
    },
    deleteSecret: async (id: string) => {
      calls.push(`delete ${id}`);
      live.delete(id);
    },
  };
  return { client, calls, live };
}

const secrets = [{ secretName: 'brevo-api-key', services: ['backend', 'mcp', 'jobs'] }];

describe('moveSecretPaths', () => {
  it("keeps the first consumer's copy with its value, the one the program adopts, and deletes the other copies", async () => {
    const { client, live } = fakeClient([
      { id: 'mcp', name: 'brevo-api-key', path: '/mcp', value: 'k' },
      { id: 'backend', name: 'brevo-api-key', path: '/backend', value: 'k' },
      { id: 'jobs', name: 'brevo-api-key', path: '/jobs/', value: 'k' },
      { id: 'pass', name: 'pulumi-passphrase', path: '/engine' },
    ]);
    expect(await moveSecretPaths({ client, secrets, log: () => {} })).toEqual(['brevo-api-key']);
    expect([...live.values()].map(({ id, path }) => `${id} ${path}`)).toEqual(['backend /runtime/', 'pass /engine']);
  });

  it('must not lose a value only a copy beside the kept one holds, a shared folder included', async () => {
    const { client, live } = fakeClient([
      { id: 'backend', name: 'brevo-api-key', path: '/backend' },
      { id: 'shared', name: 'brevo-api-key', path: '/shared/backend/jobs/mcp', value: 'only-here' },
    ]);
    await moveSecretPaths({ client, secrets, log: () => {} });
    expect([...live.values()]).toEqual([{ id: 'backend', name: 'brevo-api-key', path: '/runtime/', value: 'only-here' }]);
  });

  it('moves the repository read key out of the deploy folder and deletes the machine keys there, then has nothing left to do', async () => {
    const { client, calls, live } = fakeClient([
      { id: 'repo', name: 'repository-read-key', path: '/deploy', value: 'pat' },
      { id: 'mk', name: 'machine-key-backend', path: '/deploy' },
      { id: 'runtime', name: 'brevo-api-key', path: '/runtime', value: 'k' },
    ]);
    await moveSecretPaths({ client, secrets, log: () => {} });
    expect([...live.keys()].sort()).toEqual(['repo', 'runtime']);
    expect(live.get('repo')?.path).toBe('/runtime/');
    calls.length = 0;
    expect(await moveSecretPaths({ client, secrets, log: () => {} })).toEqual([]);
    expect(calls).toEqual([]);
  });
});
