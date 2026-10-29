import { describe, expect, it } from 'vitest';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../runtime-secrets';
import type { SecretManagerSecret, SecretManagerSecretVersion } from '../scaleway/scaleway-secret-manager';
import { lookupSinkIngestKey, type SinkKeySyncClient, syncDeployTelemetryKey } from './sink-key';

/** A Secret Manager holding `secrets` (path → name → latest value) that records the paths asked about and the values written. */
function fakeClient(secrets: Record<string, Record<string, string>>): SinkKeySyncClient & { paths: string[]; writes: string[] } {
  const paths: string[] = [];
  const writes: string[] = [];
  const containers = new Map<string, { path: string; name: string }>();
  const find = (name: string, path: string): SecretManagerSecret | undefined => {
    if (!(path in secrets) || !(name in (secrets[path] ?? {}))) return undefined;
    const id = `${path}${name}`;
    containers.set(id, { path, name });
    return { id, name, path, version_count: secrets[path]?.[name] === undefined ? 0 : 1 } as SecretManagerSecret;
  };
  return {
    paths,
    writes,
    getSecretByName: async (name, path) => {
      paths.push(path);
      return find(name, path);
    },
    accessLatestValue: async (id) => {
      const at = containers.get(id);
      const value = at ? secrets[at.path]?.[at.name] : undefined;
      if (value === undefined) throw new Error(`no version for ${id}`);
      return value;
    },
    ensureSecret: async ({ name, path }) => {
      secrets[path] ??= {};
      return { id: `${path}${name}`, name, path, version_count: 0 } as SecretManagerSecret;
    },
    putSecretValue: async ({ secretId, value }) => {
      writes.push(secretId);
      const path = secretId.slice(0, secretId.lastIndexOf('/') + 1);
      const name = secretId.slice(secretId.lastIndexOf('/') + 1);
      secrets[path] = { ...secrets[path], [name]: value };
      containers.set(secretId, { path, name });
      return { revision: 1, secret_id: secretId } as SecretManagerSecretVersion;
    },
  };
}

const deployPath = '/deploy/';
const backendPath = '/backend/';
const KEY_NAME = 'maple-secret-ingest-key';

describe('lookupSinkIngestKey', () => {
  it('reads the copy in the deploy folder, the one folder whose values the deploy key reads', async () => {
    const client = fakeClient({ [deployPath]: { [KEY_NAME]: ' ik-123 \n' }, [backendPath]: { [KEY_NAME]: 'ik-other' } });
    expect(await lookupSinkIngestKey({ client })).toEqual({ key: 'ik-123' });
    expect(client.paths).toEqual([deployPath]);
  });

  it('says why when there is no key', async () => {
    const missing = await lookupSinkIngestKey({ client: fakeClient({ [backendPath]: { [KEY_NAME]: 'ik' } }) });
    expect(missing).toEqual({ missing: expect.stringContaining(`no copy of '${KEY_NAME}' in ${deployPath}`) });

    const empty = await lookupSinkIngestKey({ client: fakeClient({ [deployPath]: { [KEY_NAME]: '  ' } }) });
    expect(empty).toEqual({ missing: expect.stringContaining('empty value') });
  });
});

describe('syncDeployTelemetryKey', () => {
  it('copies the runtime value into the deploy folder, then leaves an equal copy alone', async () => {
    const client = fakeClient({ [backendPath]: { [KEY_NAME]: 'ik-1' } });
    expect(await syncDeployTelemetryKey({ client })).toBe('written');
    expect(await lookupSinkIngestKey({ client })).toEqual({ key: 'ik-1' });

    client.writes.length = 0;
    expect(await syncDeployTelemetryKey({ client })).toBe('unchanged');
    expect(client.writes).toEqual([]);
  });

  it('follows a value the operator set anew', async () => {
    const client = fakeClient({ [backendPath]: { [KEY_NAME]: 'ik-new' }, [deployPath]: { [KEY_NAME]: 'ik-old' } });
    expect(await syncDeployTelemetryKey({ client })).toBe('written');
    expect(await lookupSinkIngestKey({ client })).toEqual({ key: 'ik-new' });
  });

  it('writes nothing when no runtime copy holds a value, or the app declares no such secret', async () => {
    const client = fakeClient({});
    expect(await syncDeployTelemetryKey({ client })).toBe('absent');
    expect(await syncDeployTelemetryKey({ client, secrets: [] })).toBe('absent');
    expect(client.writes).toEqual([]);
  });

  it('reads the runtime copies its registry entry names', async () => {
    const maple = runtimeSecrets.find((secret) => secret.secretName === KEY_NAME);
    if (!maple) throw new Error(`the registry declares no ${KEY_NAME}`);
    const secrets: RuntimeSecretDefinition[] = [{ ...maple, services: ['jobs'] }];
    const client = fakeClient({ '/jobs/': { [KEY_NAME]: 'ik-9' } });
    expect(await syncDeployTelemetryKey({ client, secrets })).toBe('written');
    expect(await lookupSinkIngestKey({ client })).toEqual({ key: 'ik-9' });
  });
});
