import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { engineSecretPath } from '../lib/scaleway/secret-paths';

/** Secret Manager container name for the Pulumi passphrase. */
export const PASSPHRASE_SECRET_NAME = 'pulumi-passphrase';

export interface PassphraseCustodyOptions {
  /** A key that reads and writes secret values: the operator key or an Owner API key. The admin application key reads metadata only. */
  secretKey: string;
  region: string;
  projectId: string;
  slug: string;
  mode: string;
}

/**
 * The Pulumi passphrase as Secret Manager holds it, in the engine folder beside the admin key: outside every VM condition, readable by the
 * operator key, an Owner API key and the CI key, which holds the passphrase anyway. Undefined when the stack has none stored yet.
 */
export async function readCustodiedPassphrase(opts: PassphraseCustodyOptions): Promise<string | undefined> {
  const secrets = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId });
  const container = await secrets.getSecretByName(PASSPHRASE_SECRET_NAME, engineSecretPath(opts.slug, opts.mode));
  if (!container) return undefined;
  return (await secrets.accessLatestValue(container.id)) || undefined;
}

/** Store the passphrase as the latest version, disabling the one before: after a rotation only the new one is served. */
export async function storeCustodiedPassphrase(opts: PassphraseCustodyOptions & { passphrase: string }): Promise<void> {
  const secrets = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId });
  const container = await secrets.ensureSecret({
    name: PASSPHRASE_SECRET_NAME,
    path: engineSecretPath(opts.slug, opts.mode),
    description: 'Pulumi passphrase of this stack: the infra CLI reads it with the operator key, so nobody types it',
  });
  await secrets.putSecretValue({ secretId: container.id, value: opts.passphrase, description: 'Stored by infra cli', disablePrevious: true });
}
