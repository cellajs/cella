import { describe, expect, it } from 'vitest';
import type { EngineConfig } from '../config/engine-config';
import { CRON_HOME_DATABASE, expectedDbPrivileges, POSTGRES_ROLE_NAMES } from '../lib/scaleway/db-privileges';
import type { FetchLike } from '../lib/utils/fetch-like';
import type { assertVmGrants } from './assert-vm-grants';
import { verifyPrivilegedUp } from './verify-privileged-up';

function makeFetch(routes: Array<{ match: string; body: unknown }>): FetchLike {
  return async (url) => {
    const route = routes.find((r) => url.includes(r.match));
    return { ok: !!route, status: route ? 200 : 404, text: async () => JSON.stringify(route?.body ?? {}) };
  };
}

const appConfig = {
  slug: 'cella',
  mode: 'production',
  domain: 'cellajs.com',
  singleVM: true,
  s3: { region: 'nl-ams' },
  services: { backend: { enabled: true } },
} as unknown as EngineConfig;

const okGrants: typeof assertVmGrants = async () => ({
  ok: true,
  granted: [],
  missing: [],
  extra: [],
  unconditionedSecretRules: [],
  dormantKeys: [],
  misscopedRules: [],
});

const privileges = (rows: Array<[string, string, string]>) =>
  rows.map(([database_name, user_name, permission]) => ({ database_name, user_name, permission }));

describe('expectedDbPrivileges', () => {
  it('declares both roles on the app database and the admin role on the cron home database', () => {
    expect(expectedDbPrivileges('cella').map((p) => `${p.user}@${p.database}`)).toEqual([
      `${POSTGRES_ROLE_NAMES.admin}@cella`,
      `${POSTGRES_ROLE_NAMES.admin}@${CRON_HOME_DATABASE}`,
      `${POSTGRES_ROLE_NAMES.runtime}@cella`,
    ]);
  });
});

describe('verifyPrivilegedUp', () => {
  const instance = {
    match: '/rdb/v1/regions/nl-ams/instances?',
    body: { instances: [{ id: 'i-1', name: 'cella-postgres', status: 'ready' }], total_count: 1 },
  };

  it('passes when grants verify and every declared privilege exists live', async () => {
    const fetchImpl = makeFetch([
      instance,
      {
        match: 'privileges?database_name=cella',
        body: {
          privileges: privileges([
            ['cella', 'admin_role', 'custom'],
            ['cella', 'runtime_role', 'custom'],
          ]),
          total_count: 2,
        },
      },
      {
        match: 'privileges?database_name=rdb',
        body: { privileges: privileges([['rdb', 'admin_role', 'all']]), total_count: 1 },
      },
    ]);
    const result = await verifyPrivilegedUp({
      appConfig,
      projectId: 'p',
      organizationId: 'o',
      secretKey: 's',
      fetchImpl,
      assertGrants: okGrants,
      log: () => {},
    });
    expect(result).toEqual({ ok: true, problems: [], errors: [] });
  });

  it('reports a missing cron privilege and a failed grant', async () => {
    const fetchImpl = makeFetch([
      instance,
      {
        match: 'privileges?database_name=cella',
        body: {
          privileges: privileges([
            ['cella', 'admin_role', 'all'],
            ['cella', 'runtime_role', 'all'],
          ]),
          total_count: 2,
        },
      },
      { match: 'privileges?database_name=rdb', body: { privileges: [], total_count: 0 } },
    ]);
    const failingGrants: typeof assertVmGrants = async (opts) => ({
      ...(await okGrants(opts)),
      ok: opts.applicationName !== 'cella-production-vm-backend',
    });
    const result = await verifyPrivilegedUp({
      appConfig,
      projectId: 'p',
      organizationId: 'o',
      secretKey: 's',
      fetchImpl,
      assertGrants: failingGrants,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      'cella-production-vm-backend: live grant differs from the declared one (see the lines above)',
      "database privilege admin_role on rdb: live 'none', expected one of all",
    ]);
  });

  it('keeps probe failures apart from verified differences: a revoked key is unknown, not wrong', async () => {
    const denied: FetchLike = async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: 'authentication is denied' }),
    });
    const throwingGrants: typeof assertVmGrants = async () => {
      throw new Error('Scaleway GET applications → 401: authentication is denied');
    };
    const result = await verifyPrivilegedUp({
      appConfig,
      projectId: 'proj-1',
      organizationId: 'org-1',
      secretKey: 'revoked',
      fetchImpl: denied,
      assertGrants: throwingGrants,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.errors[0]).toMatch(/401/);
  });

  it('passes the project scope only to conditioned (VM/boot) rows', async () => {
    const seen: Array<{ app?: string; scope?: string }> = [];
    const spyGrants: typeof assertVmGrants = async (opts) => {
      seen.push({ app: opts.applicationName, scope: opts.requiredProjectId });
      return okGrants(opts);
    };
    const fetchImpl = makeFetch([
      instance,
      {
        match: 'privileges?',
        body: {
          privileges: privileges([
            ['cella', 'admin_role', 'all'],
            ['cella', 'runtime_role', 'all'],
            ['rdb', 'admin_role', 'all'],
          ]),
          total_count: 3,
        },
      },
    ]);
    await verifyPrivilegedUp({
      appConfig,
      projectId: 'p',
      organizationId: 'o',
      secretKey: 's',
      fetchImpl,
      assertGrants: spyGrants,
      log: () => {},
    });
    expect(seen.find((row) => row.app === 'cella-production-ci-deploy')?.scope).toBeUndefined();
    expect(seen.find((row) => row.app === 'cella-production-vm-backend')?.scope).toBe('p');
  });
});
