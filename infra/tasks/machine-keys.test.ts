import { describe, expect, it } from 'vitest';
import { machineKeyDescription } from '../lib/scaleway/machine-keys';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import type { FetchLike } from '../lib/utils/fetch-like';
import { type MachineKeySecrets, writeMachineKeys } from './machine-keys';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** IAM as a fake for one application holding `live` keys; a mint returns SCWNEW. Deletes are recorded. */
function fakeIam(live: string[]) {
  const deleted: string[] = [];
  let keys = [...live];
  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    if (url.includes('/applications?')) return json({ applications: [{ id: 'app-id', name: new URL(url).searchParams.get('name') }] });
    if (method === 'POST' && url.endsWith('/api-keys')) {
      keys.push('SCWNEW');
      return json({ access_key: 'SCWNEW', secret_key: 'new-secret' });
    }
    if (method === 'GET' && url.includes('/api-keys?')) return json({ api_keys: keys.map((access_key) => ({ access_key })) });
    if (method === 'DELETE') {
      const accessKey = url.split('/api-keys/')[1] ?? '';
      deleted.push(accessKey);
      keys = keys.filter((key) => key !== accessKey);
      return new Response(null, { status: 204 });
    }
    return new Response('no mock', { status: 599 });
  };
  return { fetchImpl, deleted };
}

function fakeSecrets() {
  const written: Array<{ description?: string; value?: string }> = [];
  const secrets: MachineKeySecrets = {
    listSecretsUnder: async () => [],
    getSecretByName: async () => ({ id: 'old-container', name: 'machine-key-cdc', path: '/app-production/deploy/' }) as SecretManagerSecret,
    ensureSecret: async (input) => {
      written.push({ description: input.description });
      return { id: 'new-container', name: input.name, path: input.path };
    },
    putSecretValue: async (input) => {
      written.push({ value: input.value });
      return {};
    },
    deleteSecret: async () => {},
  };
  return { secrets, written };
}

const step = { principal: 'cdc', application: 'app-production-vm-cdc' };
const common = { organizationId: 'org', projectId: 'proj', slug: 'app', mode: 'production', log: () => {} };

describe('writeMachineKeys', () => {
  it('makes a standing key, stores it under a description naming its access key, and deletes every other key', async () => {
    const iam = fakeIam(['SCWOLD1', 'SCWOLD2']);
    const { secrets, written } = fakeSecrets();
    await writeMachineKeys({
      ...common,
      auth: { secretKey: 'owner', fetchImpl: iam.fetchImpl },
      secrets,
      steps: [{ ...step, change: 'make', extra: ['SCWOLD1', 'SCWOLD2'] }],
    });
    expect(written[0]?.description).toBe(machineKeyDescription('app-production-vm-cdc', 'SCWNEW'));
    expect(JSON.parse(written[1]?.value ?? '{}')).toEqual({ accessKey: 'SCWNEW', secretKey: 'new-secret' });
    expect(iam.deleted.sort()).toEqual(['SCWOLD1', 'SCWOLD2']);
  });

  it('must not delete the standing key when it removes the keys beside it', async () => {
    const iam = fakeIam(['SCWSTAND', 'SCWPLANTED']);
    const { secrets } = fakeSecrets();
    await writeMachineKeys({
      ...common,
      auth: { secretKey: 'owner', fetchImpl: iam.fetchImpl },
      secrets,
      steps: [{ ...step, change: 'prune', extra: ['SCWPLANTED'] }],
    });
    expect(iam.deleted).toEqual(['SCWPLANTED']);
  });
});
