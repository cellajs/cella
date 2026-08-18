import type * as pulumi from '@pulumi/pulumi';

/** A store's provisioned outputs, keyed by a store-defined name (`connectionStringRuntime`, `host`, `caCertificate`). These become stack outputs. */
export type StoreOutputs = Record<string, pulumi.Output<string>>;

/** One store's provisioning result: output values plus the runtime-secret values it supplies, keyed by runtime-secret id. */
export interface ProvisionedStore {
  outputs: StoreOutputs;
  /** Runtime-secret id to value. Keys match the ids in `runtime-secrets.config.ts` or in this store's `secrets()`. The engine merges these across stores. */
  secretValues: Record<string, pulumi.Input<string>>;
}

/** One runtime-secret a store contributes: managed stores supply `'pulumi'` values via {@link ProvisionedStore.secretValues}, external-URL stores declare `'operator'` entries filled through the CLI. */
export interface StoreSecretContribution {
  /** Runtime-secret id (the key other layers address the secret by). */
  id: string;
  /** Scaleway Secret Manager container name (kebab-case). */
  secretName: string;
  /** Environment variable the consuming service reads the value as. */
  envVar: string;
  /** Human-readable purpose. */
  description: string;
  /** Whether health/deploy gating treats absence as fatal. */
  required: boolean;
  /** `'pulumi'` = the store binds a version; `'operator'` = supplied out-of-band. */
  valueSource: 'pulumi' | 'operator';
  /** Services that receive the secret in their per-VM `.env.runtime`. */
  services: readonly string[];
}

/** Engine facilities injected into `provision()`. Stores take the Pulumi toolchain as arguments and keep module scope free of Pulumi imports, so CLI tasks can import the store registry without building a resource graph. */
export interface ProvisionContext {
  pulumi: typeof import('@pulumi/pulumi');
  scaleway: typeof import('@pulumiverse/scaleway');
  /** Resource naming helpers (slug-prefixed names, the derived db identifier). */
  naming: { resource: (name: string) => string; dbName: string };
  region: string;
  zone: string;
  isProduction: boolean;
  /** Mode-resolved sizing knobs consumed by managed stores. */
  sizing: { dbNodeType: string; dbVolumeSize: number };
  /** The deployment's private network, where managed stores expose endpoints. */
  privateNetworkId: pulumi.Input<string>;
  /** Stack-config-supplied or generated random secret with a stable resource identity. */
  configuredOrRandomSecret: (configKey: string, resourceName: string) => pulumi.Output<string>;
}

/** Optional store operations the CLI dispatches to (reset/seed/backup). Wired in P4. */
export interface StoreOps {
  reset?: () => Promise<void>;
  seed?: () => Promise<void>;
  backup?: () => Promise<void>;
}

/**
 * A store plugin instance: the stateful peer of a service, produced by a factory such as `postgresManaged(config)`. Scope is managed (a cloud resource) or external (an operator-supplied URL); on-VM state is out of scope because it fights immutable VM generations.
 * `provision` has side effects in the Pulumi program, so the engine calls it exactly once per registered store.
 */
export interface StoreProvisioner {
  /** Plugin discriminator, e.g. `'postgres-managed'`, `'database-url'`. */
  readonly kind: string;
  /** Create the store's cloud resources (none for an external URL) and return its outputs and secret values. Called once by `resources/stores`; a rerun duplicates Pulumi resources. */
  provision(ctx: ProvisionContext): ProvisionedStore;
  /** Runtime-secret declarations this store owns, merged ahead of `runtime-secrets.config.ts`. Must be pure with no Pulumi access: it runs in CLI tasks too. */
  secrets?(): StoreSecretContribution[];
  /** Store operations for the operator CLI. Wired in P4. */
  ops?: StoreOps;
  /** App-defined posture checks (e.g. refuse a plaintext external URL). */
  validate?(): void;
}

/** App-owned registry of stateful backing resources. Preserves literal keys so a store id is a compile-time value. The first registered store is primary: its outputs feed the stack's `db*` exports. */
export function defineStores<const T extends Record<string, StoreProvisioner>>(stores: T): T {
  return stores;
}
