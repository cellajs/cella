import { describe, expect, it } from 'vitest';
import { formatPostgresUrl } from '../lib/postgres-url';
import type { RuntimeSecretDefinition } from '../lib/runtime-secrets';
import { POSTGRES_ROLE_NAMES } from '../lib/scaleway/db-privileges';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { type EnsureDatabaseRdb, type EnsureDatabaseSecrets, ensureDatabase } from './ensure-database';

const root = '/app-production';
const endpoint = { instanceId: 'inst', privateIp: '10.0.0.9', port: '5432', databaseName: 'app' };
const definitions = [
  { id: 'databaseUrlRuntime', secretName: 'database-url-runtime', services: ['backend'], database: { role: 'runtime' } },
  { id: 'databaseUrlAdmin', secretName: 'database-url-admin', services: ['backend'], database: { role: 'admin' } },
  { id: 'databaseUrlCdc', secretName: 'database-url-cdc', services: ['cdc'], database: { role: 'admin' } },
] as unknown as RuntimeSecretDefinition[];
const dsn = (role: 'admin' | 'runtime', password: string, ip = endpoint.privateIp) =>
  formatPostgresUrl(POSTGRES_ROLE_NAMES[role], password, ip, 5432, 'app');

/** Secret Manager as a fake: `path + name` → latest value, or undefined for an empty container; writes recorded. */
function fakeSecrets(store: Record<string, string | undefined>) {
  const writes: Record<string, string> = {};
  const secrets: EnsureDatabaseSecrets = {
    getSecretByName: async (name, path) =>
      `${path}${name}` in store
        ? ({ id: `${path}${name}`, name, path, version_count: store[`${path}${name}`] === undefined ? 0 : 1 } as SecretManagerSecret)
        : undefined,
    accessLatestValue: async (id) => store[id] ?? '',
    ensureSecret: async (input) => {
      store[`${input.path}${input.name}`] = undefined;
      return { id: `${input.path}${input.name}`, name: input.name, path: input.path };
    },
    putSecretValue: async (input) => {
      writes[input.secretId] = input.value;
      store[input.secretId] = input.value;
      return {};
    },
  };
  return { secrets, writes };
}

/** The database API as a fake: the users that exist; every call recorded. */
function fakeRdb(users: string[]) {
  const calls: string[] = [];
  const rdb: EnsureDatabaseRdb = {
    listUsers: async () => users.map((name) => ({ name })),
    createUser: async (_instance, user) => {
      calls.push(`create ${user.name} admin=${user.isAdmin}`);
    },
    setUserPassword: async (_instance, name) => {
      calls.push(`password ${name}`);
    },
    setPrivilege: async (_instance, database, user, permission) => {
      calls.push(`privilege ${user} ${database} ${permission}`);
    },
  };
  return { rdb, calls };
}

const run = (rdb: EnsureDatabaseRdb, secrets: EnsureDatabaseSecrets, ip = endpoint.privateIp) =>
  ensureDatabase({
    rdb,
    secrets,
    slug: 'app',
    mode: 'production',
    endpoint: { ...endpoint, privateIp: ip },
    definitions,
    generate: () => 'fresh',
    log: () => {},
  });

describe('ensureDatabase', () => {
  it('keeps the passwords of a stack whose roles the program made: recovered from its connection strings, and nothing changes', async () => {
    const { secrets, writes } = fakeSecrets({
      [`${root}/backend/database-url-runtime`]: dsn('runtime', 'run-pw'),
      [`${root}/backend/database-url-admin`]: dsn('admin', 'adm-pw'),
      [`${root}/cdc/database-url-cdc`]: dsn('admin', 'adm-pw'),
    });
    const { rdb, calls } = fakeRdb([POSTGRES_ROLE_NAMES.admin, POSTGRES_ROLE_NAMES.runtime]);
    const result = await run(rdb, secrets);
    expect(result.passwords).toEqual({ admin: 'recovered', runtime: 'recovered' });
    expect(calls).toEqual([]);
    expect(writes).toEqual({ [`${root}/engine/db-password-admin`]: 'adm-pw', [`${root}/engine/db-password-runtime`]: 'run-pw' });
  });

  it('makes the roles of a fresh database, and only the migration role is a Scaleway admin', async () => {
    const { secrets, writes } = fakeSecrets({ [`${root}/backend/database-url-runtime`]: undefined, [`${root}/cdc/database-url-cdc`]: undefined });
    const { rdb, calls } = fakeRdb([]);
    await run(rdb, secrets);
    expect(calls.filter((call) => call.startsWith('create'))).toEqual([
      `create ${POSTGRES_ROLE_NAMES.admin} admin=true`,
      `create ${POSTGRES_ROLE_NAMES.runtime} admin=false`,
    ]);
    expect(calls).toContain(`privilege ${POSTGRES_ROLE_NAMES.admin} rdb all`);
    expect(writes[`${root}/backend/database-url-runtime`]).toBe(dsn('runtime', 'fresh'));
    expect(writes[`${root}/cdc/database-url-cdc`]).toBe(dsn('admin', 'fresh'));
  });

  it('rewrites every copy that names another endpoint', async () => {
    const { secrets, writes } = fakeSecrets({
      [`${root}/engine/db-password-admin`]: 'adm-pw',
      [`${root}/engine/db-password-runtime`]: 'run-pw',
      [`${root}/backend/database-url-runtime`]: dsn('runtime', 'run-pw', '10.0.0.1'),
    });
    await run(fakeRdb([POSTGRES_ROLE_NAMES.admin, POSTGRES_ROLE_NAMES.runtime]).rdb, secrets);
    expect(writes).toEqual({ [`${root}/backend/database-url-runtime`]: dsn('runtime', 'run-pw') });
  });

  it('gives a role that exists a fresh password only when none could be found anywhere', async () => {
    const { secrets } = fakeSecrets({ [`${root}/engine/db-password-admin`]: 'adm-pw' });
    const { rdb, calls } = fakeRdb([POSTGRES_ROLE_NAMES.admin, POSTGRES_ROLE_NAMES.runtime]);
    await run(rdb, secrets);
    expect(calls).toEqual([`password ${POSTGRES_ROLE_NAMES.runtime}`]);
  });
});
