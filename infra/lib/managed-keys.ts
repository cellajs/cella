import { managedKeysConfig } from '../config/managed-keys.config';
import type { ManagedKeyConfig, MintedKeyField } from './managed-keys-config';
import { type RuntimeSecretId, runtimeSecrets } from './runtime-secrets';

/** The literal union of managed-key ids (the config object keys). */
export type ManagedKeyId = keyof typeof managedKeysConfig & string;

/** A managed-key definition: its config data plus the id (the config key). */
export interface ManagedKeyDefinition extends ManagedKeyConfig {
  id: ManagedKeyId;
}

/** Flattened, ordered managed-key definitions derived from the app config. */
export const managedKeys: ManagedKeyDefinition[] = Object.entries(managedKeysConfig).map(([id, definition]) => ({
  id: id as ManagedKeyId,
  ...definition,
}));

// Fail fast at load time: a misconfiguration here becomes a bad IAM call or a mis-seeded secret at setup.
{
  const operatorIds = runtimeSecrets.filter((secret) => secret.valueSource === 'operator').map((secret) => secret.id);
  const operatorSecretIds = new Set(operatorIds);
  const seenSuffixes = new Set<string>();
  const seenSecretIds = new Set<string>();
  for (const key of managedKeys) {
    if (seenSuffixes.has(key.suffix)) {
      throw new Error(`managed-keys.config: duplicate suffix '${key.suffix}' (key '${key.id}').`);
    }
    seenSuffixes.add(key.suffix);
    if (key.permissionSets.length === 0) {
      throw new Error(`managed-keys.config: key '${key.id}' has no permissionSets: grant at least one or remove it.`);
    }
    const assigned = Object.entries(key.assign) as [MintedKeyField, RuntimeSecretId][];
    if (assigned.length === 0) {
      throw new Error(`managed-keys.config: key '${key.id}' assigns no runtime secret: set assign.accessKey and/or assign.secretKey.`);
    }
    for (const [field, secretId] of assigned) {
      if (!operatorSecretIds.has(secretId)) {
        throw new Error(
          `managed-keys.config: key '${key.id}' assigns ${field} → '${secretId}', which is not an operator-managed runtime secret. ` +
            `Minted values are written out-of-band, so the target must be valueSource: 'operator' in runtime-secrets.config.`,
        );
      }
      if (seenSecretIds.has(secretId)) {
        throw new Error(`managed-keys.config: runtime secret '${secretId}' is assigned by more than one managed key.`);
      }
      seenSecretIds.add(secretId);
    }
  }
}

/** Look up a managed key by id, or undefined when none matches. */
export function managedKeyById(id: string): ManagedKeyDefinition | undefined {
  return managedKeys.find((key) => key.id === id);
}
