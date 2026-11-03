import type { ServiceName } from '../compose/compose';

export type RuntimeSecretValueSource = 'engine' | 'operator';
export type RuntimeSecretGeneration = 'manual' | 'random';

/** One runtime secret's app-owned mapping data from `runtime-secrets.config.ts`. The `id` is the config object key; `RuntimeSecretDefinition` (lib/runtime-secrets.ts) is the flattened shape. */
export interface RuntimeSecretConfig {
  /** Scaleway Secret Manager container name (kebab-case). */
  secretName: string;
  /** Human-readable purpose, surfaced in tooling and the container description. */
  description: string;
  /** Environment variable the consuming service reads the value as. */
  envVar: string;
  /** Whether deploy/health gating treats the value's absence as fatal. */
  required: boolean;
  /** `'engine'` = the engine makes the value (generated, derived, a database's connection string, a store's output); `'operator'` = the operator sets it. */
  valueSource: RuntimeSecretValueSource;
  /** `'random'` = Pulumi RandomPassword; `'manual'` = derived/hand-supplied. */
  generation: RuntimeSecretGeneration;
  /** Services that receive the secret in their machine's `.env.runtime`, which the deploy composes from the runtime folder. */
  services: readonly ServiceName[];
  /** A pulumi-owned value computed from another pulumi-owned secret's value (a public key from its private key), so the two change together. */
  derivedFrom?: RuntimeSecretDerivation;
  /**
   * A generated value "Rotate secrets" may replace: one that protects no stored data (a signing key, a secret two services share). A key that
   * encrypts or hashes stored data is left out: a new value would leave that data unreadable or unmatched. A value derived from a rotatable
   * one follows it.
   */
  rotatable?: boolean;
}

/** How a derived secret's value follows its source: the source secret's id and a pure function of the source value. */
export interface RuntimeSecretDerivation {
  secretId: string;
  derive: (sourceValue: string) => string;
}

/** Helper for `runtime-secrets.config.ts`: typed identity preserving literal keys. This module imports no registry, so the config that calls it closes no import cycle. */
export function defineRuntimeSecrets<const T extends Record<string, RuntimeSecretConfig>>(secrets: T): T {
  return secrets;
}
