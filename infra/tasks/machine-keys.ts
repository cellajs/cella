import { createApiKey, deleteApiKey, type IamAuth, listApiKeys, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import {
  type MachineKeyStep,
  machineKeyDescription,
  machineKeyName,
  machineKeyStep,
  machinePrincipals,
  standingAccessKey,
} from '../lib/scaleway/machine-keys';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { DEPLOY_FOLDER } from '../lib/scaleway/secret-paths';
import { assertSecretsUnprefixed } from './move-secret-paths';

/** The Secret Manager calls the standing keys need, so a test passes its own. */
export interface MachineKeySecrets {
  listSecrets(): Promise<SecretManagerSecret[]>;
  listSecretsUnder(root: string): Promise<SecretManagerSecret[]>;
  getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined>;
  ensureSecret(input: { name: string; path: string; description?: string }): Promise<SecretManagerSecret>;
  putSecretValue(input: { secretId: string; value: string; description?: string }): Promise<unknown>;
  deleteSecret(secretId: string): Promise<void>;
}

/**
 * The standing key of every machine identity against what IAM holds, read from metadata only: the container in the deploy folder names its
 * access key, and IAM lists the application's keys. Any key that reads IAM and Secret Manager metadata computes it, the observer's included.
 * @throws while the environment's secrets sit under its `/<slug>-<mode>/` prefix, where the plan would find no standing key and make each anew
 */
export async function planMachineKeys(opts: {
  auth: IamAuth;
  secrets: Pick<MachineKeySecrets, 'listSecrets' | 'listSecretsUnder'>;
  organizationId: string;
  slug: string;
  mode: string;
}): Promise<MachineKeyStep[]> {
  await assertSecretsUnprefixed(opts.secrets, opts.slug, opts.mode);
  const stored = await opts.secrets.listSecretsUnder(DEPLOY_FOLDER);
  const steps: MachineKeyStep[] = [];
  for (const principal of machinePrincipals(opts.slug, opts.mode)) {
    const container = stored.find((secret) => secret.name === machineKeyName(principal.principal) && (secret.version_count ?? 0) > 0);
    const applicationId = await resolveApplicationIdByName(opts.auth, opts.organizationId, principal.application);
    const live = applicationId ? (await listApiKeys(opts.auth, opts.organizationId, applicationId)).map((key) => key.access_key) : [];
    steps.push(machineKeyStep(principal, standingAccessKey(container?.description), live));
  }
  return steps;
}

/**
 * Carry out the steps at an Owner moment. `make`: a new key for the application, stored in the deploy folder (the container replaced, so
 * its description names the new access key), then every other key of the application deleted. `prune`: the keys beside the standing one
 * deleted. A machine that booted with a deleted key keeps running until the next deploy replaces it; a reboot before that cannot hydrate.
 */
export async function writeMachineKeys(opts: {
  auth: IamAuth;
  secrets: MachineKeySecrets;
  organizationId: string;
  projectId: string;
  slug: string;
  mode: string;
  steps: readonly MachineKeyStep[];
  log?: (message: string) => void;
}): Promise<void> {
  const log = opts.log ?? ((message) => console.info(message));
  for (const step of opts.steps) {
    if (step.change === 'none') continue;
    const applicationId = await resolveApplicationIdByName(opts.auth, opts.organizationId, step.application);
    if (!applicationId) throw new Error(`machine keys: IAM application '${step.application}' does not exist`);
    let keep: string | undefined;
    if (step.change === 'make') {
      const key = await createApiKey(opts.auth, { applicationId, description: 'Standing machine key', defaultProjectId: opts.projectId });
      const name = machineKeyName(step.principal);
      const old = await opts.secrets.getSecretByName(name, DEPLOY_FOLDER);
      if (old) await opts.secrets.deleteSecret(old.id);
      const container = await opts.secrets.ensureSecret({
        name,
        path: DEPLOY_FOLDER,
        description: machineKeyDescription(step.application, key.access_key),
      });
      await opts.secrets.putSecretValue({
        secretId: container.id,
        value: JSON.stringify({ accessKey: key.access_key, secretKey: key.secret_key }),
        description: 'Made at an Owner moment',
      });
      keep = key.access_key;
      log(`  ✎ standing key of ${step.application}: ${key.access_key}`);
    }
    for (const accessKey of (await listApiKeys(opts.auth, opts.organizationId, applicationId)).map((key) => key.access_key)) {
      if (accessKey === keep || (step.change === 'prune' && !step.extra.includes(accessKey))) continue;
      await deleteApiKey(opts.auth, accessKey);
      log(`  ~ deleted ${step.application} key ${accessKey}`);
    }
  }
}
