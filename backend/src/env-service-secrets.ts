/** The services the backend image runs as (`SERVICE`): the API, a worker of its own, or the release companion. */
export const processServices = ['api', 'mcp', 'oauth', 'jobs', 'migrate'] as const;

export type ProcessService = (typeof processServices)[number];

/** Secrets only some services read; `serviceSecrets` names those services. */
const serviceSecretNames = [
  'CDC_SECRET',
  'YJS_TOKEN_PRIVATE_KEY',
  'YJS_RELAY_SECRET',
  'UNSUBSCRIBE_SECRET',
  'DATA_HASH_SECRET',
  'ADMIN_EMAIL',
] as const;

export type ServiceSecret = (typeof serviceSecretNames)[number];

/**
 * The services that read each service-bound secret. A worker VM receives only the secrets its own service reads
 * (`runtimeSecrets` in cella/infra/description.yml; cella/tests/runtime-secrets.test.ts pins the two together). The
 * env schema requires each one in its services alone, and code reads it through `serviceSecret` in env.ts. This file
 * imports nothing, so that test can import it too.
 */
export const serviceSecrets: Readonly<Record<ServiceSecret, readonly ProcessService[]>> = {
  // The internal listener (the CDC socket, the relay's materialize route) and the Yjs token route run in the API process.
  CDC_SECRET: ['api'],
  YJS_TOKEN_PRIVATE_KEY: ['api'],
  YJS_RELAY_SECRET: ['api'],
  // The digest's unsubscribe links are signed where the digest runs: the jobs worker.
  UNSUBSCRIBE_SECRET: ['api', 'mcp', 'jobs'],
  // The rate limiter keys an IP or address by its pseudonym (the OAuth face limits metadata fetches per IP); tokens hash under it.
  DATA_HASH_SECRET: ['api', 'mcp', 'oauth'],
  // Read by the admin seed alone, which the release companion (SERVICE=migrate) runs with the API's secrets.
  ADMIN_EMAIL: ['migrate'],
};

/**
 * The service-bound secrets a process running `values.SERVICE` reads and `values` lacks.
 * @param values - Environment values; an empty string counts as absent.
 * @returns The missing secret names, in table order.
 */
export function missingServiceSecrets(values: { SERVICE: ProcessService } & Partial<Record<ServiceSecret, unknown>>): ServiceSecret[] {
  return serviceSecretNames.filter((name) => serviceSecrets[name].includes(values.SERVICE) && !values[name]);
}
