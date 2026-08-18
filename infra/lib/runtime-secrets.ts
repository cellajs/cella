import type { ServiceName } from '../compose/compose';
import { runtimeSecretsConfig } from '../config/runtime-secrets.config';
import { appStores } from '../config/stores.config';
import { serviceNames } from './services';
import type { StoreProvisioner } from './stores';

export const runtimeSecretConsumers = serviceNames;

export type RuntimeSecretConsumer = ServiceName;

export type RuntimeSecretValueSource = 'pulumi' | 'operator';
export type RuntimeSecretGeneration = 'manual' | 'random';

/** One runtime secret's app-owned mapping data from `runtime-secrets.config.ts`. The `id` is the config object key; {@link RuntimeSecretDefinition} is the flattened shape. */
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

/** A runtime-secret id. Store contributions register ids outside the app-config key union, so this stays a plain string and load-time validation rejects duplicates. */
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

/** Pure merge of a store registry's secret contributions with `runtime-secrets.config.ts` entries. Store-owned declarations come first, in store-registry order: the per-consumer union order is genId-fingerprinted, so merge position must not change. */
export function buildRuntimeSecrets(
  stores: Record<string, Pick<StoreProvisioner, 'secrets'>>,
  appSecrets: Record<string, Omit<RuntimeSecretDefinition, 'id'>>,
): RuntimeSecretDefinition[] {
  const storeContributions: RuntimeSecretDefinition[] = Object.values(stores).flatMap((store) =>
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
  return [...storeContributions, ...Object.entries(appSecrets).map(([id, definition]) => ({ id, ...definition }))];
}

/** Fail fast on a misconfiguration that would produce a missing container at deploy time or a missing variable at runtime, including clashes across stores and app config. */
export function validateRuntimeSecrets(
  secrets: readonly RuntimeSecretDefinition[],
  knownServices: ReadonlySet<string>,
): void {
  const seenIds = new Set<string>();
  const seenEnvVars = new Set<string>();
  const seenSecretNames = new Set<string>();
  for (const secret of secrets) {
    if (seenIds.has(secret.id)) {
      throw new Error(
        `runtime-secrets: duplicate secret id '${secret.id}': a store contribution clashes with another store or the app config.`,
      );
    }
    seenIds.add(secret.id);
    if (secret.services.length === 0) {
      throw new Error(
        `runtime-secrets.config: secret '${secret.id}' has no services: assign at least one consumer or remove it.`,
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

/** Flattened runtime secret definitions for this app: store contributions then `runtime-secrets.config.ts` entries, validated at load time. */
export const runtimeSecrets: RuntimeSecretDefinition[] = buildRuntimeSecrets(appStores, runtimeSecretsConfig);
validateRuntimeSecrets(runtimeSecrets, new Set<string>(serviceNames));

export const operatorManagedRuntimeSecrets: RuntimeSecretDefinition[] = runtimeSecrets.filter(
  (secret) => secret.valueSource === 'operator',
);

export function runtimeSecretsForConsumer(consumer: RuntimeSecretConsumer): RuntimeSecretDefinition[] {
  return runtimeSecrets.filter((secret) => secret.services.some((service) => service === consumer));
}

/** Union of runtime-secret definitions across consumers, deduplicated by id in per-consumer registry order. That order is hashed into each generation's genId, so reordering re-rolls every generation. */
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
