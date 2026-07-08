import { managedKeysConfig } from '../config/managed-keys.config'
import { runtimeSecrets, type RuntimeSecretId } from './runtime-secrets'

/**
 * A minted Scaleway IAM key exposes two halves (access key + secret key). A
 * managed key routes each half it actually needs into a runtime secret the app
 * already consumes: a single-token credential (an AI Bearer token) uses only
 * `secretKey`; an access/secret pair (S3) uses both.
 */
export type MintedKeyField = 'accessKey' | 'secretKey'

/**
 * One managed key's fork-owned data, authored in `managed-keys.config.ts`. The
 * `id` is the config object key, so it is not repeated here (see
 * `ManagedKeyDefinition` for the flattened shape).
 */
export interface ManagedKeyConfig {
  /** IAM application/policy name suffix: `<slug>-<suffix>`. Also the API-key description prefix. */
  suffix: string
  /** Human-readable label for prompts and summaries. */
  label: string
  /** IAM application description (shown in the Scaleway console). */
  appDescription: string
  /** IAM policy description (shown in the Scaleway console). */
  policyDescription: string
  /** Project-scoped permission sets granted to the minted key's policy. */
  permissionSets: readonly string[]
  /** Bootstrap opt-in prompt. Minting is ALWAYS operator-confirmed, never silent. */
  prompt: { message: string; default: boolean }
  /**
   * Routes each minted key half to the runtime secret that stores it. Keys are
   * `RuntimeSecretId`s (the runtime-secrets.config object keys), so a typo is a
   * compile error rather than a runtime miss.
   */
  assign: Partial<Record<MintedKeyField, RuntimeSecretId>>
}

/** The literal union of managed-key ids (the config object keys). */
export type ManagedKeyId = keyof typeof managedKeysConfig & string

/** A managed-key definition: its config data plus the id (the config key). */
export interface ManagedKeyDefinition extends ManagedKeyConfig {
  id: ManagedKeyId
}

/** Helper for `managed-keys.config.ts`: typed identity preserving literal keys. */
export function defineManagedKeys<const T extends Record<string, ManagedKeyConfig>>(keys: T): T {
  return keys
}

/** Flattened, ordered managed-key definitions derived from the fork config. */
export const managedKeys: ManagedKeyDefinition[] = Object.entries(managedKeysConfig).map(([id, definition]) => ({
  id: id as ManagedKeyId,
  ...definition,
}))

// Fail fast at load time on a fork misconfiguration, rather than as a bad IAM
// call or a mis-seeded secret at bootstrap time.
{
  const operatorSecretIds = new Set(runtimeSecrets.filter((secret) => secret.valueSource === 'operator').map((secret) => secret.id))
  const seenSuffixes = new Set<string>()
  const seenSecretIds = new Set<string>()
  for (const key of managedKeys) {
    if (seenSuffixes.has(key.suffix)) {
      throw new Error(`managed-keys.config: duplicate suffix '${key.suffix}' (key '${key.id}').`)
    }
    seenSuffixes.add(key.suffix)
    if (key.permissionSets.length === 0) {
      throw new Error(`managed-keys.config: key '${key.id}' has no permissionSets — grant at least one or remove it.`)
    }
    const assigned = Object.entries(key.assign) as [MintedKeyField, RuntimeSecretId][]
    if (assigned.length === 0) {
      throw new Error(`managed-keys.config: key '${key.id}' assigns no runtime secret — set assign.accessKey and/or assign.secretKey.`)
    }
    for (const [field, secretId] of assigned) {
      if (!operatorSecretIds.has(secretId)) {
        throw new Error(
          `managed-keys.config: key '${key.id}' assigns ${field} → '${secretId}', which is not an operator-managed runtime secret. ` +
            `Minted values are written out-of-band, so the target must be valueSource: 'operator' in runtime-secrets.config.`,
        )
      }
      if (seenSecretIds.has(secretId)) {
        throw new Error(`managed-keys.config: runtime secret '${secretId}' is assigned by more than one managed key.`)
      }
      seenSecretIds.add(secretId)
    }
  }
}

/** Look up a managed key by id, or undefined when none matches. */
export function managedKeyById(id: string): ManagedKeyDefinition | undefined {
  return managedKeys.find((key) => key.id === id)
}
