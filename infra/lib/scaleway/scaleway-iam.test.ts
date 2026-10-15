import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOrganizationEnv, makeFetch } from '../../tests/helpers/fake-fetch';
import { ensureApplication, provisionScopedKey, type ScopedKeyConfig } from './scaleway-iam';

clearOrganizationEnv();

const baseOpts = {
  callerSecretKey: 'caller-secret',
  organizationId: 'org-1',
  projectId: 'proj-1',
  slug: 'demo',
  log: () => {},
};

const config: ScopedKeyConfig = {
  suffix: 'demo-key',
  appDescription: 'demo application',
  policyDescription: 'demo policy',
  buildRules: ({ projectId }) => [{ permission_set_names: ['ObjectStorageReadOnly'], project_ids: [projectId] }],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-22T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('provisionScopedKey', () => {
  it('derives app/policy names from slug + suffix and applies config rules', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [] } },
      { method: 'POST', match: '/iam/v1alpha1/applications', body: { id: 'app-new', name: 'demo-demo-key' } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [] } },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-new', name: 'demo-demo-key-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-new' } },
    ]);
    vi.stubGlobal('fetch', fn);

    const result = await provisionScopedKey(baseOpts, config);

    expect(result).toMatchObject({ accessKey: 'SCWNEW', secretKey: 'sekret', applicationId: 'app-new', organizationId: 'org-1' });

    const appCreate = calls.find((c) => c.url.endsWith('/applications') && c.init.method === 'POST')!;
    expect(JSON.parse(appCreate.init.body as string)).toMatchObject({ name: 'demo-demo-key', description: 'demo application' });

    const policyCreate = calls.find((c) => c.url.endsWith('/policies') && c.init.method === 'POST')!;
    expect(JSON.parse(policyCreate.init.body as string).name).toBe('demo-demo-key-policy');

    const keyCreate = calls.find((c) => c.url.endsWith('/api-keys') && c.init.method === 'POST')!;
    expect(JSON.parse(keyCreate.init.body as string).description).toContain('demo-key: rotated 2026-05-22');
  });

  it('reuses an existing application, recreates the policy, and purges orphan keys', async () => {
    const { fn, calls } = makeFetch([
      {
        method: 'GET',
        match: '/iam/v1alpha1/applications?',
        body: { applications: [{ id: 'app-1', name: 'demo-demo-key' }] },
      },
      {
        method: 'GET',
        match: '/iam/v1alpha1/policies?',
        body: { policies: [{ id: 'pol-1', name: 'demo-demo-key-policy' }] },
      },
      { method: 'DELETE', match: '/iam/v1alpha1/policies/pol-1', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-demo-key-policy' } },
      {
        method: 'GET',
        match: '/iam/v1alpha1/api-keys?',
        body: { api_keys: [{ access_key: 'OLD1' }, { access_key: 'OLD2' }] },
      },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/OLD1', body: {} },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/OLD2', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 's', application_id: 'app-1' } },
    ]);
    vi.stubGlobal('fetch', fn);

    await provisionScopedKey(baseOpts, config);

    expect(calls.some((c) => c.url.includes('/applications') && c.init.method === 'POST')).toBe(false);
    expect(calls.some((c) => c.url.includes('/policies/pol-1') && c.init.method === 'DELETE')).toBe(true);
    const apiKeyDeletes = calls.filter((c) => c.init.method === 'DELETE' && c.url.includes('/api-keys/'));
    expect(apiKeyDeletes.map((c) => c.url)).toEqual([expect.stringContaining('/api-keys/OLD1'), expect.stringContaining('/api-keys/OLD2')]);
  });

  it('throws with a useful message on Scaleway error responses', async () => {
    const { fn } = makeFetch([{ method: 'GET', match: '/iam/v1alpha1/applications?', body: { message: 'forbidden' }, status: 403 }]);
    vi.stubGlobal('fetch', fn);

    await expect(provisionScopedKey(baseOpts, config)).rejects.toThrow(/403.*forbidden/);
  });

  it('makes an application only when it does not exist, and says so only then', async () => {
    const lines: string[] = [];
    const existing = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [{ id: 'app-1', name: 'demo-demo-key' }] } },
    ]);
    vi.stubGlobal('fetch', existing.fn);
    expect(await ensureApplication({ ...baseOpts, log: (line) => lines.push(line) }, { suffix: 'demo-key', description: 'd' })).toEqual({
      id: 'app-1',
      name: 'demo-demo-key',
    });
    expect(existing.calls.some((c) => c.init.method === 'POST')).toBe(false);
    expect(lines).toEqual([]);
  });
});
