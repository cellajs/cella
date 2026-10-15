import { describe, expect, it } from 'vitest';
import type { MachinePolicy } from '../lib/scaleway/machine-policies';
import type { FetchLike } from '../lib/utils/fetch-like';
import { planMachinePolicies, writeMachinePolicies } from './machine-policies';

const wanted: MachinePolicy[] = [
  {
    name: 'app-vm-backend-policy',
    applicationName: 'app-staging-vm-backend',
    description: 'd',
    rules: [{ permission_set_names: ['SecretManagerSecretAccess'], project_ids: ['p'], condition: 'c' }],
    tags: [],
  },
  {
    name: 'app-vm-boot-policy',
    applicationName: 'app-staging-boot',
    description: 'd',
    rules: [{ permission_set_names: ['ContainerRegistryReadOnly'], project_ids: ['p'] }],
    tags: [],
  },
];

/** A fake IAM: applications by name, policies by name with their rules; records every write. */
function fakeIam(state: { apps: Record<string, string>; policies: Record<string, { id: string; rules: unknown[] }> }) {
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    const json = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (method !== 'GET') {
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return json(200, { id: 'new' });
    }
    const name = new URL(url).searchParams;
    if (url.includes('/applications?')) {
      const wantedName = name.get('name') ?? '';
      const id = state.apps[wantedName];
      return json(200, { applications: id ? [{ id, name: wantedName }] : [] });
    }
    if (url.includes('/policies?')) {
      const policyName = name.get('policy_name') ?? '';
      const policy = state.policies[policyName];
      return json(200, { policies: policy ? [{ id: policy.id, name: policyName }] : [] });
    }
    if (url.includes('/rules?')) {
      const policy = Object.values(state.policies).find((candidate) => url.includes(`policy_id=${candidate.id}`));
      return json(200, { rules: policy?.rules ?? [] });
    }
    return json(404, {});
  };
  return { auth: { secretKey: 's', fetchImpl }, writes };
}

describe('planMachinePolicies', () => {
  it('names a policy to create, one whose rules differ, and one whose application is missing, and writes nothing', async () => {
    const { auth, writes } = fakeIam({
      apps: { 'app-staging-vm-backend': 'a1' },
      policies: { 'app-vm-backend-policy': { id: 'p1', rules: [{ permission_set_names: ['SecretManagerSecretAccess'], project_ids: ['p'] }] } },
    });
    expect(await planMachinePolicies(auth, 'org', wanted)).toEqual([
      { policy: 'app-vm-backend-policy', change: 'update' },
      { policy: 'app-vm-boot-policy', change: 'missing-application' },
    ]);
    expect(writes).toEqual([]);
  });
});

describe('writeMachinePolicies', () => {
  it('creates a missing policy, replaces differing rules in place, and leaves a matching one alone', async () => {
    const { auth, writes } = fakeIam({
      apps: { 'app-staging-vm-backend': 'a1', 'app-staging-boot': 'a2' },
      policies: { 'app-vm-boot-policy': { id: 'p2', rules: [{ permission_set_names: ['ContainerRegistryReadOnly'], project_ids: ['p'] }] } },
    });
    const steps = await writeMachinePolicies(auth, 'org', wanted, () => {});
    expect(steps).toEqual([
      { policy: 'app-vm-backend-policy', change: 'create' },
      { policy: 'app-vm-boot-policy', change: 'none' },
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: 'POST', body: { name: 'app-vm-backend-policy', application_id: 'a1', rules: wanted[0]?.rules } });
  });

  it('replaces the rules of a policy in place, so its machines keep their rights in between', async () => {
    const { auth, writes } = fakeIam({
      apps: { 'app-staging-vm-backend': 'a1', 'app-staging-boot': 'a2' },
      policies: {
        'app-vm-backend-policy': { id: 'p1', rules: [] },
        'app-vm-boot-policy': { id: 'p2', rules: [{ permission_set_names: ['ContainerRegistryReadOnly'], project_ids: ['p'] }] },
      },
    });
    await writeMachinePolicies(auth, 'org', wanted, () => {});
    expect(writes).toEqual([{ method: 'PUT', url: expect.stringContaining('/rules'), body: { policy_id: 'p1', rules: wanted[0]?.rules } }]);
  });

  it('must not write a policy for an application that does not exist', async () => {
    const { auth, writes } = fakeIam({ apps: {}, policies: {} });
    await expect(writeMachinePolicies(auth, 'org', wanted, () => {})).rejects.toThrow("'app-staging-vm-backend' does not exist");
    expect(writes).toEqual([]);
  });
});
