import type { ServiceName } from '../compose/compose';
import { runtimeSecretsConfig } from '../config/runtime-secrets.config';
import { appStores } from '../config/stores.config';
import { serviceNames } from './services';

export const runtimeSecretConsumers = serviceNames;

export type RuntimeSecretConsumer = ServiceName;

export type RuntimeSecretValueSource = 'pulumi' | 'operator';
export type RuntimeSecretGeneration = 'manual' | 'random';

/**
 * One runtime secret's app-owned mapping data, authored in
 * `runtime-secrets.config.ts`. The `id` is the config object key, so it is not
 * repeated here (see {@link RuntimeSecretDefinition} for the flattened shape).
 */
export interface RuntimeSecretConfig {
  /** Scaleway Secret Manager container name (kebab-case). */
  secretName: string;
  /** Human-readable purpose, surfaced in tooling and the container description. */
  description: string;
  /** Environment variable the consuming service reads the value as. */
  envVar: string;
  /** Whether deploy/health gating treats the value's absence as fatal. */
  required: boolean;
  /** `'pulumi'` = the engine writes a version; `'operator'` = supplied out-of-band. */
  valueSource: RuntimeSecretValueSource;
  /** `'random'` = Pulumi RandomPassword; `'manual'` = derived/hand-supplied. */
  generation: RuntimeSecretGeneration;
  /** Services that receive the secret in their per-VM `.env.runtime`. */
  services: readonly RuntimeSecretConsumer[];
}

/**
 * A runtime-secret id. Store contributions register ids outside the app-config
 * key union, so this is a plain string; the load-time validation below rejects
 * duplicates and unknown consumers.
 */
export type RuntimeSecretId = string;

/** A runtime secret definition: registry data plus the id it is addressed by. */
export interface RuntimeSecretDefinition {
  id: RuntimeSecretId;
  secretName: string;
  description: string;
  envVar: string;
  required: boolean;
  valueSource: RuntimeSecretValueSource;
  generation: RuntimeSecretGeneration;
  /** Consuming services; store contributions are runtime-validated against the registry. */
  services: readonly string[];
}

/** Helper for `runtime-secrets.config.ts`: typed identity preserving literal keys. */
export function defineRuntimeSecrets<const T extends Record<string, RuntimeSecretConfig>>(secrets: T): T {
  return secrets;
}

// Store-owned declarations come first, in store-registry order: cella's
// database secrets historically led the app config, and the per-consumer union
// order is genId-fingerprinted, so the merge position is deliberate.
const storeContributions: RuntimeSecretDefinition[] = Object.values(appStores).flatMap((store) =>
  (store.secrets?.() ?? []).map((contribution) => ({
    id: contribution.id,
    secretName: contribution.secretName,
    description: contribution.description,
    envVar: contribution.envVar,
    required: contribution.required,
    valueSource: contribution.valueSource,
    generation: 'manual' as const,
    services: contribution.services,
  })),
);

/**
 * Flattened, ordered runtime secret definitions: store contributions followed
 * by the app's `runtime-secrets.config.ts` entries.
 */
export const runtimeSecrets: RuntimeSecretDefinition[] = [
  ...storeContributions,
  ...Object.entries(runtimeSecretsConfig).map(([id, definition]) => ({
    id,
    ...definition,
  })),
];

// Fail fast at load time on an app misconfiguration, preventing a missing
// container at deploy time or a missing variable at runtime. Covers store
// contributions and app-config entries alike (including cross-source clashes).
{
  const knownServices = new Set<string>(serviceNames);
  const seenIds = new Set<string>();
  const seenEnvVars = new Set<string>();
  const seenSecretNames = new Set<string>();
  for (const secret of runtimeSecrets) {
    if (seenIds.has(secret.id)) {
      throw new Error(
        `runtime-secrets: duplicate secret id '${secret.id}' — a store contribution clashes with another store or the app config.`,
      );
    }
    seenIds.add(secret.id);
    if (secret.services.length === 0) {
      throw new Error(
        `runtime-secrets.config: secret '${secret.id}' has no services — assign at least one consumer or remove it.`,
      );
    }
    for (const service of secret.services) {
      if (!knownServices.has(service)) {
        throw new Error(
          `runtime-secrets.config: secret '${secret.id}' targets unknown service '${service}'. Known services: ${[...knownServices].join(', ')}.`,
        );
      }
    }
    if (seenEnvVars.has(secret.envVar)) {
      throw new Error(`runtime-secrets.config: duplicate envVar '${secret.envVar}' (secret '${secret.id}').`);
    }
    seenEnvVars.add(secret.envVar);
    if (seenSecretNames.has(secret.secretName)) {
      throw new Error(`runtime-secrets.config: duplicate secretName '${secret.secretName}' (secret '${secret.id}').`);
    }
    seenSecretNames.add(secret.secretName);
  }
}

export const operatorManagedRuntimeSecrets: RuntimeSecretDefinition[] = runtimeSecrets.filter(
  (secret) => secret.valueSource === 'operator',
);

export function runtimeSecretsForConsumer(consumer: RuntimeSecretConsumer): RuntimeSecretDefinition[] {
  return runtimeSecrets.filter((secret) => secret.services.some((service) => service === consumer));
}

/**
 * Union of the runtime-secret definitions across consumers (the singleVM host
 * carries its co-hosted workers' secrets too), deduplicated by id. Order is
 * per-consumer registry order with duplicates dropped. LOAD-BEARING: the
 * manifest metadata is hashed into each generation's genId
 * (resources/compute.ts `serviceFingerprint`), so reordering would re-roll
 * every generation.
 */
export function unionRuntimeSecrets(consumers: readonly RuntimeSecretConsumer[]): RuntimeSecretDefinition[] {
  const seen = new Set<string>();
  return consumers
    .flatMap((consumer) => runtimeSecretsForConsumer(consumer))
    .filter((definition) => {
      if (seen.has(definition.id)) return false;
      seen.add(definition.id);
      return true;
    });
}
