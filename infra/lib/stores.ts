import type * as pulumi from '@pulumi/pulumi';

/** A store's provisioned outputs, keyed by a store-defined name (`connectionStringRuntime`, `host`, `caCertificate`). These become stack outputs. */
export type StoreOutputs = Record<string, pulumi.Output<string>>;

/** One store's provisioning result: output values plus the runtime-secret values it supplies, keyed by runtime-secret id. */
export interface ProvisionedStore {
  outputs: StoreOutputs;
  /** Runtime-secret id to value. Keys match the ids in `runtime-secrets.config.ts` or in this store's `secrets()`. The engine merges these across stores. */
  secretValues: Record<string, pulumi.Input<string>>;
}

/** One runtime-secret a store declares. An `'engine'` value comes from {@link ProvisionedStore.secretValues} or, for a `database` entry, from the operator task ensure-database; an `'operator'` one is filled through the CLI. */
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
  /** `'engine'` = the store binds a version; `'operator'` = the operator sets it. */
  valueSource: 'engine' | 'operator';
  /** Services that receive the secret in their per-VM `.env.runtime`. */
  services: readonly string[];
  /** A database connection string the operator task ensure-database assembles for this role, never the program. */
  database?: { role: DatabaseRole };
}

/** A database role whose password the operator task keeps: `admin` owns the tables and replicates, `runtime` serves requests under RLS. */
export type DatabaseRole = 'admin' | 'runtime';

/** Engine facilities injected into `provision()`. Stores take the Pulumi toolchain as arguments and keep module scope free of Pulumi imports, so CLI tasks can import the store registry without building a resource graph. */
export interface ProvisionContext {
  pulumi: typeof import('@pulumi/pulumi');
  scaleway: typeof import('@pulumiverse/scaleway');
  /** Resource naming helpers (slug-prefixed names, the derived db identifier). */
  naming: { resource: (name: string) => string; dbName: string };
  region: string;
  zone: string;
  isProduction: boolean;
  /** The database size from `config/general.config.ts`, which managed stores consume. */
  sizing: { dbNodeType: string; dbVolumeSize: number };
  /** The deployment's private network, where managed stores expose endpoints. */
  privateNetworkId: pulumi.Input<string>;
}

/**
 * A store plugin instance: the stateful peer of a service, produced by a factory such as `postgresManaged(config)`. A store is a managed cloud
 * resource on the deployment's private network; on-machine state is out of scope, as every deploy replaces the machines. A kind names its own
 * Pulumi resources and runtime secrets, so it registers once.
 * `provision` has side effects in the Pulumi program, so the engine calls it exactly once per registered store.
 */
export interface StoreProvisioner {
  /** Plugin discriminator, e.g. `'postgres-managed'`. */
  readonly kind: string;
  /** The factory's own config, which the applied description holds: a change to it owes an apply. Plain data; no secret value. */
  readonly settings?: object;
  /** Create the store's cloud resources and return their outputs and the values of the `'engine'` secrets it supplies. Called once by `resources/stores`; a rerun duplicates Pulumi resources. */
  provision(ctx: ProvisionContext): ProvisionedStore;
  /** Runtime-secret declarations this store owns, merged ahead of `runtime-secrets.config.ts`. Must be pure with no Pulumi access: it runs in CLI tasks too. */
  secrets?(): StoreSecretContribution[];
}

/** Typed identity for the store registry (`config/stores.config.ts`): preserves literal keys so a store id is a compile-time value. */
export function defineStores<const T extends Record<string, StoreProvisioner>>(stores: T): T {
  return stores;
}
