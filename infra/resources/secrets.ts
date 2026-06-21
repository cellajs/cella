/**
 * Secrets — registry-driven runtime secret containers in Scaleway Secret Manager.
 *
 * Pulumi provisions the secret containers for every runtime secret in the central
 * registry. Values are only written by Pulumi for secrets marked `valueSource:
 * 'pulumi'`; operator-managed secrets are created as empty containers and filled
 * later via the bootstrap secret-management flow.
 */
import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tags, mode, infraConfig } from '../pulumi-context'
import { runtimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets'
import { connectionStringAdmin, connectionStringRuntime, connectionStringCdc, caCertificate } from './database'

/** Folder path for secret organization, e.g. '/cella-production/' */
const secretPath = `/${naming.slug}-${mode}/`

// ---------------------------------------------------------------------------
// Helper — create a Secret container, optionally with a Version
// ---------------------------------------------------------------------------

function createSecretContainer(
  name: string,
  description: string,
) {
  return new scaleway.secrets.Secret(`secret-${name}`, {
    name,
    path: secretPath,
    description,
    region,
    tags,
  }, { aliases: [{ type: 'scaleway:index/secret:Secret' }] })
}

function getExistingSecretContainer(name: string) {
  return scaleway.secrets.getSecretOutput({
    name,
    path: secretPath,
    region,
  })
}

function createSecretVersion(
  name: string,
  secretId: pulumi.Input<string>,
  data: pulumi.Input<string>,
) {
  return new scaleway.secrets.Version(`secret-version-${name}`, {
    secretId,
    data,
    region,
  }, { aliases: [{ type: 'scaleway:index/secretVersion:SecretVersion' }] })
}

function pulumiOwnedRuntimeSecret(configKey: string, name: string) {
  const configured = infraConfig.getSecret(configKey)
  if (configured) return configured
  return new random.RandomPassword(`generated-${name}`, {
    length: 32,
    special: true,
    overrideSpecial: '-_.~',
    minLower: 2,
    minUpper: 2,
    minNumeric: 2,
    minSpecial: 2,
  }).result
}

/**
 * Pulumi-derived secret values that cannot be produced generically from the
 * registry — the database connection strings (built from database resources) and
 * the database CA certificate (the RDB instance's own cert). Every other
 * `valueSource: 'pulumi'` secret is resolved from its registry definition
 * (`generation: 'random'` → a stable RandomPassword named after its
 * `secretName`), so adding a new pulumi-owned random secret requires no edit
 * here — only a registry entry.
 */
const derivedRuntimeSecretData: Record<string, pulumi.Input<string>> = {
  databaseUrlAdmin: connectionStringAdmin,
  databaseUrlRuntime: connectionStringRuntime,
  databaseUrlCdc: connectionStringCdc,
  // The RDB CA is a multi-line PEM. Runtime secrets are delivered to VMs via
  // `.env.runtime` (a docker-compose env_file), which is line-based and rejects
  // multi-line values — a multi-line secret fails the boot agent's runtime-secret
  // hydration and blocks the app from booting. Store it base64-encoded (single
  // line); the app db clients decode it back to PEM. See backend/src/db/db.ts.
  databaseSslCa: pulumi.output(caCertificate).apply((pem) => Buffer.from(pem, 'utf-8').toString('base64')),
}

function pulumiRuntimeSecretData(definition: RuntimeSecretDefinition): pulumi.Input<string> {
  const derived = derivedRuntimeSecretData[definition.id]
  if (derived !== undefined) return derived
  if (definition.generation === 'random') return pulumiOwnedRuntimeSecret(definition.id, definition.secretName)
  throw new Error(
    `secrets: pulumi-owned secret '${definition.id}' has generation 'manual' but no derived value — add it to derivedRuntimeSecretData.`,
  )
}

// ---------------------------------------------------------------------------
// Registry-driven secret containers
// ---------------------------------------------------------------------------

const secretResources = Object.fromEntries(runtimeSecrets.map((definition) => {
  const secret = definition.valueSource === 'pulumi'
    ? createSecretContainer(definition.secretName, definition.description)
    : getExistingSecretContainer(definition.secretName)
  if (definition.valueSource === 'pulumi') {
    createSecretVersion(definition.secretName, secret.id, pulumiRuntimeSecretData(definition))
  }
  return [definition.id, secret]
}))

// ---------------------------------------------------------------------------
// Exports — secret IDs for container references
// ---------------------------------------------------------------------------

/** Map of runtime secret IDs to their Scaleway Secret IDs. */
export const secretIds = Object.fromEntries(
  Object.entries(secretResources).map(([id, secret]) => [id, secret.id]),
) as Record<string, pulumi.Output<string>>
