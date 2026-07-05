/**
 * Cella-owned runtime-secrets machinery. Forks should NOT edit this file — the
 * fork-facing secret→service *mapping* lives in `runtime-secrets.config.ts`;
 * this module supplies the typed `defineRuntimeSecrets` helper, flattens that
 * config into the `runtimeSecrets` list, validates it, and derives the lookups
 * the rest of infra consumes:
 *   - resources/secrets.ts  — one Secret Manager container per definition;
 *   - resources/compute.ts  — the per-VM `.env.runtime` manifest;
 *   - tasks/manage-runtime-secrets.ts, tasks/seed-operator-secrets.ts.
 */
import runtimeSecretsConfig from '../config/runtime-secrets.config'
import { serviceNames } from './services'
import type { ServiceName } from '../compose/compose'

export const runtimeSecretConsumers = serviceNames

export type RuntimeSecretConsumer = ServiceName

export type RuntimeSecretValueSource = 'pulumi' | 'operator'
export type RuntimeSecretGeneration = 'manual' | 'random'

/**
 * One runtime secret's fork-owned mapping data, authored in
 * `runtime-secrets.config.ts`. The `id` is the config object key, so it is not
 * repeated here (see `RuntimeSecretDefinition` for the flattened shape).
 */
export interface RuntimeSecretConfig {
  /** Scaleway Secret Manager container name (kebab-case). */
  secretName: string
  /** Human-readable purpose, surfaced in tooling and the container description. */
  description: string
  /** Environment variable the consuming service reads the value as. */
  envVar: string
  /** Whether deploy/health gating treats the value's absence as fatal. */
  required: boolean
  /** `'pulumi'` = cella writes a version; `'operator'` = supplied out-of-band. */
  valueSource: RuntimeSecretValueSource
  /** `'random'` = Pulumi RandomPassword; `'manual'` = derived/hand-supplied. */
  generation: RuntimeSecretGeneration
  /** Services that receive the secret in their per-VM `.env.runtime`. */
  services: readonly RuntimeSecretConsumer[]
}

/** The literal union of fork-config secret ids (the config object keys). */
export type RuntimeSecretId = keyof typeof runtimeSecretsConfig & string

/** A runtime secret definition: its config data plus the id (the config key). */
export interface RuntimeSecretDefinition extends RuntimeSecretConfig {
  id: RuntimeSecretId
}

/** Helper for `runtime-secrets.config.ts` — typed identity preserving literal keys. */
export function defineRuntimeSecrets<const T extends Record<string, RuntimeSecretConfig>>(secrets: T): T {
  return secrets
}

/** Flattened, ordered runtime secret definitions derived from the fork config. */
export const runtimeSecrets: RuntimeSecretDefinition[] = Object.entries(runtimeSecretsConfig).map(([id, definition]) => ({
  // Object.entries widens keys to string; the entries ARE the config keys.
  id: id as RuntimeSecretId,
  ...definition,
}))

// Fail fast at load time on a fork misconfiguration, rather than as a missing
// container at deploy time or a missing variable at runtime.
{
  const knownServices = new Set<string>(serviceNames)
  const seenEnvVars = new Set<string>()
  const seenSecretNames = new Set<string>()
  for (const secret of runtimeSecrets) {
    if (secret.services.length === 0) {
      throw new Error(`runtime-secrets.config: secret '${secret.id}' has no services — assign at least one consumer or remove it.`)
    }
    for (const service of secret.services) {
      if (!knownServices.has(service)) {
        throw new Error(
          `runtime-secrets.config: secret '${secret.id}' targets unknown service '${service}'. Known services: ${[...knownServices].join(', ')}.`,
        )
      }
    }
    if (seenEnvVars.has(secret.envVar)) {
      throw new Error(`runtime-secrets.config: duplicate envVar '${secret.envVar}' (secret '${secret.id}').`)
    }
    seenEnvVars.add(secret.envVar)
    if (seenSecretNames.has(secret.secretName)) {
      throw new Error(`runtime-secrets.config: duplicate secretName '${secret.secretName}' (secret '${secret.id}').`)
    }
    seenSecretNames.add(secret.secretName)
  }
}

export const operatorManagedRuntimeSecrets: RuntimeSecretDefinition[] = runtimeSecrets.filter((secret) => secret.valueSource === 'operator')

export function runtimeSecretsForConsumer(consumer: RuntimeSecretConsumer): RuntimeSecretDefinition[] {
  return runtimeSecrets.filter((secret) => secret.services.some((service) => service === consumer))
}

/**
 * Union of the runtime-secret definitions across consumers (the singleVM host
 * carries its co-hosted workers' secrets too), deduplicated by id. Order is
 * per-consumer registry order with duplicates dropped — LOAD-BEARING: the
 * manifest metadata is hashed into each generation's genId
 * (resources/compute.ts `serviceFingerprint`), so reordering would re-roll
 * every generation.
 */
export function unionRuntimeSecrets(consumers: readonly RuntimeSecretConsumer[]): RuntimeSecretDefinition[] {
  const seen = new Set<string>()
  return consumers
    .flatMap((consumer) => runtimeSecretsForConsumer(consumer))
    .filter((definition) => {
      if (seen.has(definition.id)) return false
      seen.add(definition.id)
      return true
    })
}