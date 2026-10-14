import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../utils/fetch-like';
import {
  assertIamManager,
  classifyPrincipal,
  describeKey,
  envKeyPair,
  formatKeyLine,
  hoursUntilExpiry,
  organizationIdOfKey,
  resolveOperatorIdentity,
} from './operator-identity';
import { allPrincipalNames } from './principals';

const names = allPrincipalNames({ slug: 'cella', appSlug: 'cella' }, 'production');

/** Route-matched fake fetch: the first entry whose `match` is a substring of the url answers; anything else is a 404. */
function makeFetch(routes: Array<{ match: string; body: unknown; status?: number }>): FetchLike {
  return async (url) => {
    const route = routes.find((r) => url.includes(r.match));
    const status = route?.status ?? (route ? 200 : 404);
    return { ok: status < 400, status, text: async () => JSON.stringify(route?.body ?? { message: 'not found' }) };
  };
}

describe('envKeyPair', () => {
  it('returns the pair when both are set', () => {
    expect(envKeyPair({ A: 'x', B: 'y' }, 'A', 'B')).toEqual({ accessKey: 'x', secretKey: 'y' });
  });
  it('is undefined when both are absent or blank', () => {
    expect(envKeyPair({}, 'A', 'B')).toBeUndefined();
    expect(envKeyPair({ A: ' ', B: '' }, 'A', 'B')).toBeUndefined();
  });
  it('refuses a half-set pair', () => {
    expect(() => envKeyPair({ A: 'x' }, 'A', 'B')).toThrow(/must be set together/);
  });
});

describe('resolveOperatorIdentity', () => {
  it('reads the observer key from SCW_OBSERVER_*', () => {
    const id = resolveOperatorIdentity({ SCW_OBSERVER_ACCESS_KEY: 'SCWOBS', SCW_OBSERVER_SECRET_KEY: 's' });
    expect(id.observer).toEqual({ accessKey: 'SCWOBS', secretKey: 's' });
    expect(id.ambient).toBeUndefined();
    expect(id.warnings).toEqual([]);
  });
  it('must not read a privileged key from the environment: an Owner API key there is no part of the identity', () => {
    const id = resolveOperatorIdentity({
      SCW_OWNER_ACCESS_KEY: 'SCWOWNER',
      SCW_OWNER_SECRET_KEY: 'o',
      SCW_BOOTSTRAP_ACCESS_KEY: 'SCWB',
      SCW_BOOTSTRAP_SECRET_KEY: 'b',
    });
    expect(id).toEqual({ observer: undefined, ambient: undefined, warnings: [] });
  });
  it('must not read the retired admin application key', () => {
    const id = resolveOperatorIdentity({
      SCW_ADMIN_ACCESS_KEY: 'SCWADMIN',
      SCW_ADMIN_SECRET_KEY: 's',
      SCW_STATE_ACCESS_KEY: 'X',
      SCW_STATE_SECRET_KEY: 'y',
    });
    expect(id).toEqual({ observer: undefined, ambient: undefined, warnings: [] });
  });
  it("keeps the process's SCW_* pair apart as ambient, never as the observer key", () => {
    const id = resolveOperatorIdentity({ SCW_ACCESS_KEY: 'SCWCI', SCW_SECRET_KEY: 'c' });
    expect(id.observer).toBeUndefined();
    expect(id.ambient).toEqual({ accessKey: 'SCWCI', secretKey: 'c' });
  });
  it('treats a half-set pair as absent, with a warning, instead of aborting', () => {
    const id = resolveOperatorIdentity({ SCW_OBSERVER_ACCESS_KEY: 'SCWX' });
    expect(id.observer).toBeUndefined();
    expect(id.warnings[0]).toMatch(/must be set together.*ignoring/);
  });
});

describe('describeKey / classifyPrincipal', () => {
  it('describes an application key and classifies engine applications by name', async () => {
    const fetchImpl = makeFetch([
      { match: '/api-keys/SCWCI', body: { access_key: 'SCWCI', application_id: 'app-ci', expires_at: '2026-09-24T12:54:29Z' } },
      { match: '/applications/app-ci', body: { name: 'cella-production-ci-deploy' } },
    ]);
    const desc = await describeKey({ accessKey: 'SCWCI', secretKey: 's' }, { fetchImpl });
    expect(desc).toMatchObject({ bearer: 'application', name: 'cella-production-ci-deploy', bearerId: 'app-ci' });
    expect(classifyPrincipal(desc, names)).toBe('ci-deploy');
    expect(formatKeyLine(desc, 'ci-deploy')).toBe('SCWCI → cella-production-ci-deploy (CI deploy application, expires 2026-09-24 12:54 UTC)');
    expect(hoursUntilExpiry(desc, Date.parse('2026-09-24T10:54:29Z'))).toBeCloseTo(2, 5);
  });
  it('classifies the admin, boot and VM applications and outside applications', () => {
    const app = (name: string) => ({ accessKey: 'k', bearer: 'application' as const, name, bearerId: 'id' });
    expect(classifyPrincipal(app('cella-production-admin'), names)).toBe('admin');
    expect(classifyPrincipal(app('cella-production-boot'), names)).toBe('boot');
    expect(classifyPrincipal(app('cella-production-vm-backend'), names)).toBe('vm-service');
    expect(classifyPrincipal(app('something-else'), names)).toBe('application');
  });
  it('describes a user key as owner or member', async () => {
    const fetchImpl = makeFetch([
      { match: '/api-keys/SCWU', body: { access_key: 'SCWU', user_id: 'u-1' } },
      { match: '/users/u-1', body: { email: 'flip@example.com', type: 'owner' } },
    ]);
    const desc = await describeKey({ accessKey: 'SCWU', secretKey: 's' }, { fetchImpl });
    expect(desc).toMatchObject({ bearer: 'owner', name: 'flip@example.com' });
    expect(classifyPrincipal(desc, names)).toBe('owner');
    expect(hoursUntilExpiry(desc)).toBeUndefined();
  });
});

describe('organizationIdOfKey', () => {
  const pair = { accessKey: 'SCWK', secretKey: 's' };

  it('must not need the Account API for an application key: IAM names the organization of the key`s own bearer', async () => {
    const saved = { a: process.env.SCW_ORGANIZATION_ID, b: process.env.SCW_DEFAULT_ORGANIZATION_ID };
    delete process.env.SCW_ORGANIZATION_ID;
    delete process.env.SCW_DEFAULT_ORGANIZATION_ID;
    try {
      const fetchImpl = makeFetch([
        { match: '/api-keys/SCWK', body: { access_key: 'SCWK', application_id: 'app-1' } },
        { match: '/applications/app-1', body: { name: 'cella-operator', organization_id: 'org-9' } },
        { match: '/account/', body: { message: 'insufficient permissions' }, status: 403 },
      ]);
      expect(await organizationIdOfKey(pair, 'proj-1', { fetchImpl })).toBe('org-9');
    } finally {
      if (saved.a !== undefined) process.env.SCW_ORGANIZATION_ID = saved.a;
      if (saved.b !== undefined) process.env.SCW_DEFAULT_ORGANIZATION_ID = saved.b;
    }
  });

  it("finds the organization through the key's default project before a project is known, and says what to set when it cannot", async () => {
    const saved = { a: process.env.SCW_ORGANIZATION_ID, b: process.env.SCW_DEFAULT_ORGANIZATION_ID };
    delete process.env.SCW_ORGANIZATION_ID;
    delete process.env.SCW_DEFAULT_ORGANIZATION_ID;
    try {
      const withDefault = makeFetch([
        { match: '/api-keys/SCWK', body: { access_key: 'SCWK', default_project_id: 'proj-default' } },
        { match: '/account/v3/projects/proj-default', body: { id: 'proj-default', organization_id: 'org-1' } },
      ]);
      expect(await organizationIdOfKey(pair, undefined, { fetchImpl: withDefault })).toBe('org-1');
      const without = makeFetch([{ match: '/api-keys/SCWK', body: { access_key: 'SCWK' } }]);
      await expect(organizationIdOfKey(pair, undefined, { fetchImpl: without })).rejects.toThrow(/SCW_DEFAULT_ORGANIZATION_ID/);
    } finally {
      if (saved.a !== undefined) process.env.SCW_ORGANIZATION_ID = saved.a;
      if (saved.b !== undefined) process.env.SCW_DEFAULT_ORGANIZATION_ID = saved.b;
    }
  });

  it('takes the organization from the environment first', async () => {
    const saved = process.env.SCW_DEFAULT_ORGANIZATION_ID;
    process.env.SCW_DEFAULT_ORGANIZATION_ID = 'org-env';
    try {
      expect(await organizationIdOfKey(pair, undefined, { fetchImpl: makeFetch([]) })).toBe('org-env');
    } finally {
      if (saved === undefined) delete process.env.SCW_DEFAULT_ORGANIZATION_ID;
      else process.env.SCW_DEFAULT_ORGANIZATION_ID = saved;
    }
  });
});

describe('assertIamManager', () => {
  const org = 'org-1';
  it('accepts an Owner key without consulting policies', async () => {
    const fetchImpl = makeFetch([
      { match: '/api-keys/SCWU', body: { access_key: 'SCWU', user_id: 'u-1' } },
      { match: '/users/u-1', body: { email: 'flip@example.com', type: 'owner' } },
    ]);
    const { role } = await assertIamManager({ pair: { accessKey: 'SCWU', secretKey: 's' }, names, organizationId: org, fetchImpl });
    expect(role).toBe('owner');
  });
  it('rejects an application the engine created by name with the reason', async () => {
    const fetchImpl = makeFetch([
      { match: '/api-keys/SCWCI', body: { access_key: 'SCWCI', application_id: 'app-ci' } },
      { match: '/applications/app-ci', body: { name: 'cella-production-ci-deploy' } },
    ]);
    await expect(assertIamManager({ pair: { accessKey: 'SCWCI', secretKey: 's' }, names, organizationId: org, fetchImpl })).rejects.toThrow(
      /CI deploy application.*not an Owner API key/,
    );
  });
  it('accepts an application holding IAMManager and rejects one without', async () => {
    const base = [
      { match: '/api-keys/SCWA', body: { access_key: 'SCWA', application_id: 'app-x' } },
      { match: '/applications/app-x', body: { name: 'ops-privileged' } },
    ];
    const withGrant = makeFetch([
      ...base,
      {
        match: '/policies?organization_id=org-1',
        body: { policies: [{ id: 'p-1', name: 'x', application_id: 'app-x' }], total_count: 1 },
      },
      { match: '/rules?policy_id=p-1', body: { rules: [{ permission_set_names: ['ProjectManager', 'IAMManager'] }] } },
    ]);
    await expect(
      assertIamManager({ pair: { accessKey: 'SCWA', secretKey: 's' }, names, organizationId: org, fetchImpl: withGrant }),
    ).resolves.toMatchObject({ role: 'application' });
    const withoutGrant = makeFetch([
      ...base,
      {
        match: '/policies?organization_id=org-1',
        body: { policies: [{ id: 'p-1', name: 'x', application_id: 'app-x' }], total_count: 1 },
      },
      { match: '/rules?policy_id=p-1', body: { rules: [{ permission_set_names: ['IAMReadOnly'] }] } },
    ]);
    await expect(
      assertIamManager({ pair: { accessKey: 'SCWA', secretKey: 's' }, names, organizationId: org, fetchImpl: withoutGrant }),
    ).rejects.toThrow(/no IAMManager grant/);
  });
  it('explains a key that cannot read IAM at all', async () => {
    const fetchImpl = makeFetch([{ match: '/api-keys/SCWV', body: { message: 'permissions_denied' }, status: 403 }]);
    await expect(assertIamManager({ pair: { accessKey: 'SCWV', secretKey: 's' }, names, organizationId: org, fetchImpl })).rejects.toThrow(
      /cannot describe itself in IAM/,
    );
  });
});
