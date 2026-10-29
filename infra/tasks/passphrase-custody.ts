import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { ENGINE_FOLDER } from '../lib/scaleway/secret-paths';
import { verifyStackPassphrase } from '../lib/stack/pulumi-passphrase';

/** Secret Manager container name for the Pulumi passphrase. */
export const PASSPHRASE_SECRET_NAME = 'pulumi-passphrase';

/**
 * Secret Manager container name for the stack's `encryptionsalt`, kept beside the passphrase it verifies against. The main job writes it into
 * the target's stack file, so a deploy of any commit, an older release's too, decrypts the state whatever salt that commit's file holds.
 */
export const ENCRYPTION_SALT_SECRET_NAME = 'pulumi-encryption-salt';

/** The stack file's `encryptionsalt` when it verifies against the passphrase; undefined otherwise. */
export function verifiedSalt(stackYaml: string | undefined, passphrase: string): string | undefined {
  const salt = stackYaml?.match(/^encryptionsalt:\s*(\S+)/m)?.[1];
  return salt && stackYaml && verifyStackPassphrase(stackYaml, passphrase) ? salt : undefined;
}

export interface PassphraseCustodyOptions {
  /** A key that reads and writes secret values: the operator key or an Owner API key. */
  secretKey: string;
  region: string;
  projectId: string;
}

/**
 * The Pulumi passphrase as Secret Manager holds it, in the engine folder: outside every VM condition, readable by the operator key and an
 * Owner API key; the main job reads it by reference. Undefined when the stack has none stored yet.
 */
export async function readCustodiedPassphrase(opts: PassphraseCustodyOptions): Promise<string | undefined> {
  const secrets = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId });
  const container = await secrets.getSecretByName(PASSPHRASE_SECRET_NAME, ENGINE_FOLDER);
  if (!container) return undefined;
  return (await secrets.accessLatestValue(container.id)) || undefined;
}

/**
 * Store the passphrase as the latest version, disabling the one before: after a rotation only the new one is served. The stack file's salt
 * goes beside it when it verifies against that passphrase.
 */
export async function storeCustodiedPassphrase(opts: PassphraseCustodyOptions & { passphrase: string; stackYaml?: string }): Promise<void> {
  const secrets = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId });
  const container = await secrets.ensureSecret({
    name: PASSPHRASE_SECRET_NAME,
    path: ENGINE_FOLDER,
    description: 'Pulumi passphrase of this stack: the infra CLI reads it with the operator key, so nobody types it',
  });
  await secrets.putSecretValue({ secretId: container.id, value: opts.passphrase, description: 'Stored by infra cli', disablePrevious: true });
  const salt = verifiedSalt(opts.stackYaml, opts.passphrase);
  if (salt) await storeSalt(secrets, salt);
}

/** Store the stack's salt beside a custodied passphrase when none is stored yet: how a stack set up before the copy existed gets one. */
export async function ensureCustodiedSalt(opts: PassphraseCustodyOptions & { passphrase: string; stackYaml?: string }): Promise<void> {
  const salt = verifiedSalt(opts.stackYaml, opts.passphrase);
  if (!salt) return;
  const secrets = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId });
  const stored = await secrets.getSecretByName(ENCRYPTION_SALT_SECRET_NAME, ENGINE_FOLDER);
  if (!stored?.version_count) await storeSalt(secrets, salt);
}

async function storeSalt(secrets: ReturnType<typeof createSecretManagerClient>, salt: string): Promise<void> {
  const container = await secrets.ensureSecret({
    name: ENCRYPTION_SALT_SECRET_NAME,
    path: ENGINE_FOLDER,
    description: "The stack's encryptionsalt, beside its passphrase: the main job writes it into the target's stack file",
  });
  await secrets.putSecretValue({ secretId: container.id, value: salt, description: 'Stored by infra cli', disablePrevious: true });
}
