import { randomInt } from 'node:crypto';
import { formatPostgresUrl, passwordOfPostgresUrl } from '../lib/postgres-url';
import { databaseRuntimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets';
import { expectedDbPrivileges, POSTGRES_ROLE_NAMES } from '../lib/scaleway/db-privileges';
import { createRdbClient, type RdbUser } from '../lib/scaleway/scaleway-rdb';
import { createSecretManagerClient, type SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { secretCopyContainers } from '../lib/scaleway/secret-copies';
import { ENGINE_FOLDER } from '../lib/scaleway/secret-paths';
import { readStoreOutputs } from '../lib/stack/store-outputs';
import type { DatabaseRole } from '../lib/stores';

/** The database API calls the task needs, so a test passes its own. */
export interface EnsureDatabaseRdb {
  listUsers(instanceId: string): Promise<RdbUser[]>;
  createUser(instanceId: string, user: { name: string; password: string; isAdmin: boolean }): Promise<unknown>;
  setUserPassword(instanceId: string, name: string, password: string): Promise<void>;
  setPrivilege(instanceId: string, databaseName: string, userName: string, permission: 'all'): Promise<void>;
}

/** The Secret Manager calls the task needs. */
export interface EnsureDatabaseSecrets {
  getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined>;
  accessLatestValue(secretId: string): Promise<string>;
  ensureSecret(input: { name: string; path: string; description?: string }): Promise<SecretManagerSecret>;
  putSecretValue(input: { secretId: string; value: string; description?: string; disablePrevious?: boolean }): Promise<unknown>;
}

/** The private endpoint of the database, from the store's stack outputs. */
export interface DatabaseEndpoint {
  instanceId: string;
  privateIp: string;
  port: string;
  databaseName: string;
}

const ROLES: readonly DatabaseRole[] = ['admin', 'runtime'];

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
// URL-unreserved specials (RFC 3986): the password goes into connection strings.
const SPECIAL = '-_.~';

/**
 * A fresh role password: 32 characters with at least two of each class Scaleway's database API requires (a digit, an uppercase and a
 * lowercase letter, a special character), the rest from all four, in random order.
 */
export function generateRolePassword(): string {
  const all = LOWER + UPPER + DIGITS + SPECIAL;
  const pick = (from: string) => from[randomInt(from.length)] as string;
  const chars = [LOWER, LOWER, UPPER, UPPER, DIGITS, DIGITS, SPECIAL, SPECIAL].map(pick);
  while (chars.length < 32) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

/** The engine-folder container that keeps a role's password, which only the operator reads. */
export function rolePasswordSecretName(role: DatabaseRole): string {
  return `db-password-${role}`;
}

/** Where a role's password came from in this run. */
export type PasswordSource = 'stored' | 'recovered' | 'generated';

/**
 * Make the database roles, their passwords and privileges, and the connection strings, through the database API and Secret Manager, so no
 * password passes through the Pulumi state.
 * - A role's password is the one kept in the engine folder; failing that, the one an existing connection string of that role carries (a stack
 *   whose roles the program made keeps its passwords); failing that, a fresh one. A recovered or fresh one is kept in the engine folder.
 * - A missing role is created with its password and its privileges. A role that exists gets a fresh password only when none could be found.
 * - Every consumer's copy of a connection string is written when it is missing or names another endpoint or password.
 */
export async function ensureDatabase(opts: {
  rdb: EnsureDatabaseRdb;
  secrets: EnsureDatabaseSecrets;
  endpoint: DatabaseEndpoint;
  definitions?: readonly RuntimeSecretDefinition[];
  generate?: () => string;
  /** Rotate: a fresh password for every role, set on the live role, and every connection string rewritten. */
  rotate?: boolean;
  log?: (message: string) => void;
}): Promise<{ passwords: Record<DatabaseRole, PasswordSource>; created: string[]; written: string[] }> {
  const log = opts.log ?? ((message) => console.info(message));
  const generate = opts.generate ?? generateRolePassword;
  const definitions = opts.definitions ?? databaseRuntimeSecrets();
  const { databaseName } = opts.endpoint;
  // The store output names the instance as Pulumi does, `<region>/<uuid>`; the database API takes the uuid.
  const instanceId = opts.endpoint.instanceId.split('/').pop() ?? opts.endpoint.instanceId;

  const passwords = {} as Record<DatabaseRole, string>;
  const sources = {} as Record<DatabaseRole, PasswordSource>;
  for (const role of ROLES) {
    const kept = await opts.secrets.getSecretByName(rolePasswordSecretName(role), ENGINE_FOLDER);
    if (!opts.rotate && kept && (kept.version_count ?? 0) > 0) {
      passwords[role] = await opts.secrets.accessLatestValue(kept.id);
      sources[role] = 'stored';
      continue;
    }
    let recovered: string | undefined;
    for (const definition of opts.rotate ? [] : definitions.filter((candidate) => candidate.database?.role === role)) {
      for (const copy of await secretCopyContainers(opts.secrets, definition)) {
        if (recovered || !copy.container || (copy.container.version_count ?? 0) === 0) continue;
        recovered = passwordOfPostgresUrl(await opts.secrets.accessLatestValue(copy.container.id));
      }
    }
    passwords[role] = recovered ?? generate();
    sources[role] = recovered ? 'recovered' : 'generated';
  }

  const live = new Set((await opts.rdb.listUsers(instanceId)).map((user) => user.name));
  const created: string[] = [];
  for (const role of ROLES) {
    const name = POSTGRES_ROLE_NAMES[role];
    if (!live.has(name)) {
      await opts.rdb.createUser(instanceId, { name, password: passwords[role], isAdmin: role === 'admin' });
      for (const privilege of expectedDbPrivileges(databaseName).filter((entry) => entry.user === name)) {
        await opts.rdb.setPrivilege(instanceId, privilege.database, name, 'all');
      }
      created.push(name);
      log(`[ensure-database] ${name} created with its privileges`);
    } else if (sources[role] === 'generated') {
      await opts.rdb.setUserPassword(instanceId, name, passwords[role]);
      log(`[ensure-database] ${name} given the fresh password`);
    }
  }

  // A password is kept only once its role has it: kept before, a failure in between would leave the engine folder naming a password no role
  // has, which the next run would trust and write into every connection string.
  for (const role of ROLES) {
    if (sources[role] === 'stored') continue;
    const container =
      (await opts.secrets.getSecretByName(rolePasswordSecretName(role), ENGINE_FOLDER)) ??
      (await opts.secrets.ensureSecret({
        name: rolePasswordSecretName(role),
        path: ENGINE_FOLDER,
        description: `Password of the ${role} database role`,
      }));
    await opts.secrets.putSecretValue({
      secretId: container.id,
      value: passwords[role],
      description: `Kept by ensure-database (${sources[role]})`,
      disablePrevious: true,
    });
    log(`[ensure-database] ${role} role password ${sources[role]} and kept in ${ENGINE_FOLDER}`);
  }

  const written: string[] = [];
  for (const definition of definitions) {
    const role = definition.database?.role;
    if (!role) continue;
    const expected = formatPostgresUrl(POSTGRES_ROLE_NAMES[role], passwords[role], opts.endpoint.privateIp, opts.endpoint.port, databaseName);
    for (const copy of await secretCopyContainers(opts.secrets, definition)) {
      if (!copy.container) continue;
      const current = (copy.container.version_count ?? 0) > 0 ? await opts.secrets.accessLatestValue(copy.container.id) : undefined;
      if (current === expected) continue;
      await opts.secrets.putSecretValue({
        secretId: copy.container.id,
        value: expected,
        description: 'Assembled by ensure-database',
        disablePrevious: true,
      });
      written.push(`${definition.secretName}@${copy.service}`);
    }
  }
  if (written.length > 0) log(`[ensure-database] wrote ${written.length} connection string cop${written.length === 1 ? 'y' : 'ies'}`);
  return { passwords: sources, created, written };
}

/**
 * Run `ensureDatabase` for a stack whose `pulumi up` completed: the endpoint from its store outputs, the operator key for the database API and
 * Secret Manager. Nothing when the app declares no database connection string or the stack has no managed database yet.
 */
export async function ensureDatabaseForStack(opts: {
  env: NodeJS.ProcessEnv;
  stack: string;
  region: string;
  projectId: string;
  secretKey: string;
  rotate?: boolean;
  log?: (message: string) => void;
}): Promise<void> {
  const log = opts.log ?? ((message) => console.info(message));
  if (databaseRuntimeSecrets().length === 0) return;
  const store = Object.values(readStoreOutputs(opts.env, opts.stack)).find(
    (outputs) => outputs.instanceId && outputs.privateIp && outputs.databaseName,
  );
  if (!store?.instanceId || !store.privateIp || !store.databaseName) {
    log('[ensure-database] the stack has no managed database endpoint yet');
    return;
  }
  await ensureDatabase({
    rdb: createRdbClient({ secretKey: opts.secretKey, region: opts.region }),
    secrets: createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId }),
    endpoint: { instanceId: store.instanceId, privateIp: store.privateIp, port: store.port || '5432', databaseName: store.databaseName },
    rotate: opts.rotate,
    log,
  });
}
