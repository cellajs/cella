import { engineConfig } from '../../config/engine-config';
import { telemetrySink } from '../../config/telemetry.config';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../runtime-secrets';
import { createSecretManagerClient } from '../scaleway/scaleway-secret-manager';
import { secretPathFor } from '../scaleway/secret-paths';

/** The ingest key, or why there is none: a deploy that exports nothing says so in its log. */
export type SinkKeyLookup = { key: string } | { missing: string };

/** The Secret Manager calls the lookup makes, injectable for tests. */
export type SinkKeyClient = Pick<ReturnType<typeof createSecretManagerClient>, 'getSecretByName' | 'accessLatestValue'>;

export interface SinkKeyLookupOptions {
  slug: string;
  mode: string;
  client: SinkKeyClient;
  /** Runtime-secret registry the sink's secret is declared in; defaults to the app's. */
  secrets?: readonly RuntimeSecretDefinition[];
  secretName?: string;
}

/**
 * Read the operator-seeded telemetry ingest key. The secret lives in the folder its registry entry's consumer list
 * derives (`secretPathFor`), the same one the Pulumi program creates and the VMs read, so a change to that list moves
 * this lookup with it.
 */
export async function lookupSinkIngestKey(opts: SinkKeyLookupOptions): Promise<SinkKeyLookup> {
  const secretName = opts.secretName ?? telemetrySink.keySecretName;
  const definition = (opts.secrets ?? runtimeSecrets).find((secret) => secret.secretName === secretName);
  if (!definition) return { missing: `no runtime secret named '${secretName}' in config/runtime-secrets.config.ts` };
  const path = secretPathFor(definition, opts.slug, opts.mode);
  const secret = await opts.client.getSecretByName(secretName, path);
  if (!secret) return { missing: `secret '${secretName}' not found in ${path}; seed it with 'pnpm infra' → Manage keys & secrets` };
  const value = (await opts.client.accessLatestValue(secret.id)).trim();
  return value ? { key: value } : { missing: `secret '${secretName}' in ${path} has an empty value` };
}

/**
 * Best-effort read of the telemetry ingest key from Secret Manager, so CI deploys export telemetry without a dedicated
 * CI secret (the deploy key already has secret read access; the VM fleet reads the same secret). Which secret is the
 * app's choice (config/telemetry.config.ts).
 */
export async function sinkIngestKeyFromSecretManager(): Promise<SinkKeyLookup> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID;
  if (!secretKey || !projectId) return { missing: 'SCW_SECRET_KEY and SCW_DEFAULT_PROJECT_ID are needed to read it from Secret Manager' };
  const appConfig = engineConfig();
  const client = createSecretManagerClient({ secretKey, projectId, region: appConfig.s3.region });
  return lookupSinkIngestKey({ slug: appConfig.slug, mode: appConfig.mode, client });
}
