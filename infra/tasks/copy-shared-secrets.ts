import { engineMadeRuntimeSecrets, operatorManagedRuntimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { type CopyContainer, secretCopyContainers } from '../lib/scaleway/secret-copies';
import { legacySharedSecretPath } from '../lib/scaleway/secret-paths';

/** The Secret Manager calls the copy needs, so a test passes its own. */
export interface CopySharedClient {
  getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined>;
  accessLatestValue(secretId: string): Promise<string>;
  putSecretValue(input: { secretId: string; value: string; description?: string; disablePrevious?: boolean }): Promise<{ revision: number }>;
  deleteSecret(secretId: string): Promise<void>;
}

/** What to do with one secret's shared container: the copies to fill with its value, and whether it can go. */
export function copyStep(
  legacy: SecretManagerSecret | undefined,
  copies: readonly CopyContainer[],
): { fill: SecretManagerSecret[]; remove: boolean } | undefined {
  if (!legacy) return undefined;
  // The `pulumi up` makes the copies; until every one exists, the shared container is the only place the value lives.
  if (copies.some((copy) => !copy.container)) return { fill: [], remove: false };
  const hasValue = (legacy.version_count ?? 0) > 0;
  const fill = hasValue ? copies.flatMap((copy) => (copy.container && (copy.container.version_count ?? 0) === 0 ? [copy.container] : [])) : [];
  return { fill, remove: true };
}

/**
 * Move the values of secrets that several services consume out of the shared folder each lived in, into the copy of every consumer: the
 * operator's, and the engine-made ones of a stack set up before 3a·1, whose shared container forget-retired-resources keeps live. A copy
 * that has a value already keeps it. The shared container is deleted once every copy exists, as the `pulumi up` keeps it (operator values
 * outlive a registry change). Runs after each `up` until no stack has a shared folder left (ledger L3). Returns the secrets moved.
 */
export async function copySharedSecrets(opts: {
  client: CopySharedClient;
  slug: string;
  mode: string;
  secrets?: readonly RuntimeSecretDefinition[];
  log?: (message: string) => void;
}): Promise<string[]> {
  const log = opts.log ?? ((message) => console.info(message));
  const moved: string[] = [];
  for (const secret of (opts.secrets ?? [...operatorManagedRuntimeSecrets, ...engineMadeRuntimeSecrets()]).filter(
    (definition) => definition.services.length > 1,
  )) {
    const legacyPath = legacySharedSecretPath(opts.slug, opts.mode, secret.services);
    const legacy = await opts.client.getSecretByName(secret.secretName, legacyPath);
    const step = copyStep(legacy, legacy ? await secretCopyContainers(opts.client, secret, opts.slug, opts.mode) : []);
    if (!legacy || !step) continue;
    if (!step.remove) {
      log(`[copy-shared-secrets] ${secret.secretName}: a copy has no container yet; the shared one stays until the next run`);
      continue;
    }
    if (step.fill.length > 0) {
      const value = await opts.client.accessLatestValue(legacy.id);
      for (const container of step.fill) {
        await opts.client.putSecretValue({ secretId: container.id, value, description: `Copied from ${legacyPath}`, disablePrevious: false });
      }
    }
    await opts.client.deleteSecret(legacy.id);
    log(
      `[copy-shared-secrets] ${secret.secretName}: ${step.fill.length} cop${step.fill.length === 1 ? 'y' : 'ies'} filled from ${legacyPath}, which is gone now`,
    );
    moved.push(secret.secretName);
  }
  return moved;
}
