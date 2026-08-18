import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { isMain } from '../lib/utils/is-main';

/** One key-vs-action probe and whether its outcome matched the policy expectation. */
export interface PolicyCheck {
  name: string;
  expected: 'allowed' | 'denied';
  ok: boolean;
  detail: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** True when an S3 error is an authorization denial (403 / AccessDenied), not a transport or shape error. */
export function isAccessDenied(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e?.$metadata?.httpStatusCode === 403 || e?.name === 'AccessDenied' || e?.Code === 'AccessDenied';
}

/** Record a check that must succeed; a failure means the key lost access the policy is meant to keep. */
export async function expectAllowed(name: string, run: () => Promise<unknown>): Promise<PolicyCheck> {
  try {
    await run();
    return { name, expected: 'allowed', ok: true, detail: 'succeeded as expected' };
  } catch (err) {
    return { name, expected: 'allowed', ok: false, detail: `expected success but failed: ${errMessage(err)}` };
  }
}

/**
 * Record a check that must be denied. A success means the policy is not effective (the whole
 * point of H3). A non-403 error counts as a failure: the call was not authoritatively refused,
 * so the outcome is inconclusive and reported as failing to force a look.
 */
export async function expectDenied(name: string, run: () => Promise<unknown>): Promise<PolicyCheck> {
  try {
    await run();
    return {
      name,
      expected: 'denied',
      ok: false,
      detail: 'expected AccessDenied but the call SUCCEEDED: policy is not effective',
    };
  } catch (err) {
    if (isAccessDenied(err)) return { name, expected: 'denied', ok: true, detail: 'denied as expected (403)' };
    return { name, expected: 'denied', ok: false, detail: `non-403 error, inconclusive: ${errMessage(err)}` };
  }
}

export interface ValidateOptions {
  operatorS3: S3Client;
  ciS3: S3Client;
  bucket: string;
  probeKey: string;
  log?: (msg: string) => void;
}

/**
 * Drive the H3 probe against the live bucket and return every check: the operator principal must
 * keep full read/write, and the CI deploy key must retain read/write plus plain (recoverable)
 * DeleteObject while being denied `s3:DeleteObjectVersion` and `s3:PutBucketVersioning`. The probe
 * object lives under a dedicated prefix and is removed in a best-effort cleanup that also restores
 * versioning to Enabled, so a stray success on the PutBucketVersioning denial check cannot leave
 * the bucket with versioning suspended.
 */
export async function validateStateBucketPolicy(opts: ValidateOptions): Promise<PolicyCheck[]> {
  const { operatorS3, ciS3, bucket, probeKey } = opts;
  const log = opts.log ?? ((msg: string) => console.info(msg));
  const checks: PolicyCheck[] = [];

  // Operator seeds two versions so a concrete noncurrent version exists for the CI denial check.
  const put1 = await operatorS3.send(new PutObjectCommand({ Bucket: bucket, Key: probeKey, Body: 'probe-v1' }));
  const noncurrentVersionId = put1.VersionId;
  await operatorS3.send(new PutObjectCommand({ Bucket: bucket, Key: probeKey, Body: 'probe-v2' }));

  // (b) Operator keeps full read/write.
  checks.push(await expectAllowed('operator: ListBucket', () => operatorS3.send(new ListBucketsCommand({}))));
  checks.push(
    await expectAllowed('operator: GetObject', () =>
      operatorS3.send(new GetObjectCommand({ Bucket: bucket, Key: probeKey })),
    ),
  );
  checks.push(
    await expectAllowed('operator: PutObject', () =>
      operatorS3.send(new PutObjectCommand({ Bucket: bucket, Key: probeKey, Body: 'probe-op-write' })),
    ),
  );

  // CI keeps exactly what the Pulumi backend needs.
  checks.push(await expectAllowed('ci: ListBucket', () => ciS3.send(new ListBucketsCommand({}))));
  checks.push(
    await expectAllowed('ci: GetBucketVersioning', () => ciS3.send(new GetBucketVersioningCommand({ Bucket: bucket }))),
  );
  checks.push(
    await expectAllowed('ci: GetObject', () => ciS3.send(new GetObjectCommand({ Bucket: bucket, Key: probeKey }))),
  );
  checks.push(
    await expectAllowed('ci: PutObject (state write)', () =>
      ciS3.send(new PutObjectCommand({ Bucket: bucket, Key: probeKey, Body: 'probe-ci-write' })),
    ),
  );
  // Plain DeleteObject on a versioned bucket is a recoverable delete marker; CI is allowed this.
  checks.push(
    await expectAllowed('ci: DeleteObject (recoverable marker)', () =>
      ciS3.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey })),
    ),
  );

  // (c) The core H3 assertions: CI cannot destroy version history or suspend versioning.
  // A DeleteObject carrying a VersionId is the S3 API for a permanent version delete and requires
  // the s3:DeleteObjectVersion action the policy withholds from CI.
  if (noncurrentVersionId) {
    checks.push(
      await expectDenied('ci: DeleteObjectVersion (must be denied)', () =>
        ciS3.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey, VersionId: noncurrentVersionId })),
      ),
    );
  } else {
    checks.push({
      name: 'ci: DeleteObjectVersion (must be denied)',
      expected: 'denied',
      ok: false,
      detail: 'could not obtain a probe VersionId (is versioning enabled on the bucket?), check skipped',
    });
  }
  checks.push(
    await expectDenied('ci: PutBucketVersioning (must be denied)', () =>
      ciS3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Suspended' } })),
    ),
  );

  // Best-effort cleanup with the operator key: purge every probe version + delete marker, then
  // restore versioning to Enabled in case the CI suspend attempt unexpectedly went through.
  try {
    const listed = await operatorS3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: probeKey }));
    for (const v of [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])]) {
      if (v.Key && v.VersionId)
        await operatorS3.send(new DeleteObjectCommand({ Bucket: bucket, Key: v.Key, VersionId: v.VersionId }));
    }
    await operatorS3.send(
      new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }),
    );
  } catch (err) {
    log(`⚠ cleanup incomplete for ${probeKey}: ${errMessage(err)}`);
  }

  return checks;
}

function makeS3(region: string, accessKeyId: string, secretAccessKey: string): S3Client {
  return new S3Client({
    region,
    endpoint: `https://s3.${region}.scw.cloud`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

export async function main(): Promise<void> {
  const ciAccess = process.env.SCW_ACCESS_KEY;
  const ciSecret = process.env.SCW_SECRET_KEY;
  const opAccess = process.env.SCW_OPERATOR_ACCESS_KEY;
  const opSecret = process.env.SCW_OPERATOR_SECRET_KEY;
  if (!ciAccess || !ciSecret) throw new Error('SCW_ACCESS_KEY and SCW_SECRET_KEY (the CI deploy key) must be set');
  if (!opAccess || !opSecret) {
    throw new Error(
      'SCW_OPERATOR_ACCESS_KEY and SCW_OPERATOR_SECRET_KEY must be set (an API key on the operator IAM application)',
    );
  }

  // Defaults to the staging stack: H3 validates the policy on staging before production cutover.
  process.env.APP_MODE = process.env.APP_MODE ?? 'staging';
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { stateBucket } = await import('../lib/stack/control-store');
  const bucket = stateBucket(appConfig.slug);
  const region = appConfig.s3.region;

  const probeKey = `.policy-validation-probe/${crypto.randomUUID()}`;
  console.info(`Validating state-bucket policy on s3://${bucket} (${region})`);
  console.info(`  CI key:       ${ciAccess}`);
  console.info(`  Operator key: ${opAccess}`);
  console.info(`  Probe object: ${probeKey}\n`);

  const checks = await validateStateBucketPolicy({
    operatorS3: makeS3(region, opAccess, opSecret),
    ciS3: makeS3(region, ciAccess, ciSecret),
    bucket,
    probeKey,
  });

  for (const c of checks) {
    console.info(`${c.ok ? '✓' : '✗'} [${c.expected}] ${c.name}: ${c.detail}`);
  }
  const failures = checks.filter((c) => !c.ok);
  if (failures.length > 0) {
    console.error(
      `\n✗ ${failures.length} of ${checks.length} checks failed: the state-bucket policy is NOT validated.`,
    );
    process.exit(1);
  }
  console.info(`\n✓ All ${checks.length} checks passed: state-bucket policy validated (H3 (b) + (c)).`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
