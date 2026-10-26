import { engineConfig } from '../../config/engine-config';
import { telemetrySink } from '../../config/telemetry.config';
import { actionCommand } from '../operator-actions';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../runtime-secrets';
import { createSecretManagerClient } from '../scaleway/scaleway-secret-manager';
import { secretCopyContainers } from '../scaleway/secret-copies';
import { deployFolderPath } from '../scaleway/secret-paths';

/** The ingest key, or why there is none: a deploy that exports nothing says so in its log. */
export type SinkKeyLookup = { key: string } | { missing: string };

/** The Secret Manager calls the lookup makes, injectable for tests. */
export type SinkKeyClient = Pick<ReturnType<typeof createSecretManagerClient>, 'getSecretByName' | 'accessLatestValue'>;

export interface SinkKeyLookupOptions {
  slug: string;
  mode: string;
  client: SinkKeyClient;
  secretName?: string;
}

/**
 * Read the telemetry ingest key the deploy may read: its copy in the deploy folder, the one folder whose values the deploy key reads. The apply
 * keeps that copy equal to the runtime copies (`syncDeployTelemetryKey`).
 */
export async function lookupSinkIngestKey(opts: SinkKeyLookupOptions): Promise<SinkKeyLookup> {
  const secretName = opts.secretName ?? telemetrySink.keySecretName;
  const path = deployFolderPath(opts.slug, opts.mode);
  const container = await opts.client.getSecretByName(secretName, path);
  if (!container)
    return { missing: `no copy of '${secretName}' in ${path}; set it with \`${actionCommand('secrets')}\`, then an apply copies it there` };
  const value = (await opts.client.accessLatestValue(container.id)).trim();
  return value ? { key: value } : { missing: `the copy of '${secretName}' in ${path} has an empty value` };
}

/** The Secret Manager calls the copy into the deploy folder makes. */
export type SinkKeySyncClient = SinkKeyClient & Pick<ReturnType<typeof createSecretManagerClient>, 'ensureSecret' | 'putSecretValue'>;

/**
 * Keep the deploy folder's copy of the telemetry ingest key equal to the runtime copies, which the operator sets: the deploy reads values in the
 * deploy folder only. `absent` when no runtime copy holds a value, `unchanged` when the copy is already equal.
 */
export async function syncDeployTelemetryKey(opts: {
  client: SinkKeySyncClient;
  slug: string;
  mode: string;
  secrets?: readonly RuntimeSecretDefinition[];
}): Promise<'written' | 'unchanged' | 'absent'> {
  const definition = (opts.secrets ?? runtimeSecrets).find((secret) => secret.secretName === telemetrySink.keySecretName);
  if (!definition) return 'absent';
  const source = (await secretCopyContainers(opts.client, definition, opts.slug, opts.mode)).find((copy) => (copy.container?.version_count ?? 0) > 0);
  if (!source?.container) return 'absent';
  const value = await opts.client.accessLatestValue(source.container.id);
  const path = deployFolderPath(opts.slug, opts.mode);
  const existing = await opts.client.getSecretByName(definition.secretName, path);
  if (existing && (existing.version_count ?? 0) > 0 && (await opts.client.accessLatestValue(existing.id)) === value) return 'unchanged';
  const container =
    existing ??
    (await opts.client.ensureSecret({ name: definition.secretName, path, description: 'Copy of the telemetry ingest key the deploy reads' }));
  await opts.client.putSecretValue({ secretId: container.id, value, description: 'Copied from a runtime copy', disablePrevious: true });
  return 'written';
}

/**
 * Best-effort read of the telemetry ingest key from Secret Manager, so deploys export telemetry without a key of their own: the
 * deploy key reads the deploy folder's copy. Which secret is the app's choice (config/telemetry.config.ts).
 */
export async function sinkIngestKeyFromSecretManager(): Promise<SinkKeyLookup> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID;
  if (!secretKey || !projectId) return { missing: 'SCW_SECRET_KEY and SCW_DEFAULT_PROJECT_ID are needed to read it from Secret Manager' };
  const appConfig = engineConfig();
  const client = createSecretManagerClient({ secretKey, projectId, region: appConfig.s3.region });
  return lookupSinkIngestKey({ slug: appConfig.slug, mode: appConfig.mode, client });
}
