import { spawnSync } from 'node:child_process';
import { copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { appStores } from '../../config/stores.config';
import { parseAclInput } from '../../lib/db-exposure-acl';
import { closePublicEndpoints, dbInstanceUrn, endpointAddress, exposureOverlayPath, publicEndpoints } from '../../lib/db-public-endpoint';
import { deriveInfra } from '../../lib/naming';
import { actionLabel } from '../../lib/operator-actions';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { createRdbClient, type RdbEndpoint } from '../../lib/scaleway/scaleway-rdb';
import { pulumiConfigRm, pulumiConfigSet } from '../../lib/stack/pulumi-up';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { hardenPublicDsn } from '../../lib/utils/public-dsn';
import { within } from '../../lib/utils/retry';
import { endAction, endsAction, type InfraContext } from '../shared';
import { printRevokeReminder } from './owner-key';
import { type PrivilegedConvergeOptions, runPrivilegedConverge } from './privileged-converge';

// Pulumi config keys consumed by resources/stores/postgres-managed.ts and the outputs it exports.
const DB_ENDPOINT_KEY = 'infra:dbPublicEndpoint';
const DB_ACL_KEY = 'infra:dbPublicAcl';
// Keys within the primary store's entry of the `storeOutputs` stack output.
const PUBLIC_DSN_OUTPUT = 'connectionStringAdminPublic';
const DB_CA_OUTPUT = 'caCertificate';
const PRIMARY_STORE_ID = Object.keys(appStores)[0] ?? 'primary';

/**
 * Create the exposure overlay by copying the committed stack config, which carries `encryptionsalt` so secret config encrypts with the same passphrase.
 * While the returned overlay file exists, the CLI menu treats the endpoint as exposure-managed.
 */
function writeExposureOverlay(stackPath: string, environment: string): string {
  const overlayPath = exposureOverlayPath(environment);
  copyFileSync(stackPath, overlayPath);
  return overlayPath;
}

/** Delete the exposure overlay after a successful close of the endpoint. */
export function removeExposureOverlay(environment: string): void {
  rmSync(exposureOverlayPath(environment), { force: true });
}

/** Detect the operator's current public IPv4 via a well-known echo service. */
export async function detectPublicIp(): Promise<string | undefined> {
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const body = (await res.text()).trim();
    return body || undefined;
  } catch {
    return undefined;
  }
}

/** Read one key of the primary store's `storeOutputs` entry; empty when absent or unreadable. */
function readPrimaryStoreOutput(env: NodeJS.ProcessEnv, stack: string, key: string): string {
  const result = spawnSync('pulumi', ['stack', 'output', 'storeOutputs', '--show-secrets', '--json', '--stack', stack], {
    cwd: infraDir,
    env,
    encoding: 'utf8',
  });
  if (result.status !== 0) return '';
  try {
    const parsed = JSON.parse(result.stdout ?? '{}') as Record<string, Record<string, string> | undefined>;
    return (parsed?.[PRIMARY_STORE_ID]?.[key] ?? '').trim();
  } catch {
    return '';
  }
}

/** Read the public admin DSN store output (empty when the endpoint is disabled). */
export function readPublicDsn(env: NodeJS.ProcessEnv, stack: string): string {
  return readPrimaryStoreOutput(env, stack, PUBLIC_DSN_OUTPUT);
}

/** Read the database instance CA certificate store output (PEM; empty when unavailable). */
export function readDbCa(env: NodeJS.ProcessEnv, stack: string): string {
  return readPrimaryStoreOutput(env, stack, DB_CA_OUTPUT);
}

/** Write the instance CA to a 0600 temp file for `sslrootcert`, so the printed break-glass DSN verifies the server certificate and hostname. Undefined when the CA output is unavailable. */
function writeDbCaFile(env: NodeJS.ProcessEnv, stack: string, environment: string): string | undefined {
  const ca = readDbCa(env, stack);
  if (!ca) return undefined;
  const caPath = join(tmpdir(), `cella-db-ca-${environment}.pem`);
  writeFileSync(caPath, `${ca}\n`, { mode: 0o600 });
  return caPath;
}

/** The secret key a converge env authenticates with: the Owner API key, or the key minted from it. */
function convergeSecretKey(env: NodeJS.ProcessEnv): string {
  if (!env.SCW_SECRET_KEY) throw new Error('the converge environment carries no SCW_SECRET_KEY');
  return env.SCW_SECRET_KEY;
}

/** The managed PostgreSQL instance, looked up by its name over the RDB API. */
async function findDbInstance(context: InfraContext, secretKey: string) {
  const { naming, region } = deriveInfra(context.appConfig);
  const client = createRdbClient({ secretKey, region });
  const name = naming.resource('postgres');
  const instance = await client.findInstance(name);
  if (!instance) throw new Error(`no managed database instance named '${name}' in ${region}`);
  return { client, instanceId: instance.id };
}

/** The instance's live public endpoints and ACL rules, read over the RDB API (RelationalDatabasesReadOnly is enough). */
async function readDbExposure(context: InfraContext, secretKey: string): Promise<{ endpoints: RdbEndpoint[]; aclRules: number }> {
  const { client, instanceId } = await findDbInstance(context, secretKey);
  const [instance, rules] = await Promise.all([client.getInstance(instanceId), client.listAclRules(instanceId)]);
  return { endpoints: publicEndpoints(instance), aclRules: rules.length };
}

/** The live public endpoints, read with the admin application key within `budgetMs`. Undefined without that key, without an answer in time and on any error, so the menu falls back to the config. */
export async function liveDbEndpoints(context: InfraContext, budgetMs = 4_000): Promise<string[] | undefined> {
  const admin = resolveOperatorIdentity().admin;
  if (!admin) return undefined;
  const read = readDbExposure(context, admin.secretKey).then(
    (exposure) => exposure.endpoints.map(endpointAddress),
    () => undefined,
  );
  return within(budgetMs, read);
}

/**
 * `pulumi refresh` of the database instance alone, so the state records the endpoints it has. The state keeps an endpoint deleted outside Pulumi,
 * and the program's `loadBalancer: {}` would then plan no new one.
 */
function refreshDbInstance(env: NodeJS.ProcessEnv, stack: string): void {
  const args = ['refresh', '--stack', stack, '--target', dbInstanceUrn(stack), '--yes', '--skip-preview', '--non-interactive'];
  console.info(`\n→ Reading the database instance into the state\n  $ pulumi ${args.join(' ')}`);
  const result = spawnSync('pulumi', args, { cwd: infraDir, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`pulumi refresh of the database instance exited ${result.status}`);
}

/** The converge `prepare` of every expose: refresh the instance so the `up` creates the endpoint whatever the state held, then write the overlay. */
export function prepareExpose(context: InfraContext, acl: string): NonNullable<PrivilegedConvergeOptions['prepare']> {
  return (env, stack) => {
    refreshDbInstance(env, stack);
    const overlay = writeExposureOverlay(context.stackPath, context.environment);
    pulumiConfigSet(env, stack, DB_ENDPOINT_KEY, 'true', { configFile: overlay });
    // Encrypt the ACL: it records the operator's source IP and must not sit in plaintext in the overlay.
    pulumiConfigSet(env, stack, DB_ACL_KEY, acl, { secret: true, configFile: overlay });
    return overlay;
  };
}

/**
 * The converge `prepare` of every close. Converging config without the exposure keys never removes the endpoint, so this deletes every public
 * endpoint over the RDB API, waits until a re-read of the instance shows none, and refreshes the instance so the state records none either.
 */
export function prepareClose(context: InfraContext): NonNullable<PrivilegedConvergeOptions['prepare']> {
  return async (env, stack) => {
    // Compat: stacks predating the overlay hold the exposure keys in the committed config.
    if (context.stackYaml?.includes(DB_ENDPOINT_KEY)) pulumiConfigRm(env, stack, DB_ENDPOINT_KEY);
    if (context.stackYaml?.includes(DB_ACL_KEY)) pulumiConfigRm(env, stack, DB_ACL_KEY);
    const { client, instanceId } = await findDbInstance(context, convergeSecretKey(env));
    const { deleted } = await closePublicEndpoints({
      getInstance: () => client.getInstance(instanceId),
      deleteEndpoint: (endpointId) => client.deleteEndpoint(endpointId),
      log: (line) => console.info(pc.dim(`  ${line}`)),
    });
    console.info(
      deleted.length > 0 ? `${checkMark} Deleted public endpoint ${deleted.join(', ')}.` : pc.dim('  The instance has no public endpoint.'),
    );
    refreshDbInstance(env, stack);
    return undefined;
  };
}

/** Converge with the exposure semantics: a throw or a declined retry loop is a hard stop. */
async function convergeOrExit(
  context: InfraContext,
  operation: string,
  hooks: Pick<PrivilegedConvergeOptions, 'prepare' | 'afterUp'>,
): Promise<{ env: NodeJS.ProcessEnv; stack: string; ownerKeyPasted: boolean }> {
  let result: Awaited<ReturnType<typeof runPrivilegedConverge>>;
  try {
    result = await runPrivilegedConverge(context, { operation, ...hooks });
  } catch (error) {
    if (endsAction(error)) throw error;
    console.error(`${crossMark} ${operation} stopped: ${errorMessage(error)}`);
    endAction(1);
  }
  if (!result.completed) {
    console.error(`${crossMark} converge did not complete; stack config may be partially applied. Re-run to finish.`);
    endAction(1);
  }
  return result;
}

/**
 * Open the database's public endpoint for scoped operator access: prompt for the client ACL (default the detected /32), converge with the Owner API key, print the admin DSN.
 * The endpoint is internet-reachable but restricted to the ACL; run "Close public DB access" when finished.
 */
export async function runExposeDatabase(context: InfraContext): Promise<void> {
  console.info(pc.dim(`\n${actionLabel('db-open')}: add a scoped, temporary public endpoint for operator tasks.\n`));

  const detected = await detectPublicIp();
  const suggestion = detected ? `${detected}/32` : '';
  if (detected) console.info(`Detected your public IP: ${pc.cyan(detected)} → default ACL ${pc.cyan(suggestion)}`);
  else console.warn(`${warningMark} Could not auto-detect your public IP; enter the client CIDR(s) manually.`);

  const raw = await input({
    message: 'Allowed client IPv4 CIDR(s), comma-separated',
    default: suggestion || undefined,
    validate: (value) => {
      const parsed = parseAclInput(value);
      return parsed.ok || parsed.reason;
    },
  });
  const parsed = parseAclInput(raw);
  if (!parsed.ok) {
    console.error(`${crossMark} ${parsed.reason}`);
    endAction(1);
  }
  const acl = parsed.cidrs.join(',');

  console.warn(
    `\n${pc.yellow(pc.bold('⚠  This opens an internet-reachable database endpoint'))}, restricted to: ${pc.cyan(acl)}.\n` +
      `  ${pc.dim(`Exposure lives only in the gitignored overlay Pulumi.${context.environment}.exposure.yaml; the committed stack config stays clean.`)}\n` +
      `  ${pc.dim(`A deploy does not remove the endpoint: run "${actionLabel('db-close')}" when done.`)}\n`,
  );
  if (!(await confirm({ message: 'Proceed with exposing the database?', default: false }))) {
    console.info('Aborted; no changes made.');
    return;
  }

  let live: { endpoints: RdbEndpoint[]; aclRules: number } | undefined;
  const { env, stack, ownerKeyPasted } = await convergeOrExit(context, 'expose-db', {
    prepare: prepareExpose(context, acl),
    afterUp: async (e) => {
      live = await readDbExposure(context, convergeSecretKey(e));
    },
  });

  if (live && live.endpoints.length === 0) {
    console.warn(`${warningMark} The up completed, but the instance has no public endpoint. Re-run "${actionLabel('db-open')}".`);
  } else if (live) {
    console.info(`${checkMark} Public endpoint ${live.endpoints.map(endpointAddress).join(', ')} is open with ${live.aclRules} ACL rule(s).`);
  }
  const dsn = readPublicDsn(env, stack);
  if (!dsn) {
    console.warn(
      `${warningMark} Endpoint applied but no public DSN output yet: Scaleway may still be provisioning the load balancer. Re-run to read it.`,
    );
  } else {
    // Verified TLS for the printed DSN, which carries the admin role and travels over the open endpoint.
    const caPath = writeDbCaFile(env, stack, context.environment);
    const shownDsn = caPath ? hardenPublicDsn(dsn, caPath) : dsn;
    console.info(`\n${checkMark} ${pc.bold('Database exposed.')} Admin connection string:\n\n    ${pc.cyan(shownDsn)}\n`);
    console.info(`  ${pc.dim('Example:')} psql "${shownDsn}"`);
    if (caPath) console.info(`  ${pc.dim(`Server verification pins the instance CA written to ${caPath} (sslmode=verify-full).`)}`);
    else console.warn(`  ${warningMark} CA output unavailable; DSN left encrypt-only (sslmode=require). Re-run to pick up the CA.`);
  }
  console.info(`\n  ${pc.bold(`When finished, run "${actionLabel('db-close')}" to close it again.`)}`);
  if (ownerKeyPasted) printRevokeReminder();
}

/** Close the database's public endpoint: delete it over the RDB API, converge without the exposure config, and confirm the instance has none left. */
export async function runUnexposeDatabase(context: InfraContext): Promise<void> {
  console.info(pc.dim(`\n${actionLabel('db-close')}: remove the public endpoint and ACL, return to private-only.\n`));
  if (!(await confirm({ message: 'Close the public database endpoint now?', default: true }))) {
    console.info('Aborted; no changes made.');
    return;
  }

  let left: RdbEndpoint[] | undefined;
  const { ownerKeyPasted } = await convergeOrExit(context, 'unexpose-db', {
    prepare: prepareClose(context),
    afterUp: async (env) => {
      left = (await readDbExposure(context, convergeSecretKey(env))).endpoints;
    },
  });
  removeExposureOverlay(context.environment);

  if (!left) {
    console.warn(`${warningMark} Could not re-read the instance after the up; the delete before it was confirmed. Check "${actionLabel('status')}".`);
  } else if (left.length > 0) {
    console.warn(
      `${warningMark} The instance has public endpoint ${left.map(endpointAddress).join(', ')} again. Re-run "${actionLabel('db-close')}".`,
    );
  } else {
    console.info(`\n${checkMark} ${pc.bold('Public endpoint closed.')} The database is private-only again.`);
  }
  if (ownerKeyPasted) printRevokeReminder();
}
