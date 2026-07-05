import { operatorManagedRuntimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets'
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager'

export interface SeedOperatorSecretsOptions {
  secretKey: string
  projectId: string
  region: string
  path: string
  /** Initial values keyed by runtime secret id (e.g. `adminEmail`). Empty/undefined entries are skipped. */
  values: Partial<Record<string, string>>
  log?: (message: string) => void
}

const defaultLog = (message: string) => console.info(message)

/**
 * Seed operator-managed runtime secrets with their first value during bootstrap.
 *
 * Pulumi already creates the empty containers (see resources/secrets.ts), so this
 * only writes an initial Version for the values the operator typed at the
 * prompt. Containers that already have a version are left untouched, so re-runs
 * never clobber a value set later via "Manage runtime secrets".
 */
export async function seedOperatorSecrets(options: SeedOperatorSecretsOptions): Promise<void> {
  const log = options.log ?? defaultLog
  const client = createSecretManagerClient({
    secretKey: options.secretKey,
    region: options.region,
    projectId: options.projectId,
  })

  for (const secret of operatorManagedRuntimeSecrets as RuntimeSecretDefinition[]) {
    const value = options.values[secret.id]
    if (!value) continue

    const existing = await client.getSecretByName(secret.secretName, options.path)
    if (existing?.version_count && existing.version_count > 0) {
      log(`skip ${secret.secretName}: already has ${existing.version_count} version(s)`)
      continue
    }

    const ensured = existing ?? await client.ensureSecret({
      name: secret.secretName,
      path: options.path,
      description: secret.description,
    })
    await client.putSecretValue({
      secretId: ensured.id,
      value,
      description: 'Seeded during bootstrap',
      disablePrevious: false,
    })
    log(`seed ${secret.secretName}`)
  }
}