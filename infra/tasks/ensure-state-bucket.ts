import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { resolveProjectId } from '../lib/scaleway/provider-env';
import { makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { runIfMain } from '../lib/utils/is-main';

export type EnsureResult = 'exists' | 'created';

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
      // 403 is ambiguous on Scaleway (foreign-owned, missing perms, stale reservation), so CreateBucket gives the definite answer.
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
 * AccessDenied is tolerated, so a key the bucket's policy keeps from its configuration still finishes the setup's other steps.
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

  await attempt('versioning', () => s3.send(new PutBucketVersioningCommand({ Bucket: bucketName, VersioningConfiguration: { Status: 'Enabled' } })));
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
    log(`State bucket hardening skipped (${denied.join(', ')}): bucket policy reserves bucket-config writes to the admin application.`);
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

/**
 * The setup's step: make the bucket in the environment's project and harden it, on the operator key. `--check` is the deploy's: the bucket
 * must exist in the project, and nothing is made or changed, as a bucket's configuration is the apply's (plan §3.2).
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const accessKey = process.env.SCW_ACCESS_KEY;
  const secretKey = process.env.SCW_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('SCW_ACCESS_KEY and SCW_SECRET_KEY must be set');
  process.env.APP_MODE = process.env.APP_MODE ?? 'production';
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { stateBucket } = await import('../lib/stack/control-store');
  const bucketName = stateBucket(appConfig.slug);
  const region = appConfig.s3.region;

  // The key names the app's project, so the bucket lands there whatever the key's preferred project is: with a project per environment, a
  // key made for one environment sets up another. Without a project id the bucket follows the key's preferred project.
  const expectedProjectId = resolveProjectId();
  if (!expectedProjectId) console.warn("⚠ SCW_PROJECT_ID / SCW_DEFAULT_PROJECT_ID not set: the state bucket follows the key's preferred project.");

  const s3 = await makeS3Client(region, expectedProjectId ? projectAccessKey(accessKey, expectedProjectId) : accessKey, secretKey);
  if (argv.includes('--check')) {
    const found = await s3.send(new HeadBucketCommand({ Bucket: bucketName })).then(
      () => true,
      () => false,
    );
    if (!found) throw new Error(`The Pulumi state bucket '${bucketName}' is not there: the setup makes it (pnpm infra).`);
    if (expectedProjectId) await assertBucketProject(s3, bucketName, expectedProjectId);
    console.info(`Pulumi state bucket: s3://${bucketName} (${region})`);
    return;
  }
  const result = await ensureStateBucket(s3, bucketName);
  if (expectedProjectId) await assertBucketProject(s3, bucketName, expectedProjectId);
  await hardenStateBucket(s3, bucketName);
  if (result === 'exists') console.info(`Pulumi state bucket already exists: s3://${bucketName} (${region})`);
  else console.info(`Created Pulumi state bucket: s3://${bucketName} (${region})`);
}

runIfMain(import.meta.url, main);
