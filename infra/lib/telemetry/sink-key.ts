import { engineConfig } from '../../config/engine-config';
import { telemetrySink } from '../../config/telemetry.config';
import { actionCommand } from '../operator-actions';
import { createSecretManagerClient } from '../scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../scaleway/secret-paths';

/** The ingest key, or why there is none: a deploy that exports nothing says so in its log. */
export type SinkKeyLookup = { key: string } | { missing: string };

/** The Secret Manager calls the lookup makes, injectable for tests. */
export type SinkKeyClient = Pick<ReturnType<typeof createSecretManagerClient>, 'getSecretByName' | 'accessLatestValue'>;

export interface SinkKeyLookupOptions {
  client: SinkKeyClient;
  secretName?: string;
}

/** Read the telemetry ingest key from the runtime folder, whose values the deploy key reads. */
async function lookupSinkIngestKey(opts: SinkKeyLookupOptions): Promise<SinkKeyLookup> {
  const secretName = opts.secretName ?? telemetrySink.keySecretName;
  const container = await opts.client.getSecretByName(secretName, RUNTIME_FOLDER);
  if (!container || (container.version_count ?? 0) === 0)
    return { missing: `no value of '${secretName}' in ${RUNTIME_FOLDER}; set it with \`${actionCommand('secrets')}\`` };
  const value = (await opts.client.accessLatestValue(container.id)).trim();
  return value ? { key: value } : { missing: `'${secretName}' in ${RUNTIME_FOLDER} has an empty value` };
}

/**
 * Best-effort read of the telemetry ingest key from Secret Manager, so deploys export telemetry without a key of their own: the deploy key
 * reads the runtime folder. Which secret is the app's choice (config/telemetry.config.ts).
 */
export async function sinkIngestKeyFromSecretManager(): Promise<SinkKeyLookup> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID;
  if (!secretKey || !projectId) return { missing: 'SCW_SECRET_KEY and SCW_DEFAULT_PROJECT_ID are needed to read it from Secret Manager' };
  const client = createSecretManagerClient({ secretKey, projectId, region: engineConfig.s3.region });
  return lookupSinkIngestKey({ client });
}
