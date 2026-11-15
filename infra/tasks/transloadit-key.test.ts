import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiKey, listApiKeys, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import { readPolicy } from '../lib/scaleway/policy-reach';
import { ensureApplication } from '../lib/scaleway/scaleway-iam';
import { writeDeclaredPolicies } from './declared-policies';
import { planTransloadit, writeTransloadit } from './transloadit-key';

vi.mock('../lib/scaleway/iam-client', () => ({ createApiKey: vi.fn(), listApiKeys: vi.fn(), resolveApplicationIdByName: vi.fn() }));
vi.mock('../lib/scaleway/scaleway-iam', () => ({ ensureApplication: vi.fn() }));
vi.mock('./declared-policies', () => ({ writeDeclaredPolicies: vi.fn() }));
vi.mock('../lib/scaleway/policy-reach', async (original) => ({
  ...(await original<typeof import('../lib/scaleway/policy-reach')>()),
  readPolicy: vi.fn(),
}));

const auth = { secretKey: 'owner-secret' };
const base = { auth, organizationId: 'org-1', projectId: 'proj-staging', slug: 'app' };
/** A runtime folder that holds a Transloadit auth key, or none. */
const secrets = (versions: number) => ({
  getSecretByName: vi.fn(async (name: string) => (name === 'transloadit-key' ? { version_count: versions } : undefined)),
});
const productionRule = { permission_set_names: ['ObjectStorageObjectsWrite'], project_ids: ['proj-production'] };

beforeEach(() => {
  vi.mocked(resolveApplicationIdByName).mockReset().mockResolvedValue('app-1');
  vi.mocked(listApiKeys).mockReset().mockResolvedValue([]);
  vi.mocked(createApiKey).mockReset().mockResolvedValue({ access_key: 'SCWNEW', secret_key: 'secret' });
  vi.mocked(ensureApplication).mockReset().mockResolvedValue({ id: 'app-1', name: 'app-transloadit' });
  vi.mocked(writeDeclaredPolicies).mockReset().mockResolvedValue([]);
  vi.mocked(readPolicy)
    .mockReset()
    .mockResolvedValue({ id: 'pol-1', application_id: 'app-1', rules: [productionRule] });
});

describe('the Transloadit application', () => {
  it('must not be planned for an environment that stores no Transloadit auth key', async () => {
    expect(await planTransloadit({ ...base, secrets: secrets(0) })).toBeUndefined();
    expect(resolveApplicationIdByName).not.toHaveBeenCalled();
  });

  it('is to create when the app has none, and needs a key when it holds none', async () => {
    vi.mocked(resolveApplicationIdByName).mockResolvedValueOnce(null);
    expect(await planTransloadit({ ...base, secrets: secrets(1) })).toEqual({ step: 'create' });
    expect((await planTransloadit({ ...base, secrets: secrets(1) }))?.step).toBe('key');
    vi.mocked(listApiKeys).mockResolvedValue([{ access_key: 'SCWLIVE', secret_key: '' }]);
    expect((await planTransloadit({ ...base, secrets: secrets(1) }))?.step).toBe('none');
  });

  it("must not cut another environment off: the policy keeps the projects it reaches today beside this environment's", async () => {
    await writeTransloadit(base);
    const written = vi.mocked(writeDeclaredPolicies).mock.calls[0]?.[2];
    expect(written?.map((policy) => policy.rules)).toEqual([
      [{ permission_set_names: ['ObjectStorageObjectsWrite'], project_ids: ['proj-production', 'proj-staging'] }],
    ]);
  });

  it('must not replace or add to a key that exists: only an application without one gets a key', async () => {
    vi.mocked(listApiKeys).mockResolvedValue([{ access_key: 'SCWLIVE', secret_key: '' }]);
    expect(await writeTransloadit(base)).toBeUndefined();
    expect(createApiKey).not.toHaveBeenCalled();

    vi.mocked(listApiKeys).mockResolvedValue([]);
    expect(await writeTransloadit(base)).toEqual({ access_key: 'SCWNEW', secret_key: 'secret' });
  });
});
