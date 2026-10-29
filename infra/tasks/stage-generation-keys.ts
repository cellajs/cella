import { writeFile } from 'node:fs/promises';
import { actionCommand } from '../lib/operator-actions';
import { type IamAuth, listApiKeys, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import {
  handoffBundleKey,
  type MachinePrincipal,
  machineKeyName,
  machineKeyStep,
  machinePrincipals,
  standingAccessKey,
} from '../lib/scaleway/machine-keys';
import { createSecretManagerClient, type SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { DEPLOY_FOLDER, handoffServicePath } from '../lib/scaleway/secret-paths';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';

export interface GenerationKeys {
  /** Boot fetcher key pair, baked into every generation's cloud-init. */
  bootAccessKey: string;
  bootSecretKey: string;
  /** `handoffBundleKey(service, sha)` → single-access handoff secret id holding that service's standing key. */
  handoffSecretIds: Record<string, string>;
}

/** The Secret Manager calls the stage needs, so a test passes its own. */
export interface StageSecrets {
  listSecretsUnder(root: string): Promise<SecretManagerSecret[]>;
  accessLatestValue(secretId: string): Promise<string>;
  ensureSecret(input: {
    name: string;
    path: string;
    description?: string;
    ephemeralPolicy?: { expires_once_accessed: boolean; action: 'disable' | 'delete' };
  }): Promise<SecretManagerSecret>;
  putSecretValue(input: { secretId: string; value: string; description?: string }): Promise<unknown>;
  deleteSecret(secretId: string): Promise<void>;
}

/** Why a principal's keys are not as made at the Owner moment, or undefined when they are: Update identities' own rule (`machineKeyStep`), said. */
export function standingKeyProblem(principal: MachinePrincipal, stored: string | undefined, live: readonly string[]): string | undefined {
  const step = machineKeyStep(principal, stored, live);
  if (step.change === 'make') {
    return stored
      ? `${principal.application}'s standing key ${stored} is no longer live`
      : `${principal.application} has no standing key in the deploy folder`;
  }
  return step.change === 'prune' ? `${principal.application} holds a key nobody hands over: ${step.extra.join(', ')}` : undefined;
}

/**
 * Put one principal's standing key into a SINGLE-ACCESS bundle under `/handoff/<principal>/`, which the machine it is for reads once; an unread
 * bundle of an earlier deploy is pruned first, as the machine it was for never booted. Returns the bundle's secret id.
 */
export async function stageHandoffBundle(opts: {
  sha: string;
  principal: string;
  /** The principal's key; the builder's carries the repository read key too, for a private repository (D19). */
  key: { accessKey: string; secretKey: string; repositoryKey?: string };
  secrets: Pick<StageSecrets, 'listSecretsUnder' | 'ensureSecret' | 'putSecretValue' | 'deleteSecret'>;
  log: (message: string) => void;
}): Promise<string> {
  const handoffFolder = handoffServicePath(opts.principal);
  for (const stale of await opts.secrets.listSecretsUnder(handoffFolder)) {
    await opts.secrets.deleteSecret(stale.id);
    opts.log(`  ~ pruned stale handoff bundle ${stale.name}`);
  }
  const bundle = await opts.secrets.ensureSecret({
    name: `handoff-${opts.principal}-${opts.sha.slice(0, 10)}`,
    path: handoffFolder,
    description: `Single-access key handoff for ${opts.principal} gen ${opts.sha.slice(0, 10)} (read once by the booting machine)`,
    ephemeralPolicy: { expires_once_accessed: true, action: 'disable' },
  });
  await opts.secrets.putSecretValue({ secretId: bundle.id, value: JSON.stringify(opts.key), description: 'Staged by stage-generation-keys' });
  opts.log(`✓ staged handoff bundle for ${opts.principal} (${bundle.id})`);
  return bundle.id;
}

/** A principal's standing key, read from the deploy folder. */
export async function readStandingKey(
  secrets: Pick<StageSecrets, 'listSecretsUnder' | 'accessLatestValue'>,
  principal: string,
): Promise<{ accessKey: string; secretKey: string }> {
  const container = (await secrets.listSecretsUnder(DEPLOY_FOLDER)).find(
    (secret) => secret.name === machineKeyName(principal) && (secret.version_count ?? 0) > 0,
  );
  if (!container) throw new Error(`no standing key for ${principal} in the deploy folder: \`${actionCommand('identity')}\` makes it`);
  return JSON.parse(await secrets.accessLatestValue(container.id)) as { accessKey: string; secretKey: string };
}

/**
 * Stage this deploy's machine keys without calling IAM to write anything: each running service's standing key, read from the deploy folder,
 * goes into a SINGLE-ACCESS hand-over bundle under `/handoff/<service>/`, which a booting machine reads once (a failed read halts it as an
 * interception signal); the boot key goes into the keys file for cloud-init. First every machine identity is checked to hold exactly its
 * standing key: one that holds another key, or lost its standing one, stops the deploy, and **Update identities** repairs it. The result
 * JSON goes to `outFile`, which the deploy passes to `pulumi up` via INFRA_GENERATION_KEYS_FILE.
 */
export async function stageGenerationKeys(opts: {
  slug: string;
  mode: string;
  sha: string;
  /** Running service slugs: the ones whose keys are handed over. */
  services: readonly string[];
  auth: IamAuth;
  secrets: StageSecrets;
  organizationId: string;
  outFile: string;
  log?: (message: string) => void;
}): Promise<GenerationKeys> {
  const log = opts.log ?? ((message: string) => console.info(message));
  const stored = new Map(
    (await opts.secrets.listSecretsUnder(DEPLOY_FOLDER)).filter((secret) => (secret.version_count ?? 0) > 0).map((secret) => [secret.name, secret]),
  );

  const problems: string[] = [];
  for (const principal of machinePrincipals(opts.slug, opts.mode)) {
    const applicationId = await resolveApplicationIdByName(opts.auth, opts.organizationId, principal.application);
    const live = applicationId ? (await listApiKeys(opts.auth, opts.organizationId, applicationId)).map((key) => key.access_key) : [];
    const problem = standingKeyProblem(principal, standingAccessKey(stored.get(machineKeyName(principal.principal))?.description), live);
    if (problem) problems.push(problem);
  }
  if (problems.length > 0) {
    throw new Error(`machine keys are not as made at the last Owner moment: ${problems.join('; ')}. \`${actionCommand('identity')}\` repairs them.`);
  }

  const read = async (principal: string): Promise<{ accessKey: string; secretKey: string }> => {
    const container = stored.get(machineKeyName(principal));
    if (!container) throw new Error(`stage-generation-keys: no standing key for ${principal}`);
    return JSON.parse(await opts.secrets.accessLatestValue(container.id)) as { accessKey: string; secretKey: string };
  };

  const boot = await read('boot');
  const handoffSecretIds: Record<string, string> = {};
  for (const service of opts.services) {
    handoffSecretIds[handoffBundleKey(service, opts.sha)] = await stageHandoffBundle({ ...opts, principal: service, key: await read(service), log });
  }

  const result: GenerationKeys = { bootAccessKey: boot.accessKey, bootSecretKey: boot.secretKey, handoffSecretIds };
  await writeFile(opts.outFile, JSON.stringify(result), { mode: 0o600 });
  return result;
}

// Standalone entry point: the deploy key in SCW_SECRET_KEY, which reads IAM and the deploy folder.
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const sha = getFlag(argv, '--sha');
  const outFile = getFlag(argv, '--out');
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID;
  const organizationId = getFlag(argv, '--organization-id') ?? process.env.SCW_DEFAULT_ORGANIZATION_ID;
  if (!secretKey || !sha || !outFile || !projectId || !organizationId) {
    throw new Error(
      'Required: SCW_SECRET_KEY, --sha, --out, --project-id (or SCW_DEFAULT_PROJECT_ID), --organization-id (or SCW_DEFAULT_ORGANIZATION_ID)',
    );
  }
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { runningServices } = await import('../lib/services');
  await stageGenerationKeys({
    slug: appConfig.slug,
    mode: appConfig.mode,
    sha,
    services: runningServices(appConfig.services).map((svc) => svc.slug),
    auth: { secretKey },
    secrets: createSecretManagerClient({ secretKey, region: appConfig.s3.region, projectId }),
    organizationId,
    outFile,
  });
}

runIfMain(import.meta.url, main);
