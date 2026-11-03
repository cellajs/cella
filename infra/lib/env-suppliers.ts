import type { EngineConfig } from '../config/engine-config';
import type { InfraDerivations } from './naming';

/** What a supplier may read: the environment's engine config, names, region and mode, and each public service's URL. */
export interface EnvSupplierContext {
  config: EngineConfig;
  naming: InfraDerivations['naming'];
  region: string;
  mode: string;
  /** Full public URL of a service that declares an LB route; throws for an internal one. */
  serviceUrl(slug: string): string;
}

/** A supplier for one compose `${VAR}` placeholder, called when a deploy writes a machine's static env. */
export type EnvSupplier = (ctx: EnvSupplierContext) => string;

/** Typed identity for the pool of compose env suppliers for `${VAR}` placeholders that are not service-to-service `bindings`. Preserves literal keys; the engine reads it generically so app-specific values stay out of engine code. */
export function defineEnvSuppliers<const T extends Record<string, EnvSupplier>>(suppliers: T): T {
  return suppliers;
}
