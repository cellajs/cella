import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env';
import { type ScwAuth, scwFetch } from '../lib/scaleway/scw-fetch';
import { isMain } from '../lib/utils/is-main';

export type EnsureResult = 'exists' | 'created';

/**
 * Report when an API key's preferred project would place the state bucket outside CI reach.
 * Scaleway Object Storage follows `default_project_id` regardless of cross-project IAM grants.
 */
export function keyProjectMismatch(
  keyProjectId: string,
  expectedProjectId: string,
  accessKey: string,
): string | undefined {
  if (keyProjectId === expectedProjectId) return undefined;
  return (
    `API key ${accessKey} has preferred project ${keyProjectId}, but this app deploys to project ${expectedProjectId}. ` +
    `Scaleway Object Storage follows the key's preferred project, so the state bucket would land out of reach of the CI deploy key. ` +
    `Fix: Scaleway console → IAM → API keys → ${accessKey} → change the preferred project, or ` +
    `PATCH https://api.scaleway.com/iam/v1alpha1/api-keys/${accessKey} {"default_project_id":"${expectedProjectId}"}, then re-run.`
  );
}

/** The key's own `default_project_id`, via IAM self-inspection. */
export async function keyPreferredProject(auth: ScwAuth, accessKey: string): Promise<string> {
  const key = await scwFetch<{ default_project_id: string }>(
    auth,
    'GET',
    `https://api.scaleway.com/iam/v1alpha1/api-keys/${accessKey}`,
  );
  return key.default_project_id;
}

/**
 * 'exists' when the bucket is already present, including an ambiguous HEAD 403 whose CreateBucket reports BucketAlreadyOwnedByYou; 'created' on a fresh creation.
 * Throws on every other error, including the fatal "name taken by another account".
 */
export async function ensureStateBucket(s3: S3Client, bucketName: string): Promise<EnsureResult> {
  let headWasAmbiguous403 = false;
  const headResult = await s3
    .send(new HeadBucketCommand({ Bucket: bucketName }))
    .then(() => true)
    .catch((err: { $metadata?: { httpStatusCode?: number } }) => {
      const status = err.$metadata?.httpStatusCode;
      // 403 is ambiguous on Scaleway (foreign-owned, missing perms, stale reservation), so CreateBucket gives the authoritative answer.
      if (status === 403) {
        headWasAmbiguous403 = true;
        return false;
      }
      if (status === 404 || status === 301) return false;
      throw err;
    });

  if (headResult) return 'exists';

  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    return 'created';
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === 'BucketAlreadyOwnedByYou') return 'exists';
    if (name === 'BucketAlreadyExists' && headWasAmbiguous403) return 'exists';
    if (name === 'BucketAlreadyExists') {
      throw new Error(
        `Bucket name "${bucketName}" is taken by another account, or by another PROJECT in this organization: ` +
          `Scaleway S3 follows the key's preferred project, so a bucket created with a differently-pointed key is unreachable from this one. ` +
          `Check the bucket's project in the console; otherwise pick a different slug in shared/config/config.default.ts.`,
      );
    }
    throw err;
  }
}

/** Days a noncurrent state-file version is kept before lifecycle expiry. */
export const NONCURRENT_VERSION_RETENTION_DAYS = 90;

/**
 * Converge the state bucket onto its hardened configuration: versioning so every checkpoint write is recoverable, SSE-ONE default encryption (AES-256,
 * Scaleway-managed keys), and a lifecycle rule bounding noncurrent-version growth. Idempotent, so pre-existing buckets converge too.
 * AccessDenied is tolerated: once resources/state-bucket-policy.ts is applied, bucket-config writes are reserved to the operator principal and the CI key's attempt 403s.
 */
export async function hardenStateBucket(
  s3: S3Client,
  bucketName: string,
  log: (msg: string) => void = (msg) => console.info(msg),
): Promise<{ applied: string[]; denied: string[] }> {
  const applied: string[] = [];
  const denied: string[] = [];
  const attempt = async (label: string, run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
      applied.push(label);
    } catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 403) {
        denied.push(label);
        return;
      }
      throw err;
    }
  };

  await attempt('versioning', () =>
    s3.send(new PutBucketVersioningCommand({ Bucket: bucketName, VersioningConfiguration: { Status: 'Enabled' } })),
  );
  await attempt('encryption', () =>
    s3.send(
      new PutBucketEncryptionCommand({
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
        },
      }),
    ),
  );
  await attempt('lifecycle', () =>
    s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucketName,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'expire-noncurrent-state-versions',
              Status: 'Enabled',
              Filter: { Prefix: '' },
              NoncurrentVersionExpiration: { NoncurrentDays: NONCURRENT_VERSION_RETENTION_DAYS },
            },
            {
              ID: 'purge-expired-delete-markers',
              Status: 'Enabled',
              Filter: { Prefix: '' },
              Expiration: { ExpiredObjectDeleteMarker: true },
            },
          ],
        },
      }),
    ),
  );

  if (applied.length > 0) log(`State bucket hardening applied: ${applied.join(', ')}`);
  if (denied.length > 0) {
    log(
      `State bucket hardening skipped (${denied.join(', ')}): bucket policy reserves bucket-config writes to the operator principal.`,
    );
  }
  return { applied, denied };
}

/**
 * Post-condition: the bucket this key sees must live in the expected project, catching a pre-existing bucket in the wrong project that the key-only preflight cannot.
 * ListBuckets' Owner ID is the project the key operates in, and the bucket must appear in the listing.
 */
export async function assertBucketProject(s3: S3Client, bucketName: string, expectedProjectId: string): Promise<void> {
  const listing = await s3.send(new ListBucketsCommand({}));
  const ownerId = listing.Owner?.ID ?? '';
  if (!ownerId.startsWith(expectedProjectId)) {
    throw new Error(
      `State bucket owner project is '${ownerId}' but the app deploys to '${expectedProjectId}': the key's preferred project points elsewhere. See the remedy in the preflight error above (IAM → API keys → preferred project).`,
    );
  }
  if (!listing.Buckets?.some((bucket) => bucket.Name === bucketName)) {
    throw new Error(
      `State bucket '${bucketName}' is not visible in project ${expectedProjectId}: it exists in another project of this organization (created with a key whose preferred project pointed elsewhere). Migrate the state or rename the bucket derivation (lib/stack/control-store.ts).`,
    );
  }
}

export async function main(): Promise<void> {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const accessKey = process.env.SCW_ACCESS_KEY;
  const secretKey = process.env.SCW_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('SCW_ACCESS_KEY and SCW_SECRET_KEY must be set');
  process.env.APP_MODE = process.env.APP_MODE ?? 'production';
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { stateBucket } = await import('../lib/stack/control-store');
  const bucketName = stateBucket(appConfig.slug);
  const region = appConfig.s3.region;

  // Preflight: refuse to touch the state bucket with a key pointed at the wrong project (see keyProjectMismatch). Skipped when the environment carries no expected project id.
  const expectedProjectId = resolveProjectId();
  if (expectedProjectId) {
    const keyProject = await keyPreferredProject({ secretKey }, accessKey);
    const mismatch = keyProjectMismatch(keyProject, expectedProjectId, accessKey);
    if (mismatch) throw new Error(mismatch);
  } else {
    console.warn('⚠ SCW_PROJECT_ID / SCW_DEFAULT_PROJECT_ID not set: skipping the key-preferred-project preflight.');
  }

  const s3 = new S3Client({
    region,
    endpoint: `https://s3.${region}.scw.cloud`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  });
  const result = await ensureStateBucket(s3, bucketName);
  if (expectedProjectId) await assertBucketProject(s3, bucketName, expectedProjectId);
  await hardenStateBucket(s3, bucketName);
  if (result === 'exists') console.info(`Pulumi state bucket already exists: s3://${bucketName} (${region})`);
  else console.info(`Created Pulumi state bucket: s3://${bucketName} (${region})`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
