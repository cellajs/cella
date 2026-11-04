import type { ServiceName } from '../compose/compose';
import { runtimeSecretsConfig } from '../config/runtime-secrets.config';
import { appStores } from '../config/stores.config';
import type { RuntimeSecretDerivation, RuntimeSecretGeneration, RuntimeSecretValueSource } from './runtime-secrets-config';
import { type ServiceDefinition, serviceNames } from './services';
import type { DatabaseRole, StoreProvisioner } from './stores';

export const runtimeSecretConsumers = serviceNames;

export type RuntimeSecretConsumer = ServiceName;

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
  derivedFrom?: RuntimeSecretDerivation;
  rotatable?: boolean;
  /** A database connection string the operator task ensure-database assembles for this role. */
  database?: { role: DatabaseRole };
}

/** Pure merge of a store registry's secret contributions with `runtime-secrets.config.ts` entries. Store-owned declarations come first, in store-registry order. */
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
      ...(contribution.database ? { database: contribution.database } : {}),
    })),
  );
  return [...storeContributions, ...Object.entries(appSecrets).map(([id, definition]) => ({ id, ...definition }))];
}

/** Fail fast on a misconfiguration that would produce a missing container at deploy time or a missing variable at runtime, including clashes across stores and app config. */
export function validateRuntimeSecrets(secrets: readonly RuntimeSecretDefinition[], knownServices: ReadonlySet<string>): void {
  const seenIds = new Set<string>();
  const seenEnvVars = new Set<string>();
  const seenSecretNames = new Set<string>();
  for (const secret of secrets) {
    if (seenIds.has(secret.id)) {
      throw new Error(`runtime-secrets: duplicate secret id '${secret.id}': a store contribution clashes with another store or the app config.`);
    }
    seenIds.add(secret.id);
    if (secret.services.length === 0) {
      throw new Error(`runtime-secrets.config: secret '${secret.id}' has no services: assign at least one consumer or remove it.`);
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
  for (const secret of secrets) {
    if (!secret.derivedFrom) continue;
    const source = secrets.find((candidate) => candidate.id === secret.derivedFrom?.secretId);
    // Only Pulumi writes both values, so the derived one can never drift from an out-of-band rotation of its source.
    if (source?.valueSource !== 'engine' || source.derivedFrom || secret.valueSource !== 'engine') {
      throw new Error(`runtime-secrets.config: secret '${secret.id}' must be pulumi-owned and derive from a pulumi-owned, non-derived secret.`);
    }
  }
}

/** Flattened runtime secret definitions for this app: store contributions then `runtime-secrets.config.ts` entries, validated at load time. */
export const runtimeSecrets: RuntimeSecretDefinition[] = buildRuntimeSecrets(appStores, runtimeSecretsConfig);
validateRuntimeSecrets(runtimeSecrets, new Set<string>(serviceNames));

/**
 * The runtime secrets whose values the operator task ensure-secrets makes straight into Secret Manager: generated ones, and the ones derived
 * from another runtime secret. Their versions never pass through the Pulumi state.
 */
export function generatedRuntimeSecrets(definitions: readonly RuntimeSecretDefinition[] = runtimeSecrets): RuntimeSecretDefinition[] {
  return definitions.filter((secret) => secret.valueSource === 'engine' && (secret.generation === 'random' || secret.derivedFrom !== undefined));
}

/** The database connection strings, which the operator task ensure-database assembles; a deploy only fills an empty copy from another. */
export function databaseRuntimeSecrets(definitions: readonly RuntimeSecretDefinition[] = runtimeSecrets): RuntimeSecretDefinition[] {
  return definitions.filter((secret) => secret.database !== undefined);
}

/** Every runtime secret whose value the engine makes outside the Pulumi state: the generated, the derived and the database ones. */
export function engineMadeRuntimeSecrets(definitions: readonly RuntimeSecretDefinition[] = runtimeSecrets): RuntimeSecretDefinition[] {
  return [...generatedRuntimeSecrets(definitions), ...databaseRuntimeSecrets(definitions)];
}

/** A generated value that protects stored data: no rotation replaces it, and a teardown keeps its container beside the final dump. */
export function protectsStoredData(definition: Pick<RuntimeSecretDefinition, 'valueSource' | 'generation' | 'rotatable'>): boolean {
  return definition.valueSource === 'engine' && definition.generation === 'random' && definition.rotatable !== true;
}

export const operatorManagedRuntimeSecrets: RuntimeSecretDefinition[] = runtimeSecrets.filter((secret) => secret.valueSource === 'operator');

export function runtimeSecretsForConsumer(consumer: RuntimeSecretConsumer): RuntimeSecretDefinition[] {
  return runtimeSecrets.filter((secret) => secret.services.some((service) => service === consumer));
}

/** Union of runtime-secret definitions across consumers, deduplicated by id in per-consumer registry order: the order of a machine's env file. */
function unionRuntimeSecrets(consumers: readonly RuntimeSecretConsumer[]): RuntimeSecretDefinition[] {
  const seen = new Set<string>();
  return consumers
    .flatMap((consumer) => runtimeSecretsForConsumer(consumer))
    .filter((definition) => {
      if (seen.has(definition.id)) return false;
      seen.add(definition.id);
      return true;
    });
}

/**
 * The uploads key's two halves, which Update identities and Rotate keys write into the runtime folder: the key of the uploads application,
 * which a service with `s3Access` signs uploads and presigned URLs with. Its consumers are those services.
 */
export const uploadsKeySecrets = [
  { secretName: 'uploads-access-key', envVar: 'S3_ACCESS_KEY_ID', half: 'accessKey' },
  { secretName: 'uploads-secret-key', envVar: 'S3_ACCESS_KEY_SECRET', half: 'secretKey' },
] as const;

/** One name a machine's env file carries: its env var, the runtime-folder container it is read from, and whether a missing value stops a deploy. */
export interface RuntimeEnvEntry {
  envVar: string;
  secretName: string;
  required: boolean;
}

/**
 * The names one machine's env file carries: every runtime secret the services it carries consume, in registry order, and the uploads key when
 * one of them signs uploads. Nothing else: a value no service on the machine reads stays off it.
 */
export function runtimeEnvEntries(carried: readonly Pick<ServiceDefinition, 'slug' | 's3Access'>[]): RuntimeEnvEntry[] {
  const secrets = unionRuntimeSecrets(carried.map((service) => service.slug)).map(({ envVar, secretName, required }) => ({
    envVar,
    secretName,
    required,
  }));
  const uploads = carried.some((service) => service.s3Access)
    ? uploadsKeySecrets.map(({ envVar, secretName }) => ({ envVar, secretName, required: true }))
    : [];
  return [...secrets, ...uploads];
}
