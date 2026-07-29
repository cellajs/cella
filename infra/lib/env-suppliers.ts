import type * as pulumi from '@pulumi/pulumi'

/**
 * A supplier for one compose `${VAR}` placeholder: a lazy thunk returning the
 * Pulumi value. Lazy so values backed by resources (bucket names, computed CSP)
 * resolve only when VMs are created, not at module load.
 */
export type EnvSupplier = () => pulumi.Input<string>

/**
 * App-owned pool of app-wide compose env suppliers, for `${VAR}` placeholders
 * that are not service-to-service `bindings` (which the engine resolves from the
 * endpoint registry). Mirrors `defineServices` / `defineStores`: a typed identity
 * preserving literal keys. The engine (`resources/compose-env.ts`) reads this
 * generically, so app-specific values (public URLs, CSP, an origin host) live in
 * the app, not in engine code.
 */
export function defineEnvSuppliers<const T extends Record<string, EnvSupplier>>(suppliers: T): T {
  return suppliers
}
