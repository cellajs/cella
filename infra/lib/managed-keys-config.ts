import type { RuntimeSecretId } from './runtime-secrets';

/** Which half of a minted Scaleway IAM key a managed key routes into a runtime secret: a single-token key uses only `secretKey`, an access/secret pair uses both. */
export type MintedKeyField = 'accessKey' | 'secretKey';

/** One managed key's data from `managed-keys.config.ts`. The `id` is the config object key; `ManagedKeyDefinition` is the flattened shape. */
export interface ManagedKeyConfig {
  /** IAM application/policy name suffix: `<slug>-<suffix>`. Also the API-key description prefix. */
  suffix: string;
  /** Human-readable label for prompts and summaries. */
  label: string;
  /** IAM application description (shown in the Scaleway console). */
  appDescription: string;
  /** IAM policy description (shown in the Scaleway console). */
  policyDescription: string;
  /** Project-scoped permission sets granted to the minted key's policy. */
  permissionSets: readonly string[];
  /** Setup opt-in prompt. Minting is ALWAYS operator-confirmed, never silent. */
  prompt: { message: string; default: boolean };
  /** Routes each minted key half to the runtime secret that stores it, keyed by `RuntimeSecretId` so a typo is a compile error. */
  assign: Partial<Record<MintedKeyField, RuntimeSecretId>>;
}

/** Helper for `managed-keys.config.ts`: typed identity preserving literal keys. This module imports no registry, so the config that calls it closes no import cycle. */
export function defineManagedKeys<const T extends Record<string, ManagedKeyConfig>>(keys: T): T {
  return keys;
}
