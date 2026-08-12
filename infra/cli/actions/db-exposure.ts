import { spawnSync } from 'node:child_process';
import { copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { appStores } from '../../config/stores.config';
import { pulumiConfigRm, pulumiConfigSet } from '../../lib/stack/pulumi-up';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { hardenPublicDsn } from '../../lib/utils/public-dsn';
import type { InfraContext } from '../shared';
import { parseAclInput } from './db-exposure-acl';
import { printRevokeReminder, runPrivilegedConverge } from './privileged-converge';

// Pulumi config keys consumed by resources/stores/postgres-managed.ts and the outputs it exports.
export const DB_ENDPOINT_KEY = 'infra:dbPublicEndpoint';
export const DB_ACL_KEY = 'infra:dbPublicAcl';
// Keys within the primary store's entry of the `storeOutputs` stack output
// (the flat db* outputs were retired in the 2026-08 planned break).
const PUBLIC_DSN_OUTPUT = 'connectionStringAdminPublic';
const DB_CA_OUTPUT = 'caCertificate';
const PRIMARY_STORE_ID = Object.keys(appStores)[0] ?? 'primary';

/**
 * Gitignored per-environment stack config overlay that carries the DB-exposure
 * keys. Exposure converges run `pulumi up --config-file` with this file, so the
 * committed `Pulumi.<env>.yaml` never records an open endpoint and any normal
 * deploy (CI uses the committed file) converges the endpoint closed again.
 */
export function exposureOverlayPath(environment: string): string {
  return join(infraDir, `Pulumi.${environment}.exposure.yaml`);
}

/**
 * Create the exposure overlay as a copy of the committed stack config (the copy
 * carries `encryptionsalt`, so secret config encrypts with the same passphrase).
 * Returns the overlay path; while the file exists it also marks the endpoint as
 * exposure-managed for the CLI menu.
 */
export function writeExposureOverlay(stackPath: string, environment: string): string {
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
  const result = spawnSync(
    'pulumi',
    ['stack', 'output', 'storeOutputs', '--show-secrets', '--json', '--stack', stack],
    { cwd: infraDir, env, encoding: 'utf8' },
  );
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

/**
 * Write the instance CA to a mode-scoped temp file (0600) for `sslrootcert`,
 * so the printed break-glass DSN verifies the server certificate and hostname.
 * Returns undefined when the CA output is unavailable.
 */
export function writeDbCaFile(env: NodeJS.ProcessEnv, stack: string, environment: string): string | undefined {
  const ca = readDbCa(env, stack);
  if (!ca) return undefined;
  const caPath = join(tmpdir(), `cella-db-ca-${environment}.pem`);
  writeFileSync(caPath, `${ca}\n`, { mode: 0o600 });
  return caPath;
}

/** Converge with the exposure semantics: a declined retry loop is a hard stop. */
async function convergeOrExit(
  context: InfraContext,
  operation: string,
  prepare: (env: NodeJS.ProcessEnv, stack: string) => string | undefined,
): Promise<{ env: NodeJS.ProcessEnv; stack: string }> {
  const { env, stack, completed } = await runPrivilegedConverge(context, { operation, prepare });
  if (!completed) {
    console.error(`${crossMark} converge did not complete; stack config may be partially applied. Re-run to finish.`);
    process.exit(1);
  }
  return { env, stack };
}

/**
 * Open the database's public endpoint for scoped operator access (prototyping,
 * debugging). Prompts for the client ACL (defaults to the operator's detected
 * /32), converges with a bootstrap key, then prints the admin DSN. The endpoint
 * is internet-reachable but restricted to the ACL; run "Stop public DB
 * exposure" when finished.
 */
export async function runExposeDatabase(context: InfraContext): Promise<void> {
  console.info(pc.dim('\nExpose database publicly: add a scoped, temporary public endpoint for operator tasks.\n'));

  const detected = await detectPublicIp();
  const suggestion = detected ? `${detected}/32` : '';
  if (detected) console.info(`Detected your public IP: ${pc.cyan(detected)} → default ACL ${pc.cyan(suggestion)}`);
  else console.warn(`${warningMark} Could not auto-detect your public IP; enter the client CIDR(s) manually.`);

  const raw = await input({
    message: 'Allowed client CIDR(s), comma-separated',
    default: suggestion || undefined,
    validate: (value) => {
      const parsed = parseAclInput(value);
      return parsed.ok || parsed.reason;
    },
  });
  const parsed = parseAclInput(raw);
  if (!parsed.ok) {
    console.error(`${crossMark} ${parsed.reason}`);
    process.exit(1);
  }
  const acl = parsed.cidrs.join(',');

  console.warn(
    `\n${pc.yellow(pc.bold('⚠  This opens an internet-reachable database endpoint'))}, restricted to: ${pc.cyan(acl)}.\n` +
      `  ${pc.dim(`Exposure lives only in the gitignored overlay Pulumi.${context.environment}.exposure.yaml; the committed stack config stays clean,`)}\n` +
      `  ${pc.dim('so the next CI deploy converges the endpoint closed. Run "Stop public DB exposure" when done sooner.')}\n`,
  );
  if (!(await confirm({ message: 'Proceed with exposing the database?', default: false }))) {
    console.info('Aborted; no changes made.');
    return;
  }

  const { env, stack } = await convergeOrExit(context, 'expose-db', (e, s) => {
    const overlay = writeExposureOverlay(context.stackPath, context.environment);
    pulumiConfigSet(e, s, DB_ENDPOINT_KEY, 'true', { configFile: overlay });
    // Encrypt the ACL: it records the operator's source IP and should not sit in
    // plaintext in the overlay either.
    pulumiConfigSet(e, s, DB_ACL_KEY, acl, { secret: true, configFile: overlay });
    return overlay;
  });

  const dsn = readPublicDsn(env, stack);
  if (!dsn) {
    console.warn(
      `${warningMark} Endpoint applied but no public DSN output yet — Scaleway may still be provisioning the load balancer. Re-run to read it.`,
    );
  } else {
    // Verified TLS for the printed DSN: an exposure window is exactly when an
    // on-path attacker is most interesting, and this DSN carries the admin role.
    const caPath = writeDbCaFile(env, stack, context.environment);
    const shownDsn = caPath ? hardenPublicDsn(dsn, caPath) : dsn;
    console.info(
      `\n${checkMark} ${pc.bold('Database exposed.')} Admin connection string:\n\n    ${pc.cyan(shownDsn)}\n`,
    );
    console.info(`  ${pc.dim('Example:')} psql "${shownDsn}"`);
    if (caPath)
      console.info(
        `  ${pc.dim(`Server verification pins the instance CA written to ${caPath} (sslmode=verify-full).`)}`,
      );
    else
      console.warn(
        `  ${warningMark} CA output unavailable; DSN left encrypt-only (sslmode=require). Re-run to pick up the CA.`,
      );
  }
  console.info(`\n  ${pc.bold('When finished, run "Stop public DB exposure" to close it again.')}`);
  printRevokeReminder();
}

/**
 * Close the database's public endpoint: clears the opt-in config, tears down the
 * load balancer and ACL, and verifies the database is private-only again.
 */
export async function runUnexposeDatabase(context: InfraContext): Promise<void> {
  console.info(pc.dim('\nStop public DB exposure: remove the public endpoint and ACL, return to private-only.\n'));
  if (!(await confirm({ message: 'Close the public database endpoint now?', default: true }))) {
    console.info('Aborted; no changes made.');
    return;
  }

  const { env, stack } = await convergeOrExit(context, 'unexpose-db', (e, s) => {
    // Compat: stacks that predate the overlay recorded the exposure keys in the
    // committed stack config; remove them so the plain converge closes the
    // endpoint. Overlay-based exposure needs no config change here: converging
    // the committed file (which lacks the keys) is the close.
    if (context.stackYaml?.includes(DB_ENDPOINT_KEY)) pulumiConfigRm(e, s, DB_ENDPOINT_KEY);
    if (context.stackYaml?.includes(DB_ACL_KEY)) pulumiConfigRm(e, s, DB_ACL_KEY);
    return undefined;
  });
  removeExposureOverlay(context.environment);

  const dsn = readPublicDsn(env, stack);
  if (dsn) {
    console.warn(
      `${warningMark} Public DSN output is still present — the endpoint may not have torn down. Re-run "Stop public DB exposure".`,
    );
  } else {
    console.info(`\n${checkMark} ${pc.bold('Public endpoint closed.')} The database is private-only again.`);
  }
  printRevokeReminder();
}
