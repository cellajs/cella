/** The process modes (`MODE`) the backend image runs as. */
export const processModes = ['api', 'mcp', 'oauth', 'cdc', 'migrate'] as const;

export type ProcessMode = (typeof processModes)[number];

/** Secrets only some modes read; `modeSecrets` names those modes. */
export const modeSecretNames = [
  'CDC_SECRET',
  'YJS_TOKEN_PRIVATE_KEY',
  'YJS_RELAY_SECRET',
  'UNSUBSCRIBE_SECRET',
  'PII_HASH_SECRET',
  'ADMIN_EMAIL',
] as const;

export type ModeSecret = (typeof modeSecretNames)[number];

/**
 * The modes that read each mode-bound secret. A worker VM receives only the secrets its own mode reads
 * (infra/config/runtime-secrets.config.ts; the infra tests pin the two together), so the env schema requires each one
 * in its modes alone, and code reads it through `modeSecret` in env.ts. This file imports nothing, so infra can too.
 */
export const modeSecrets: Readonly<Record<ModeSecret, readonly ProcessMode[]>> = {
  // The internal listener (the CDC socket, the relay's materialize route) and the Yjs token route run in the API process.
  CDC_SECRET: ['api'],
  YJS_TOKEN_PRIVATE_KEY: ['api'],
  YJS_RELAY_SECRET: ['api'],
  UNSUBSCRIBE_SECRET: ['api', 'mcp'],
  PII_HASH_SECRET: ['api', 'mcp'],
  // Read by the admin seed, which the release companion runs with the API's secrets.
  ADMIN_EMAIL: ['api'],
};

/**
 * The mode-bound secrets a process in `values.MODE` reads and `values` lacks.
 * @param values - Environment values; an empty string counts as absent.
 * @returns The missing secret names, in table order.
 */
export function missingModeSecrets(values: { MODE: ProcessMode } & Partial<Record<ModeSecret, unknown>>): ModeSecret[] {
  return modeSecretNames.filter((name) => modeSecrets[name].includes(values.MODE) && !values[name]);
}
