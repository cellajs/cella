import { writeFile } from 'node:fs/promises';
import { actionCommand } from '../lib/operator-actions';
import { type IamAuth, listApiKeys, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import {
  type GenerationKeys,
  type MachinePrincipal,
  machineKeyName,
  machineKeyStep,
  machinePrincipals,
  standingAccessKey,
} from '../lib/scaleway/machine-keys';
import { createSecretManagerClient, type SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { DEPLOY_FOLDER } from '../lib/scaleway/secret-paths';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/** The Secret Manager calls the step makes, so a test passes its own. */
export interface DeployFolderReads {
  listSecretsUnder(root: string): Promise<SecretManagerSecret[]>;
  accessLatestValue(secretId: string): Promise<string>;
}

/** Why a principal's keys are not as made at the Owner moment, or undefined when they are: Update identities' own rule (`machineKeyStep`), said. */
export function standingKeyProblem(principal: MachinePrincipal, stored: string | undefined, live: readonly string[]): string | undefined {
  const step = machineKeyStep(principal, stored, live);
  if (step.change === 'make') {
    return stored
      ? `${principal.application}'s standing key ${stored} is no longer live`
      : `${principal.application} has no standing key in the deploy folder`;
  }
  return step.change === 'prune' ? `${principal.application} holds a key no machine is given: ${step.extra.join(', ')}` : undefined;
}

/**
 * Read this deploy's machine keys, writing nothing to Scaleway: first every machine identity is checked to hold exactly its standing key
 * (one that holds another key, or lost its standing one, stops the deploy, and **Update identities** repairs it), then each running service's
 * standing key is read from the deploy folder into `outFile`, which the deploy hands `pulumi up` as INFRA_GENERATION_KEYS_FILE.
 */
export async function readGenerationKeys(opts: {
  slug: string;
  mode: string;
  services: readonly string[];
  auth: IamAuth;
  secrets: DeployFolderReads;
  organizationId: string;
  outFile: string;
}): Promise<GenerationKeys> {
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

  const keys: GenerationKeys = {};
  for (const service of opts.services) {
    keys[service] = JSON.parse(await opts.secrets.accessLatestValue(stored.get(machineKeyName(service))?.id ?? ''));
  }
  await writeFile(opts.outFile, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

// Standalone entry point: the deploy key in SCW_SECRET_KEY, which reads IAM and the deploy folder.
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const outFile = getFlag(argv, '--out');
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID;
  const organizationId = getFlag(argv, '--organization-id') ?? process.env.SCW_DEFAULT_ORGANIZATION_ID;
  if (!secretKey || !outFile || !projectId || !organizationId) {
    throw new Error('Required: SCW_SECRET_KEY, --out, --project-id (or SCW_DEFAULT_PROJECT_ID), --organization-id (or SCW_DEFAULT_ORGANIZATION_ID)');
  }
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { runningServices } = await import('../lib/services');
  await readGenerationKeys({
    slug: appConfig.slug,
    mode: appConfig.mode,
    services: runningServices(appConfig.services).map((svc) => svc.slug),
    auth: { secretKey },
    secrets: createSecretManagerClient({ secretKey, region: appConfig.s3.region, projectId }),
    organizationId,
    outFile,
  });
}

runIfMain(import.meta.url, main);
