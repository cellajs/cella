import type { S3Client } from '@aws-sdk/client-s3';
import { scwS3Endpoint } from './scw-fetch';

/**
 * An S3 client for a Scaleway bucket: explicit key, regional endpoint, virtual-host addressing. The SDK loads lazily so the
 * Pulumi plan path and the CLI menu do not pay for it.
 */
export async function makeS3Client(region: string, accessKey: string, secretKey: string): Promise<S3Client> {
  const { S3Client: Client } = await import('@aws-sdk/client-s3');
  return new Client({
    region,
    endpoint: scwS3Endpoint(region),
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  });
}

/**
 * The access key that names one project to Object Storage: `<access key>@<project id>`. Object Storage works in a key's preferred project
 * unless the key names another one this way. A key with rights in several projects then reaches the buckets of each, and a new bucket lands
 * in the project named. A key made for another environment's project needs it; for a key whose preferred project is this one it changes nothing.
 */
export function projectAccessKey(accessKey: string, projectId: string): string {
  return accessKey.includes('@') ? accessKey : `${accessKey}@${projectId}`;
}

/** The state side of a run: the same key, naming the environment's project to Object Storage. */
export function stateKeyOf(key: { accessKey: string; secretKey: string }, projectId: string): { accessKey: string; secretKey: string } {
  return { accessKey: projectAccessKey(key.accessKey, projectId), secretKey: key.secretKey };
}

/** The key a deploy-side bucket write authenticates with: the SCW_* pair, else the AWS_* pair of the state backend. Empty when neither is set, so the SDK's own error names the missing key. */
export function deployS3Key(env: NodeJS.ProcessEnv = process.env): { accessKey: string; secretKey: string } {
  return { accessKey: env.SCW_ACCESS_KEY ?? env.AWS_ACCESS_KEY_ID ?? '', secretKey: env.SCW_SECRET_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? '' };
}
