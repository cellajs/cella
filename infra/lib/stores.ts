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
 * One runtime-secret this store contributes, keyed by its runtime-secret id.
 * Managed stores contribute `valueSource: 'pulumi'` entries whose values arrive
 * via {@link ProvisionedStore.secretValues}; external-URL stores contribute
 * `valueSource: 'operator'` entries the operator fills through the CLI.
 */
export interface StoreSecretContribution {
  /** Runtime-secret id (the key other layers address the secret by). */
  id: string
  /** Scaleway Secret Manager container name (kebab-case). */
  secretName: string
  /** Environment variable the consuming service reads the value as. */
  envVar: string
  /** Human-readable purpose. */
  description: string
  /** Whether health/deploy gating treats absence as fatal. */
  required: boolean
  /** `'pulumi'` = the store binds a version; `'operator'` = supplied out-of-band. */
  valueSource: 'pulumi' | 'operator'
  /** Services that receive the secret in their per-VM `.env.runtime`. */
  services: readonly string[]
}

/**
 * Engine facilities injected into `provision()`. Stores receive their Pulumi
 * toolchain and engine helpers as call arguments and keep their module scope
 * free of Pulumi imports, so the secret-declaration merge in
 * `lib/runtime-secrets.ts` and standalone CLI tasks can import the store
 * registry without touching the Pulumi resource graph.
 */
export interface ProvisionContext {
  pulumi: typeof import('@pulumi/pulumi')
  scaleway: typeof import('@pulumiverse/scaleway')
  /** Resource naming helpers (slug-prefixed names, the derived db identifier). */
  naming: { resource: (name: string) => string; dbName: string }
  region: string
  zone: string
  isProduction: boolean
  /** Mode-resolved sizing knobs consumed by managed stores. */
  sizing: { dbNodeType: string; dbVolumeSize: number }
  /** The deployment's private network, where managed stores expose endpoints. */
  privateNetworkId: pulumi.Input<string>
  /** Stack-config-supplied or generated random secret with a stable resource identity. */
  configuredOrRandomSecret: (configKey: string, resourceName: string) => pulumi.Output<string>
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
   * `resources/stores` with the engine's {@link ProvisionContext}; reruns would
   * duplicate Pulumi resources.
   */
  provision(ctx: ProvisionContext): ProvisionedStore
  /**
   * Runtime-secret declarations this store owns, merged ahead of the app's
   * `runtime-secrets.config.ts` entries by `lib/runtime-secrets.ts`. Must be
   * pure (no Pulumi access): it runs in CLI tasks too.
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
