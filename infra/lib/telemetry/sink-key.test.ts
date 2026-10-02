import { describe, expect, it } from 'vitest';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../runtime-secrets';
import type { SecretManagerSecret } from '../scaleway/scaleway-secret-manager';
import { lookupSinkIngestKey, type SinkKeyClient } from './sink-key';

/** A Secret Manager holding `secrets` (path → name → value) that records every path it is asked about. */
function fakeClient(secrets: Record<string, Record<string, string>>): SinkKeyClient & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    getSecretByName: async (name, path) => {
      paths.push(path);
      return secrets[path]?.[name] === undefined ? undefined : ({ id: `${path}${name}`, name, path } as SecretManagerSecret);
    },
    accessLatestValue: async (id) => {
      for (const [path, byName] of Object.entries(secrets)) {
        for (const [name, value] of Object.entries(byName)) if (`${path}${name}` === id) return value;
      }
      throw new Error(`no version for ${id}`);
    },
  };
}

const sharedPath = '/cella-production/shared/backend/cdc/jobs/yjs/';

describe('lookupSinkIngestKey', () => {
  it('reads the key from the folder its registry entry derives, never the stack root', async () => {
    // The stack root /cella-production/ holds no secret: a lookup there leaves every deploy without telemetry.
    const client = fakeClient({ [sharedPath]: { 'maple-secret-ingest-key': ' ik-123 \n' }, '/cella-production/': {} });
    expect(await lookupSinkIngestKey({ slug: 'cella', mode: 'production', client })).toEqual({ key: 'ik-123' });
    expect(client.paths).toEqual([sharedPath]);
  });

  it('follows the entry when its consumer list changes', async () => {
    const maple = runtimeSecrets.find((secret) => secret.secretName === 'maple-secret-ingest-key');
    if (!maple) throw new Error('the registry declares no maple-secret-ingest-key');
    const secrets: RuntimeSecretDefinition[] = [{ ...maple, services: ['backend'] }];
    const client = fakeClient({ '/cella-staging/backend/': { 'maple-secret-ingest-key': 'ik-9' } });
    expect(await lookupSinkIngestKey({ slug: 'cella', mode: 'staging', client, secrets })).toEqual({ key: 'ik-9' });
  });

  it('says why when there is no key', async () => {
    const missing = await lookupSinkIngestKey({ slug: 'cella', mode: 'production', client: fakeClient({}) });
    expect(missing).toEqual({ missing: expect.stringContaining(`not found in ${sharedPath}`) });

    const empty = await lookupSinkIngestKey({
      slug: 'cella',
      mode: 'production',
      client: fakeClient({ [sharedPath]: { 'maple-secret-ingest-key': '  ' } }),
    });
    expect(empty).toEqual({ missing: expect.stringContaining('empty value') });

    const undeclared = await lookupSinkIngestKey({ slug: 'cella', mode: 'production', client: fakeClient({}), secrets: [] });
    expect(undeclared).toEqual({ missing: expect.stringContaining('no runtime secret named') });
  });
});
