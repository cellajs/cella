import { randomBytes } from 'node:crypto';
import { databaseRuntimeSecrets, generatedRuntimeSecrets, type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';

/** The Secret Manager calls the task needs, so a test passes its own. */
export interface EnsureSecretsClient {
  getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined>;
  accessLatestValue(secretId: string): Promise<string>;
  putSecretValue(input: { secretId: string; value: string; description?: string; disablePrevious?: boolean }): Promise<unknown>;
}

/** A fresh generated value: 32 URL-safe characters from 192 random bits. */
export function generateSecretValue(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Make the value of every generated or derived runtime secret straight into its container in the runtime folder, so it never passes through
 * the Pulumi state. A value that exists is the value: nothing is regenerated (rotating is its own action). A container without one gets a
 * fresh value, or the one derived from its source. A database connection string is ensure-database's, as it needs the role's password. A
 * container the `up` has not made yet is left for the next run. Returns the secrets that got a value.
 */
export async function ensureSecrets(opts: {
  client: EnsureSecretsClient;
  secrets?: readonly RuntimeSecretDefinition[];
  generate?: () => string;
  /** Rotate: a fresh value for every rotatable secret, the ones derived from it recomputed; connection strings are ensure-database's. */
  rotate?: boolean;
  log?: (message: string) => void;
}): Promise<string[]> {
  const log = opts.log ?? ((message) => console.info(message));
  const generate = opts.generate ?? generateSecretValue;
  const all = opts.secrets ?? runtimeSecrets;
  const values = new Map<string, string>();
  // A derived value follows its source; anything else rotates only when it says it may.
  const isRotatable = (definition: RuntimeSecretDefinition): boolean => {
    if (!definition.derivedFrom) return definition.rotatable === true;
    const source = all.find((candidate) => candidate.id === definition.derivedFrom?.secretId);
    return source !== undefined && isRotatable(source);
  };
  const written: string[] = [];

  const resolveValue = async (definition: RuntimeSecretDefinition): Promise<string | undefined> => {
    const known = values.get(definition.id);
    if (known !== undefined) return known;
    const container = await opts.client.getSecretByName(definition.secretName, RUNTIME_FOLDER);
    if (opts.rotate && definition.database) return undefined;
    const rotating = Boolean(opts.rotate) && isRotatable(definition);
    const existing = !rotating && container && (container.version_count ?? 0) > 0 ? container : undefined;
    let value: string | undefined;
    if (existing) {
      value = await opts.client.accessLatestValue(existing.id);
    } else if (definition.database) {
      log(`[ensure-secrets] ${definition.secretName}: no value yet; an apply makes it (ensure-database)`);
    } else if (definition.derivedFrom) {
      const { secretId, derive } = definition.derivedFrom;
      const source = all.find((candidate) => candidate.id === secretId);
      if (!source) throw new Error(`ensure-secrets: '${definition.id}' derives from unknown secret '${secretId}'`);
      const sourceValue = await resolveValue(source);
      value = sourceValue === undefined ? undefined : derive(sourceValue);
    } else {
      value = generate();
    }
    if (value === undefined) return undefined;
    if (!container) {
      log(`[ensure-secrets] ${definition.secretName}: no container yet; the next apply makes it`);
    } else if (!existing) {
      await opts.client.putSecretValue({
        secretId: container.id,
        value,
        description: rotating ? 'Rotated by ensure-secrets' : 'Made by ensure-secrets',
        disablePrevious: rotating,
      });
      log(`[ensure-secrets] ${definition.secretName}: given ${rotating ? 'a rotated' : 'a new'} value`);
      written.push(definition.secretName);
    }
    values.set(definition.id, value);
    return value;
  };

  for (const definition of [...generatedRuntimeSecrets(all), ...databaseRuntimeSecrets(all)]) await resolveValue(definition);
  return written;
}
