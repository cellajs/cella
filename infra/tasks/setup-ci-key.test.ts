import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deployRules } from '../lib/scaleway/deploy-policy';
import { clearOrganizationEnv, makeFetch } from '../tests/helpers/fake-fetch';
import { setupCiKey } from './setup-ci-key';

clearOrganizationEnv();

const baseOpts = {
  callerSecretKey: 'caller-secret',
  organizationId: 'org-1',
  projectId: 'proj-1',
  slug: 'demo',
  mode: 'production',
  log: () => {},
};

/** Group enrollment routes: find-or-create `demo-production` + add-member. */
const groupRoutes = [
  {
    method: 'GET',
    match: '/iam/v1alpha1/groups?',
    body: { groups: [{ id: 'grp-1', name: 'demo-production', application_ids: [] }] },
  },
  { method: 'POST', match: '/iam/v1alpha1/groups/grp-1/add-member', body: { id: 'grp-1' } },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-22T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('setupCiKey', () => {
  it('reuses existing application, recreates policy, mints a new API key', async () => {
    const { fn, calls } = makeFetch([
      {
        method: 'GET',
        match: '/iam/v1alpha1/applications?',
        body: { applications: [{ id: 'app-1', name: 'demo-production-ci-deploy' }] },
      },
      ...groupRoutes,
      {
        method: 'GET',
        match: '/iam/v1alpha1/policies?',
        body: { policies: [{ id: 'pol-1', name: 'demo-production-ci-deploy-policy' }] },
      },
      { method: 'DELETE', match: '/iam/v1alpha1/policies/pol-1', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-production-ci-deploy-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-1' } },
    ]);
    vi.stubGlobal('fetch', fn);

    const result = await setupCiKey(baseOpts);

    expect(result).toMatchObject({ accessKey: 'SCWNEW', secretKey: 'sekret', applicationId: 'app-1' });
    expect(fn).toHaveBeenCalledTimes(8);

    // Application reused (no POST), policy always recreated (DELETE + POST).
    expect(calls.some((c) => c.url.includes('/applications') && c.init.method === 'POST')).toBe(false);
    expect(calls.some((c) => c.url.includes('/policies/pol-1') && c.init.method === 'DELETE')).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/policies') && c.init.method === 'POST')).toBe(true);

    // API key request includes today's date in description.
    const apiKeyCall = calls.find((c) => c.url.endsWith('/api-keys') && c.init.method === 'POST')!;
    const body = JSON.parse(apiKeyCall.init.body as string);
    expect(body).toMatchObject({ application_id: 'app-1', default_project_id: 'proj-1', description: expect.stringContaining('2026-05-22') });

    // Auth header propagated.
    expect((apiKeyCall.init.headers as Record<string, string>)['X-Auth-Token']).toBe('caller-secret');
  });

  it('creates application + policy when neither exists', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { applications: [] } },
      { method: 'POST', match: '/iam/v1alpha1/applications', body: { id: 'app-new', name: 'demo-production-ci-deploy' } },
      {
        method: 'GET',
        match: '/iam/v1alpha1/groups?',
        body: { groups: [{ id: 'grp-1', name: 'demo-production', application_ids: [] }] },
      },
      { method: 'POST', match: '/iam/v1alpha1/groups/grp-1/add-member', body: { id: 'grp-1' } },
      { method: 'GET', match: '/iam/v1alpha1/policies?', body: { policies: [] } },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-new', name: 'demo-production-ci-deploy-policy' } },
      { method: 'GET', match: '/iam/v1alpha1/api-keys?', body: { api_keys: [] } },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-new' } },
    ]);
    vi.stubGlobal('fetch', fn);

    const result = await setupCiKey(baseOpts);

    expect(result.applicationId).toBe('app-new');
    expect(fn).toHaveBeenCalledTimes(8);

    const appCreate = calls.find((c) => c.url.endsWith('/applications') && c.init.method === 'POST')!;
    expect(JSON.parse(appCreate.init.body as string)).toMatchObject({ name: 'demo-production-ci-deploy', organization_id: 'org-1' });

    const policyCreate = calls.find((c) => c.url.endsWith('/policies') && c.init.method === 'POST')!;
    const policyBody = JSON.parse(policyCreate.init.body as string);
    expect(policyBody.application_id).toBe('app-new');
    // The deploy rules of plan §3.1, the same ones Update identities writes in place (lib/scaleway/deploy-policy.ts).
    expect(policyBody.rules).toEqual(deployRules({ slug: 'demo', mode: 'production', projectId: 'proj-1', organizationId: 'org-1' }));
  });

  it('mints the fresh key BEFORE deleting the replaced ones (no keyless window on mint failure)', async () => {
    const { fn, calls } = makeFetch([
      {
        method: 'GET',
        match: '/iam/v1alpha1/applications?',
        body: { applications: [{ id: 'app-1', name: 'demo-production-ci-deploy' }] },
      },
      ...groupRoutes,
      {
        method: 'GET',
        match: '/iam/v1alpha1/policies?',
        body: { policies: [{ id: 'pol-1', name: 'demo-production-ci-deploy-policy' }] },
      },
      { method: 'DELETE', match: '/iam/v1alpha1/policies/pol-1', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/policies', body: { id: 'pol-1', name: 'demo-production-ci-deploy-policy' } },
      {
        method: 'GET',
        match: '/iam/v1alpha1/api-keys?',
        body: { api_keys: [{ access_key: 'SCWOLD1' }, { access_key: 'SCWOLD2' }] },
      },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/SCWOLD1', body: {} },
      { method: 'DELETE', match: '/iam/v1alpha1/api-keys/SCWOLD2', body: {} },
      { method: 'POST', match: '/iam/v1alpha1/api-keys', body: { access_key: 'SCWNEW', secret_key: 'sekret', application_id: 'app-1' } },
    ]);
    vi.stubGlobal('fetch', fn);

    await setupCiKey(baseOpts);

    const apiKeyDeletes = calls.filter((c) => c.init.method === 'DELETE' && c.url.includes('/api-keys/'));
    expect(apiKeyDeletes.map((c) => c.url)).toEqual([expect.stringContaining('/api-keys/SCWOLD1'), expect.stringContaining('/api-keys/SCWOLD2')]);
    const mintIndex = calls.findIndex((c) => c.init.method === 'POST' && c.url.endsWith('/api-keys'));
    const firstDeleteIndex = calls.findIndex((c) => c.init.method === 'DELETE' && c.url.includes('/api-keys/'));
    expect(mintIndex).toBeGreaterThanOrEqual(0);
    expect(firstDeleteIndex).toBeGreaterThan(mintIndex);
  });

  it('throws with a useful message on Scaleway error responses', async () => {
    const { fn } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/applications?', body: { message: 'forbidden', type: 'permissions_denied' }, status: 403 },
    ]);
    vi.stubGlobal('fetch', fn);

    await expect(setupCiKey(baseOpts)).rejects.toThrow(/403.*forbidden/);
  });
});
