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

/** The key a deploy-side bucket write authenticates with: the SCW_* pair, else the AWS_* pair of the state backend. Empty when neither is set, so the SDK's own error names the missing key. */
export function deployS3Key(env: NodeJS.ProcessEnv = process.env): { accessKey: string; secretKey: string } {
  return {
    accessKey: env.SCW_ACCESS_KEY ?? env.AWS_ACCESS_KEY_ID ?? '',
    secretKey: env.SCW_SECRET_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? '',
  };
}
