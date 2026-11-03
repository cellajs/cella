import type { EngineConfig } from '../config/engine-config';
import { deriveInfra, type InfraDerivations } from './naming';
import { serviceEndpoints } from './services';

/** What a supplier may read: the environment's names, region and mode, and each public service's URL. */
export interface EnvSupplierContext {
  naming: InfraDerivations['naming'];
  region: string;
  mode: string;
  /** Full public URL of a service that declares an LB route; throws for an internal one. */
  serviceUrl(slug: string): string;
}

/** A supplier for one compose `${VAR}` placeholder, called when a deploy writes a machine's static env. */
export type EnvSupplier = (ctx: EnvSupplierContext) => string;

/** App-owned pool of compose env suppliers for `${VAR}` placeholders that are not service-to-service `bindings`. Preserves literal keys; the engine reads it generically so app-specific values stay out of engine code. */
export function defineEnvSuppliers<const T extends Record<string, EnvSupplier>>(suppliers: T): T {
  return suppliers;
}

/** The context every supplier is called with for an environment: its names, region and mode, and its public services' URLs. */
export function supplierContext(config: EngineConfig): EnvSupplierContext {
  const { naming, region } = deriveInfra(config);
  const urls = new Map(serviceEndpoints(config).map((endpoint) => [endpoint.slug as string, endpoint.url]));
  return {
    naming,
    region,
    mode: config.mode,
    serviceUrl: (slug) => {
      const url = urls.get(slug);
      if (!url) throw new Error(`Service '${slug}' has no public endpoint (internal-only?)`);
      return url;
    },
  };
}
