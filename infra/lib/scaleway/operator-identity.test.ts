import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../utils/fetch-like';
import {
  assertIamManager,
  classifyPrincipal,
  describeKey,
  envKeyPair,
  formatKeyLine,
  hoursUntilExpiry,
  resolveOperatorIdentity,
} from './operator-identity';
import { principalNames } from './principals';

const names = principalNames('cella', 'production');

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
  it('reads the admin application key from SCW_ADMIN_* and the Owner API key from SCW_OWNER_*', () => {
    const id = resolveOperatorIdentity({
      SCW_ADMIN_ACCESS_KEY: 'SCWADMIN',
      SCW_ADMIN_SECRET_KEY: 's',
      SCW_OWNER_ACCESS_KEY: 'SCWOWNER',
      SCW_OWNER_SECRET_KEY: 'o',
    });
    expect(id.admin).toEqual({ accessKey: 'SCWADMIN', secretKey: 's', source: 'SCW_ADMIN_*' });
    expect(id.owner).toEqual({ accessKey: 'SCWOWNER', secretKey: 'o', source: 'SCW_OWNER_*' });
    expect(id.ambient).toBeUndefined();
    expect(id.warnings).toEqual([]);
  });
  it("keeps the process's SCW_* pair apart as ambient, never as the admin key", () => {
    const id = resolveOperatorIdentity({ SCW_ACCESS_KEY: 'SCWCI', SCW_SECRET_KEY: 'c' });
    expect(id.admin).toBeUndefined();
    expect(id.ambient).toEqual({ accessKey: 'SCWCI', secretKey: 'c' });
  });
  it('treats a half-set pair as absent, with a warning, instead of aborting', () => {
    const id = resolveOperatorIdentity({ SCW_ADMIN_ACCESS_KEY: 'SCWX' });
    expect(id.admin).toBeUndefined();
    expect(id.warnings[0]).toMatch(/must be set together.*ignoring/);
  });
  it('reads a deprecated SCW_STATE_* pair as the admin key with a rename warning, and ignores it next to SCW_ADMIN_*', () => {
    const legacy = resolveOperatorIdentity({ SCW_STATE_ACCESS_KEY: 'SCWST', SCW_STATE_SECRET_KEY: 't' });
    expect(legacy.admin).toEqual({ accessKey: 'SCWST', secretKey: 't', source: 'SCW_STATE_*' });
    expect(legacy.warnings[0]).toMatch(/deprecated: rename them to SCW_ADMIN_ACCESS_KEY/);
    const both = resolveOperatorIdentity({
      SCW_ADMIN_ACCESS_KEY: 'SCWADMIN',
      SCW_ADMIN_SECRET_KEY: 's',
      SCW_STATE_ACCESS_KEY: 'SCWST',
      SCW_STATE_SECRET_KEY: 't',
    });
    expect(both.admin?.accessKey).toBe('SCWADMIN');
    expect(both.warnings[0]).toMatch(/ignored because SCW_ADMIN_\* is set/);
  });
  it('reads a deprecated SCW_BOOTSTRAP_* pair as the Owner API key, honouring the SCW_BOOTSTRAP_KEY misspelling', () => {
    expect(resolveOperatorIdentity({ SCW_BOOTSTRAP_ACCESS_KEY: 'SCWB', SCW_BOOTSTRAP_SECRET_KEY: 'b' }).owner).toEqual({
      accessKey: 'SCWB',
      secretKey: 'b',
      source: 'SCW_BOOTSTRAP_*',
    });
    const alias = resolveOperatorIdentity({ SCW_BOOTSTRAP_KEY: 'SCWB', SCW_BOOTSTRAP_SECRET_KEY: 'b' });
    expect(alias.owner?.accessKey).toBe('SCWB');
    expect(alias.warnings[0]).toMatch(/read as SCW_OWNER_ACCESS_KEY/);
    const both = resolveOperatorIdentity({
      SCW_OWNER_ACCESS_KEY: 'SCWO',
      SCW_OWNER_SECRET_KEY: 'o',
      SCW_BOOTSTRAP_ACCESS_KEY: 'SCWB',
      SCW_BOOTSTRAP_SECRET_KEY: 'b',
    });
    expect(both.owner?.accessKey).toBe('SCWO');
    expect(both.warnings[0]).toMatch(/SCW_BOOTSTRAP_\* is ignored/);
  });
  it('warns when the Owner API key slot holds the admin application key', () => {
    const id = resolveOperatorIdentity({
      SCW_ADMIN_ACCESS_KEY: 'SCWX',
      SCW_ADMIN_SECRET_KEY: 's',
      SCW_OWNER_ACCESS_KEY: 'SCWX',
      SCW_OWNER_SECRET_KEY: 's',
    });
    expect(id.warnings[0]).toMatch(/same key as SCW_ADMIN_\*/);
  });
});

describe('describeKey / classifyPrincipal', () => {
  it('describes an application key and classifies engine applications by name', async () => {
    const fetchImpl = makeFetch([
      {
        match: '/api-keys/SCWCI',
        body: { access_key: 'SCWCI', application_id: 'app-ci', expires_at: '2026-09-24T12:54:29Z' },
      },
      { match: '/applications/app-ci', body: { name: 'cella-production-ci-deploy' } },
    ]);
    const desc = await describeKey({ accessKey: 'SCWCI', secretKey: 's' }, { fetchImpl });
    expect(desc).toMatchObject({ bearer: 'application', name: 'cella-production-ci-deploy', bearerId: 'app-ci' });
    expect(classifyPrincipal(desc, names)).toBe('ci-deploy');
    expect(formatKeyLine(desc, 'ci-deploy')).toBe(
      'SCWCI → cella-production-ci-deploy (CI deploy application, expires 2026-09-24 12:54 UTC)',
    );
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

describe('assertIamManager', () => {
  const org = 'org-1';
  it('accepts an Owner key without consulting policies', async () => {
    const fetchImpl = makeFetch([
      { match: '/api-keys/SCWU', body: { access_key: 'SCWU', user_id: 'u-1' } },
      { match: '/users/u-1', body: { email: 'flip@example.com', type: 'owner' } },
    ]);
    const { role } = await assertIamManager({
      pair: { accessKey: 'SCWU', secretKey: 's' },
      names,
      organizationId: org,
      fetchImpl,
    });
    expect(role).toBe('owner');
  });
  it('rejects an application the engine created by name with the reason', async () => {
    const fetchImpl = makeFetch([
      { match: '/api-keys/SCWCI', body: { access_key: 'SCWCI', application_id: 'app-ci' } },
      { match: '/applications/app-ci', body: { name: 'cella-production-ci-deploy' } },
    ]);
    await expect(
      assertIamManager({ pair: { accessKey: 'SCWCI', secretKey: 's' }, names, organizationId: org, fetchImpl }),
    ).rejects.toThrow(/CI deploy application.*not an Owner API key/);
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
      assertIamManager({
        pair: { accessKey: 'SCWA', secretKey: 's' },
        names,
        organizationId: org,
        fetchImpl: withGrant,
      }),
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
      assertIamManager({
        pair: { accessKey: 'SCWA', secretKey: 's' },
        names,
        organizationId: org,
        fetchImpl: withoutGrant,
      }),
    ).rejects.toThrow(/no IAMManager grant/);
  });
  it('explains a key that cannot read IAM at all', async () => {
    const fetchImpl = makeFetch([{ match: '/api-keys/SCWV', body: { message: 'permissions_denied' }, status: 403 }]);
    await expect(
      assertIamManager({ pair: { accessKey: 'SCWV', secretKey: 's' }, names, organizationId: org, fetchImpl }),
    ).rejects.toThrow(/cannot describe itself in IAM/);
  });
});
