import { checkMark } from 'shared/utils/console'
import type { ManagedKeyDefinition, MintedKeyField } from '../lib/managed-keys'
import { runtimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets'
import { provisionScopedKey } from '../lib/scaleway/scaleway-iam'
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager'

export interface ProvisionManagedKeyOptions {
  /** The managed key to mint (from `managedKeys`). */
  definition: ManagedKeyDefinition
  /** IAM-capable caller key: needs IAMManager to create the app/policy + key. */
  callerSecretKey: string
  projectId: string
  region: string
  slug: string
  /** Secret Manager folder, e.g. `/cella-production/`. */
  path: string
  log?: (message: string) => void
}

export interface ProvisionManagedKeyResult {
  /** The `<slug>-<suffix>` IAM application the key belongs to. */
  applicationId: string
  /** secretName → written revision, one per assigned half. */
  seeded: Record<string, number>
}

const defaultLog = (message: string) => console.info(message)

function runtimeSecretById(id: string): RuntimeSecretDefinition {
  const secret = runtimeSecrets.find((entry) => entry.id === id)
  // managed-keys.ts validates every assign target at load time, so this is a
  // config-drift guard, not an expected runtime path.
  if (!secret) throw new Error(`provision-managed-key: unknown runtime secret id '${id}' (managed-keys.config drift).`)
  return secret
}

/**
 * Mints or rotates a scoped IAM key into Pulumi-owned runtime-secret containers.
 * Every target is verified before key creation, avoiding orphan credentials and out-of-band
 * containers. New versions disable prior values; the named IAM application is reused.
 */
export async function provisionManagedKey(opts: ProvisionManagedKeyOptions): Promise<ProvisionManagedKeyResult> {
  const { definition } = opts
  const log = opts.log ?? defaultLog
  const client = createSecretManagerClient({ secretKey: opts.callerSecretKey, region: opts.region, projectId: opts.projectId })

  const targets = (Object.entries(definition.assign) as [MintedKeyField, string][]).map(([field, secretId]) => ({
    field,
    secret: runtimeSecretById(secretId),
  }))

  // Resolve + verify every target container up front. Minting an IAM key is a
  // side effect we cannot cheaply undo, so bail before minting if a container is
  // missing so a live key is never leaked.
  const containerBySecretName = new Map<string, { id: string }>()
  for (const { secret } of targets) {
    const container = await client.getSecretByName(secret.secretName, opts.path)
    if (!container) {
      throw new Error(
        `${secret.secretName} (${secret.envVar}) has no container yet — run \`pulumi up\` so Pulumi creates it, then provision the ${definition.label} key.`,
      )
    }
    containerBySecretName.set(secret.secretName, container)
  }

  const minted = await provisionScopedKey(
    { callerSecretKey: opts.callerSecretKey, projectId: opts.projectId, slug: opts.slug, log },
    {
      suffix: definition.suffix,
      appDescription: definition.appDescription,
      policyDescription: definition.policyDescription,
      buildRules: ({ projectId }) => [{ permission_set_names: [...definition.permissionSets], project_ids: [projectId] }],
      mintKey: true,
    },
  )

  const seeded: Record<string, number> = {}
  for (const { field, secret } of targets) {
    const value = field === 'accessKey' ? minted.accessKey : minted.secretKey
    // biome-ignore lint/style/noNonNullAssertion: populated in the verify loop above.
    const container = containerBySecretName.get(secret.secretName)!
    const version = await client.putSecretValue({
      secretId: container.id,
      value,
      description: `Minted by infra CLI (${definition.suffix})`,
      disablePrevious: true,
    })
    seeded[secret.secretName] = version.revision
    log(`  ${checkMark} Wrote ${secret.secretName} (${secret.envVar}) → revision ${version.revision}`)
  }

  return { applicationId: minted.applicationId, seeded }
}
