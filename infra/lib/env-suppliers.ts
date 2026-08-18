import type * as pulumi from '@pulumi/pulumi';

/** A supplier for one compose `${VAR}` placeholder. Lazy so resource-backed values resolve when VMs are created, not at module load. */
export type EnvSupplier = () => pulumi.Input<string>;

/** App-owned pool of compose env suppliers for `${VAR}` placeholders that are not service-to-service `bindings`. Preserves literal keys; the engine reads it generically so app-specific values stay out of engine code. */
export function defineEnvSuppliers<const T extends Record<string, EnvSupplier>>(suppliers: T): T {
  return suppliers;
}
