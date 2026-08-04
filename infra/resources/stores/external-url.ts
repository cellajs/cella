import type { ProvisionedStore, StoreProvisioner, StoreSecretContribution } from '../../lib/stores';

/** Configuration for one operator-supplied external URL secret. */
export interface ExternalUrlConfig {
  /** Services that receive the URL in their per-VM `.env.runtime`. */
  services: readonly string[];
  /** Environment variable the consuming service reads. */
  envVar?: string;
  /** Secret Manager container name. */
  secretName?: string;
  /** Runtime-secret id the contribution registers under. */
  id?: string;
  /** Human-readable purpose shown in tooling. */
  description?: string;
  /** Whether deploy gating treats an unset URL as fatal. Defaults to true. */
  required?: boolean;
}

/** Fully-resolved defaults an external-URL store variant supplies. */
interface ExternalUrlDefaults {
  kind: string;
  id: string;
  secretName: string;
  envVar: string;
  description: string;
}

/**
 * Generic external store: provisions nothing and contributes one
 * operator-supplied URL as a runtime secret. The base for `redisUrl` /
 * `mongoUrl`; apps can call it directly for any other reachable-by-URL
 * backing service.
 */
export function externalUrl(defaults: ExternalUrlDefaults, config: ExternalUrlConfig): StoreProvisioner {
  return {
    kind: defaults.kind,

    provision(): ProvisionedStore {
      return { outputs: {}, secretValues: {} };
    },

    secrets(): StoreSecretContribution[] {
      return [
        {
          id: config.id ?? defaults.id,
          secretName: config.secretName ?? defaults.secretName,
          envVar: config.envVar ?? defaults.envVar,
          description: config.description ?? defaults.description,
          required: config.required ?? true,
          valueSource: 'operator',
          services: config.services,
        },
      ];
    },
  };
}

/** External Redis reached through an operator-supplied `REDIS_URL`. */
export function redisUrl(config: ExternalUrlConfig): StoreProvisioner {
  return externalUrl(
    {
      kind: 'redis-url',
      id: 'redisUrl',
      secretName: 'redis-url',
      envVar: 'REDIS_URL',
      description: 'External Redis connection URL (operator-supplied)',
    },
    config,
  );
}

/** External MongoDB reached through an operator-supplied `MONGO_URL`. */
export function mongoUrl(config: ExternalUrlConfig): StoreProvisioner {
  return externalUrl(
    {
      kind: 'mongo-url',
      id: 'mongoUrl',
      secretName: 'mongo-url',
      envVar: 'MONGO_URL',
      description: 'External MongoDB connection URL (operator-supplied)',
    },
    config,
  );
}
