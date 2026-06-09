import { operatorManagedRuntimeSecrets, type RuntimeSecretDefinition } from '../src/runtime-secrets.js'
import { createSecretManagerClient } from '../src/scaleway-secret-manager.js'

export interface MigrateRuntimeSecretsOptions {
  secretKey: string
  projectId: string
  region: string
  path: string
  valuesByLegacyKey: Record<string, string | undefined>
  log?: (message: string) => void
}

const defaultLog = (message: string) => console.info(message)

export async function migrateRuntimeSecrets(options: MigrateRuntimeSecretsOptions): Promise<void> {
  const log = options.log ?? defaultLog
  const client = createSecretManagerClient({
    secretKey: options.secretKey,
    region: options.region,
    projectId: options.projectId,
  })

  for (const secret of operatorManagedRuntimeSecrets as RuntimeSecretDefinition[]) {
    const legacyKey = secret.legacyStackConfigKey
    if (!legacyKey) continue
    const value = options.valuesByLegacyKey[legacyKey]
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
      description: 'Seeded from legacy Pulumi stack config',
      disablePrevious: false,
    })
    log(`seed ${secret.secretName} from ${legacyKey}`)
  }
}