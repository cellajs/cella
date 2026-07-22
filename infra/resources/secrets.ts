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
 * Parses one-time imports for operator secret containers created outside Pulumi.
 * Entries use `secretName=region/uuid`; remove the variable after the targeted update.
 * The normal CLI self-heals this drift, so the hook is for direct runs or forced IDs.
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

// Helper: create a Secret container, optionally with a Version

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
 * Pulumi-derived secrets requiring live database resources: connection strings and CA data.
 * Other Pulumi-owned values resolve generically from registry generation metadata.
 */
const derivedRuntimeSecretData: Record<string, pulumi.Input<string>> = {
  databaseUrlAdmin: connectionStringAdmin,
  databaseUrlRuntime: connectionStringRuntime,
  databaseUrlCdc: connectionStringCdc,
// Base64-encode the multiline RDB CA for line-based `.env.runtime` delivery.
// Database clients decode it back to PEM.
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

// Registry-driven secret containers

const secretResources = Object.fromEntries(runtimeSecrets.map((definition) => {
  const isOperator = definition.valueSource === 'operator'
// Pulumi creates every secret container; operators add versions through the CLI.
// Retain operator values when registry entries disappear, leaving manual orphan cleanup.
  const secret = createSecretContainer(definition.secretName, definition.description, {
    retainOnDelete: isOperator,
    importId: isOperator ? operatorSecretImports[definition.secretName] : undefined,
  })
  if (!isOperator) {
    createSecretVersion(definition.secretName, secret.id, pulumiRuntimeSecretData(definition))
  }
  return [definition.id, secret]
}))

// Exports: secret IDs for container references

/** Map of runtime secret IDs to their Scaleway Secret IDs. The key type is the
 *  literal id union, so a typo'd lookup is a compile error before
 *  undefined Output at deploy time (Object.fromEntries widens, hence the cast). */
export const secretIds = Object.fromEntries(
  Object.entries(secretResources).map(([id, secret]) => [id, secret.id]),
) as Record<RuntimeSecretId, pulumi.Output<string>>
