import { describe, expect, it } from 'vitest';
import type { EngineConfig } from '../config/engine-config';
import { CRON_HOME_DATABASE, expectedDbPrivileges, POSTGRES_ROLE_NAMES } from '../lib/scaleway/db-privileges';
import type { FetchLike } from '../lib/utils/fetch-like';
import { verifyAfterApply } from './verify-after-apply';

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

describe('verifyAfterApply', () => {
  const instance = {
    match: '/rdb/v1/regions/nl-ams/instances?',
    body: { instances: [{ id: 'i-1', name: 'cella-postgres', status: 'ready' }], total_count: 1 },
  };

  it('passes when every declared privilege exists live', async () => {
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
    const result = await verifyAfterApply({ appConfig, secretKey: 's', fetchImpl, log: () => {} });
    expect(result).toEqual({ ok: true, problems: [], errors: [] });
  });

  it('reports a missing cron privilege', async () => {
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
    const result = await verifyAfterApply({ appConfig, secretKey: 's', fetchImpl, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["database privilege admin_role on rdb: live 'none', expected one of all"]);
  });

  it('keeps probe failures apart from verified differences: a revoked key is unknown, not wrong', async () => {
    const denied: FetchLike = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: 'authentication is denied' }) });
    const result = await verifyAfterApply({ appConfig, secretKey: 'revoked', fetchImpl: denied, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([]);
    expect(result.errors[0]).toMatch(/401/);
  });
});
