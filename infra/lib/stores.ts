import type * as pulumi from '@pulumi/pulumi'

/**
 * A store's provisioned outputs: the string values it exposes, keyed by a
 * store-defined name (e.g. `connectionStringRuntime`, `host`, `caCertificate`).
 * These become stack outputs.
 */
export type StoreOutputs = Record<string, pulumi.Output<string>>

/**
 * The result of provisioning one store: its output values plus the runtime-secret
 * values it supplies, keyed by runtime-secret id. Binding is returned from
 * `provision` (not a separate method) so a store computes secret values from its
 * own typed locals, never by re-reading the widened {@link StoreOutputs} record.
 */
export interface ProvisionedStore {
  outputs: StoreOutputs
  /**
   * Runtime-secret id to value. Keys match the ids in `runtime-secrets.config.ts`
   * (or, in P3+, the ids this store's `secrets()` declares). The engine merges
   * these across stores.
   */
  secretValues: Record<string, pulumi.Input<string>>
}

/**
 * One runtime-secret this store contributes (P3+). Until stores own their secret
 * declarations, the app's `runtime-secrets.config.ts` still lists them and this
 * stays unused; the store supplies only the values via {@link ProvisionedStore.secretValues}.
 */
export interface StoreSecretContribution {
  /** Scaleway Secret Manager container name (kebab-case). */
  secretName: string
  /** Environment variable the consuming service reads the value as. */
  envVar: string
  /** Human-readable purpose. */
  description: string
  /** Whether health/deploy gating treats absence as fatal. */
  required: boolean
  /** Services that receive the secret in their per-VM `.env.runtime`. */
  services: readonly string[]
}

/** Optional store operations the CLI dispatches to (reset/seed/backup). Wired in P4. */
export interface StoreOps {
  reset?: () => Promise<void>
  seed?: () => Promise<void>
  backup?: () => Promise<void>
}

/**
 * A store plugin instance: the stateful peer of a service, produced by a
 * provisioner factory such as `postgresManaged(config)`. Scope is managed (a
 * cloud resource this engine creates) or external (an operator-supplied URL);
 * on-VM state is out of scope because it fights immutable VM generations.
 * `provision` runs inside the Pulumi program with side effects, so the engine
 * calls it exactly once per registered store.
 */
export interface StoreProvisioner {
  /** Plugin discriminator, e.g. `'postgres-managed'`, `'database-url'`. */
  readonly kind: string
  /**
   * Create the store's cloud resources (or none, for an external URL), returning
   * its output values and the runtime-secret values it supplies. Called once by
   * `resources/stores`; reruns would duplicate Pulumi resources.
   */
  provision(): ProvisionedStore
  /**
   * Runtime-secret declarations this store owns (P3+). Optional: while the app
   * config still declares the secrets, a store returns nothing here.
   */
  secrets?(): StoreSecretContribution[]
  /** Store operations for the operator CLI. Wired in P4. */
  ops?: StoreOps
  /** App-defined posture checks (e.g. refuse a plaintext external URL). */
  validate?(): void
}

/**
 * App-owned registry of stateful backing resources. Mirrors `defineServices` /
 * `defineRuntimeSecrets`: a typed identity that preserves literal keys so a
 * store id is a compile-time value. The first registered store is treated as
 * primary (its outputs feed the stack's `db*` exports) until P4 makes the role
 * explicit.
 */
export function defineStores<const T extends Record<string, StoreProvisioner>>(stores: T): T {
  return stores
}
