import { uploadsKeySecrets } from '../lib/runtime-secrets';
import { createApiKey, deleteApiKey, type IamAuth, listApiKeys, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import { principalNames } from '../lib/scaleway/principals';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';

/** The Secret Manager calls the uploads key needs, so a test passes its own. */
export interface UploadsKeySecrets {
  getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined>;
  ensureSecret(input: { name: string; path: string; description: string }): Promise<SecretManagerSecret>;
  deleteSecret(secretId: string): Promise<void>;
  putSecretValue(input: { secretId: string; value: string; description?: string; disablePrevious?: boolean }): Promise<unknown>;
}

/** What the uploads key needs: nothing, a new key, or the removal of keys beside the stored one. */
export interface UploadsKeyStep {
  application: string;
  change: 'none' | 'make' | 'prune';
  /** Live keys of the application other than the stored one. */
  extra: string[];
}

const [accessHalf, secretHalf] = uploadsKeySecrets;

/** The access-half container's description: it names the access key, which is no secret, so the plan compares it with IAM from metadata alone. */
function storedKeyDescription(accessKey: string): string {
  return `Uploads key: ${accessKey}`;
}

/** The access key a container's description names; undefined for any other description. */
function storedAccessKey(description: string | null | undefined): string | undefined {
  return description?.match(/: (SCW[A-Z0-9]+)$/)?.[1];
}

/**
 * The uploads key against what IAM holds, from metadata only: `make` when no key is stored in the runtime folder or the stored one is no
 * longer live, `prune` when the application holds keys beside it, `none` otherwise. Any key that reads IAM and secret metadata computes it.
 */
export async function planUploadsKey(opts: {
  auth: IamAuth;
  secrets: Pick<UploadsKeySecrets, 'getSecretByName'>;
  organizationId: string;
  slug: string;
  mode: string;
}): Promise<UploadsKeyStep> {
  const application = principalNames(opts.slug, opts.mode).uploads;
  const container = await opts.secrets.getSecretByName(accessHalf.secretName, RUNTIME_FOLDER);
  const stored = (container?.version_count ?? 0) > 0 ? storedAccessKey(container?.description) : undefined;
  const applicationId = await resolveApplicationIdByName(opts.auth, opts.organizationId, application);
  const live = applicationId ? (await listApiKeys(opts.auth, opts.organizationId, applicationId)).map((key) => key.access_key) : [];
  const extra = live.filter((accessKey) => accessKey !== stored);
  if (!stored || !live.includes(stored)) return { application, change: 'make', extra };
  return { application, change: extra.length > 0 ? 'prune' : 'none', extra };
}

/**
 * Carry out the step at an Owner moment. `make`: a new key for the uploads application, its two halves written into the runtime folder, then
 * every other key of the application deleted, so the machines that booted with the old one fail to sign until the deploy that follows.
 * `prune`: the keys beside the stored one deleted.
 */
export async function writeUploadsKey(opts: {
  auth: IamAuth;
  secrets: UploadsKeySecrets;
  organizationId: string;
  projectId: string;
  step: UploadsKeyStep;
  log?: (message: string) => void;
}): Promise<void> {
  const log = opts.log ?? ((message) => console.info(message));
  const { step } = opts;
  if (step.change === 'none') return;
  const applicationId = await resolveApplicationIdByName(opts.auth, opts.organizationId, step.application);
  if (!applicationId) throw new Error(`uploads key: IAM application '${step.application}' does not exist`);
  let keep: string | undefined;
  if (step.change === 'make') {
    const key = await createApiKey(opts.auth, { applicationId, description: 'Uploads key', defaultProjectId: opts.projectId });
    // The access half's container is made anew, as its description names the key.
    const old = await opts.secrets.getSecretByName(accessHalf.secretName, RUNTIME_FOLDER);
    if (old) await opts.secrets.deleteSecret(old.id);
    const halves = [
      { half: accessHalf, value: key.access_key, description: storedKeyDescription(key.access_key) },
      { half: secretHalf, value: key.secret_key, description: 'Secret half of the uploads key' },
    ];
    for (const { half, value, description } of halves) {
      const container =
        (await opts.secrets.getSecretByName(half.secretName, RUNTIME_FOLDER)) ??
        (await opts.secrets.ensureSecret({ name: half.secretName, path: RUNTIME_FOLDER, description }));
      await opts.secrets.putSecretValue({ secretId: container.id, value, description: 'Made at an Owner moment', disablePrevious: true });
    }
    keep = key.access_key;
    log(`  ✎ uploads key of ${step.application}: ${key.access_key}`);
  }
  for (const accessKey of (await listApiKeys(opts.auth, opts.organizationId, applicationId)).map((key) => key.access_key)) {
    if (accessKey === keep || (step.change === 'prune' && !step.extra.includes(accessKey))) continue;
    await deleteApiKey(opts.auth, accessKey);
    log(`  ~ deleted ${step.application} key ${accessKey}`);
  }
}
