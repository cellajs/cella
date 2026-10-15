import { operatorManagedRuntimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { secretCopies } from '../lib/scaleway/secret-paths';
import { isEnvFileDeliverable } from '../lib/utils/env-file';

export interface SeedOperatorSecretsOptions {
  secretKey: string;
  projectId: string;
  region: string;
  slug: string;
  mode: string;
  /** Initial values keyed by runtime secret id (e.g. `adminEmail`). Empty/undefined entries are skipped. */
  values: Partial<Record<string, string>>;
  log?: (message: string) => void;
}

const defaultLog = (message: string) => console.info(message);

/**
 * Seed operator-managed runtime secrets with their first value during setup.
 *
 * Pulumi already creates the empty containers, so this only writes an initial
 * Version for the values the operator typed at the prompt. Containers that already
 * have a version are left untouched, so re-runs never clobber a value set later
 * via "Manage runtime secrets".
 *
 * @see resources/secrets.ts
 */
export async function seedOperatorSecrets(options: SeedOperatorSecretsOptions): Promise<void> {
  const log = options.log ?? defaultLog;
  const client = createSecretManagerClient({ secretKey: options.secretKey, region: options.region, projectId: options.projectId });

  for (const secret of operatorManagedRuntimeSecrets as RuntimeSecretDefinition[]) {
    const value = options.values[secret.id];
    if (!value) continue;
    if (!isEnvFileDeliverable(value).ok)
      throw new Error(`${secret.secretName}: one line only; the deploy checks presence, so the form is checked here`);

    // One copy per consumer: each is seeded alike, and one that has a value already is left alone.
    for (const { service, path } of secretCopies(secret, options.slug, options.mode)) {
      const existing = await client.getSecretByName(secret.secretName, path);
      if (existing?.version_count && existing.version_count > 0) {
        log(`skip ${secret.secretName} for ${service}: already has ${existing.version_count} version(s)`);
        continue;
      }
      const ensured = existing ?? (await client.ensureSecret({ name: secret.secretName, path, description: secret.description }));
      await client.putSecretValue({ secretId: ensured.id, value, description: 'Seeded during setup', disablePrevious: false });
      log(`seed ${secret.secretName} for ${service}`);
    }
  }
}
