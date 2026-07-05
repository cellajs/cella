/**
 * Secrets — registry-driven runtime secret containers in Scaleway Secret Manager.
 *
 * Pulumi provisions the secret containers for every runtime secret in the central
 * registry. Values are only written by Pulumi for secrets marked `valueSource:
 * 'pulumi'`; operator-managed secrets are created as empty containers and filled
 * later via the bootstrap secret-management flow.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tags, mode } from '../pulumi-context'
import { runtimeSecrets, type RuntimeSecretDefinition, type RuntimeSecretId } from '../lib/runtime-secrets'
import { secretManagerPath } from '../lib/scaleway/vm-reader-secret'
import { configuredOrRandomSecret } from './configured-secret'
import { connectionStringAdmin, connectionStringRuntime, connectionStringCdc, caCertificate } from './database'

/** Folder path for secret organization, e.g. '/cella-production/' */
const secretPath = secretManagerPath(naming.slug, mode)

/**
 * One-time adoption hook for operator secret containers that were created
 * out-of-band before Pulumi owned them (so they are not yet in state). Importing
 * them on the first run of this code adopts the existing container instead of
 * trying to create it (which would fail with "secret already exists"). Supply the
 * ids for a single, targeted `pulumi up`, then unset the variable again:
 *
 *   OPERATOR_SECRET_IMPORTS="admin-email=nl-ams/<uuid>,brevo-api-key=nl-ams/<uuid>"
 *
 * Entries are `secretName=region/uuid` (the Scaleway Secret `.id` form) and are
 * only consulted for operator secrets. Once a container is in state the variable
 * is no longer needed and should be removed.
 *
 * Manual fallback only: the "Apply infra change" CLI flow now self-heals this
 * drift automatically via `lib/adopt-orphaned-secrets.ts` (it lists the live
 * containers and `pulumi import`s any that are missing from state before
 * `pulumi up`). Use this env hook for non-CLI runs or to force a specific id.
 */
function parseOperatorSecretImports(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const map: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const entry = pair.trim()
    if (!entry) continue
    const eq = entry.indexOf('=')
    const name = eq === -1 ? '' : entry.slice(0, eq).trim()
    const id = eq === -1 ? '' : entry.slice(eq + 1).trim()
    if (!name || !id) throw new Error(`OPERATOR_SECRET_IMPORTS: malformed entry '${entry}' (expected name=region/uuid).`)
    map[name] = id
  }
  return map
}

const operatorSecretImports = parseOperatorSecretImports(process.env.OPERATOR_SECRET_IMPORTS)

// ---------------------------------------------------------------------------
// Helper — create a Secret container, optionally with a Version
// ---------------------------------------------------------------------------

function createSecretContainer(
  name: string,
  description: string,
  opts?: { retainOnDelete?: boolean; importId?: string },
) {
  return new scaleway.secrets.Secret(`secret-${name}`, {
    name,
    path: secretPath,
    description,
    region,
    tags,
  }, { aliases: [{ type: 'scaleway:index/secret:Secret' }], retainOnDelete: opts?.retainOnDelete, import: opts?.importId })
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

// Resource names (`generated-<secretName>`) are load-bearing: they are the
// shipped Pulumi identities of the live secret values.
function pulumiOwnedRuntimeSecret(configKey: string, name: string) {
  return configuredOrRandomSecret(configKey, `generated-${name}`)
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
  const isOperator = definition.valueSource === 'operator'
  // Pulumi owns the container for EVERY runtime secret. Operator-managed ones are
  // created empty (no version) and filled out-of-band via the "Manage runtime
  // secrets" CLI; a missing/renamed operator container therefore no longer hard-
  // fails the stack (the previous getSecretOutput lookup did). `retainOnDelete`
  // keeps the operator-supplied value from being deleted when a registry entry is
  // renamed or removed — the orphaned old container is cleaned up by hand.
  const secret = createSecretContainer(definition.secretName, definition.description, {
    retainOnDelete: isOperator,
    importId: isOperator ? operatorSecretImports[definition.secretName] : undefined,
  })
  if (!isOperator) {
    createSecretVersion(definition.secretName, secret.id, pulumiRuntimeSecretData(definition))
  }
  return [definition.id, secret]
}))

// ---------------------------------------------------------------------------
// Exports — secret IDs for container references
// ---------------------------------------------------------------------------

/** Map of runtime secret IDs to their Scaleway Secret IDs. The key type is the
 *  literal id union, so a typo'd lookup is a compile error rather than an
 *  undefined Output at deploy time (Object.fromEntries widens, hence the cast). */
export const secretIds = Object.fromEntries(
  Object.entries(secretResources).map(([id, secret]) => [id, secret.id]),
) as Record<RuntimeSecretId, pulumi.Output<string>>
