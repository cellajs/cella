import { engineConfig } from '../../config/engine-config';
import { telemetrySink } from '../../config/telemetry.config';
import { createSecretManagerClient } from '../scaleway/scaleway-secret-manager';
import { secretManagerPath } from '../scaleway/secret-paths';

/**
 * Best-effort read of the operator-seeded telemetry ingest key from Secret
 * Manager, so CI deploys export telemetry without a dedicated CI secret (the
 * deploy key already has secret read access; the VM fleet reads the same
 * secret). Which secret is the app's choice (config/telemetry.config.ts).
 * Returns undefined when credentials are absent or the secret is not seeded.
 */
export async function sinkIngestKeyFromSecretManager(): Promise<string | undefined> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID;
  if (!secretKey || !projectId) return undefined;
  const appConfig = engineConfig();
  const client = createSecretManagerClient({ secretKey, projectId, region: appConfig.s3.region });
  const secret = await client.getSecretByName(
    telemetrySink.keySecretName,
    secretManagerPath(appConfig.slug, appConfig.mode),
  );
  if (!secret) return undefined;
  const value = (await client.accessLatestValue(secret.id)).trim();
  return value || undefined;
}
