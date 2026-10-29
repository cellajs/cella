import type { ManagedKeyDefinition, MintedKeyField } from '../lib/managed-keys';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import { provisionScopedKey } from '../lib/scaleway/scaleway-iam';
import { createSecretManagerClient, type SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { existingContainers, missingCopies, putEveryCopy, secretCopyContainers } from '../lib/scaleway/secret-copies';
import { checkMark } from '../lib/utils/cli-output';

export interface ProvisionManagedKeyOptions {
  /** The managed key to mint (from `managedKeys`). */
  definition: ManagedKeyDefinition;
  /** IAM-capable caller key: needs IAMManager to create the app/policy + key. */
  callerSecretKey: string;
  organizationId: string;
  projectId: string;
  region: string;
  slug: string;
  /** Deploy mode: per-mode app naming and grouping. */
  mode: string;
  log?: (message: string) => void;
}

export interface ProvisionManagedKeyResult {
  /** The `<slug>-<suffix>` IAM application the key belongs to. */
  applicationId: string;
  /** secretName → written revision, one per assigned half. */
  seeded: Record<string, number>;
}

const defaultLog = (message: string) => console.info(message);

function runtimeSecretById(id: string): RuntimeSecretDefinition {
  const secret = runtimeSecrets.find((entry) => entry.id === id);
  // managed-keys.ts validates every assign target at load time, so this is a
  // config-drift guard, not an expected runtime path.
  if (!secret) throw new Error(`provision-managed-key: unknown runtime secret id '${id}' (managed-keys.config drift).`);
  return secret;
}

/**
 * Mints or rotates a scoped IAM key into Pulumi-owned runtime-secret containers.
 * Every target is verified before key creation, avoiding orphan keys and out-of-band
 * containers. New versions disable prior values; the named IAM application is reused.
 */
export async function provisionManagedKey(opts: ProvisionManagedKeyOptions): Promise<ProvisionManagedKeyResult> {
  const { definition } = opts;
  const log = opts.log ?? defaultLog;
  const client = createSecretManagerClient({ secretKey: opts.callerSecretKey, region: opts.region, projectId: opts.projectId });

  const targets = (Object.entries(definition.assign) as [MintedKeyField, string][]).map(([field, secretId]) => ({
    field,
    secret: runtimeSecretById(secretId),
  }));

  // Resolve + verify every target container up front. Minting an IAM key is a
  // side effect we cannot cheaply undo, so bail before minting if a container is
  // missing so a live key is never leaked.
  const containersBySecretName = new Map<string, SecretManagerSecret[]>();
  for (const { secret } of targets) {
    const copies = await secretCopyContainers(client, secret);
    const missing = missingCopies(copies);
    if (missing.length > 0) {
      throw new Error(
        `${secret.secretName} (${secret.envVar}) has no container yet for ${missing.join(', ')}: run \`pulumi up\` so Pulumi creates it, then provision the ${definition.label} key.`,
      );
    }
    containersBySecretName.set(secret.secretName, existingContainers(copies));
  }

  const minted = await provisionScopedKey(
    { callerSecretKey: opts.callerSecretKey, organizationId: opts.organizationId, projectId: opts.projectId, slug: opts.slug, mode: opts.mode, log },
    {
      suffix: definition.suffix,
      appDescription: definition.appDescription,
      policyDescription: definition.policyDescription,
      buildRules: ({ projectId }) => [{ permission_set_names: [...definition.permissionSets], project_ids: [projectId] }],
    },
  );

  const seeded: Record<string, number> = {};
  for (const { field, secret } of targets) {
    const value = field === 'accessKey' ? minted.accessKey : minted.secretKey;
    const revisions = await putEveryCopy(client, containersBySecretName.get(secret.secretName) ?? [], value, {
      description: `Minted by infra CLI (${definition.suffix})`,
      disablePrevious: true,
    });
    const revision = Math.max(...revisions);
    seeded[secret.secretName] = revision;
    log(
      `  ${checkMark} Wrote ${secret.secretName} (${secret.envVar}) to ${revisions.length} cop${revisions.length === 1 ? 'y' : 'ies'} → revision ${revision}`,
    );
  }

  return { applicationId: minted.applicationId, seeded };
}
