import { GetBucketPolicyCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import type { KeyPair } from '../lib/scaleway/operator-identity';
import { makeS3Client, stateKeyOf } from '../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { ENGINE_FOLDER } from '../lib/scaleway/secret-paths';
import { stateBucket } from '../lib/stack/control-store';

/** Secret Manager container that holds the retired admin application's key pair, under the stack's engine folder. */
export const ADMIN_KEY_SECRET_NAME = 'admin-key';

/** True when a bucket policy document admits the given application. */
export function policyAdmits(policyText: string | undefined, applicationId: string): boolean {
  if (!policyText) return false;
  const principal = `application_id:${applicationId}`;
  const { Statement = [] } = JSON.parse(policyText) as { Statement?: Array<{ Principal?: unknown }> };
  return Statement.some((statement) => JSON.stringify(statement.Principal ?? '').includes(principal));
}

/** A bucket and the Pulumi resource that holds its policy. */
export interface PolicedBucket {
  bucket: string;
  /** The `scaleway.object.BucketPolicy` resource name in the program. */
  resource: string;
}

/** Every bucket whose policy the program writes, with that policy's resource. */
export function policedBuckets(appConfig: EngineConfig): PolicedBucket[] {
  const { naming } = deriveInfra(appConfig);
  return [
    { bucket: stateBucket(appConfig.slug), resource: 'state-bucket-policy' },
    { bucket: naming.frontendBucket, resource: 'frontend-policy' },
    { bucket: naming.publicBucket, resource: 'public-uploads-policy' },
    { bucket: naming.privateBucket, resource: 'private-uploads-policy' },
    { bucket: naming.bootDiagBucket, resource: 'boot-diag-policy' },
  ];
}

/** The policy document with a statement that admits `applicationId` to the bucket and its objects, appended to its own statements. */
export function withOperatorAdmitted(policyText: string, bucket: string, applicationId: string): string {
  const policy = JSON.parse(policyText) as { Statement?: unknown[] };
  const statement = {
    Sid: 'OperatorAdmission',
    Effect: 'Allow',
    Principal: { SCW: `application_id:${applicationId}` },
    Action: ['s3:*'],
    Resource: [bucket, `${bucket}/*`],
  };
  return JSON.stringify({ ...policy, Statement: [...(policy.Statement ?? []), statement] });
}

/**
 * True when a bucket's policy was written before the operator was admitted: the operator is refused the policy, or reads one that does not
 * name it (its IAM rights let it read a policy that still refuses it every object). A bucket without a policy shuts nobody out.
 */
async function operatorShutOut(region: string, operator: KeyPair, buckets: readonly PolicedBucket[], applicationId: string): Promise<boolean> {
  const s3 = await makeS3Client(region, operator.accessKey, operator.secretKey);
  for (const { bucket } of buckets) {
    const shutOut = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket })).then(
      (res) => !!res.Policy && !policyAdmits(res.Policy, applicationId),
      (error: { name?: string; $metadata?: { httpStatusCode?: number } }) => error.$metadata?.httpStatusCode === 403 || error.name === 'AccessDenied',
    );
    if (shutOut) return true;
  }
  return false;
}

/** The retired admin application's key from its custody secret, read with the operator key; undefined when the secret is gone. */
async function retiredAdminKey(opts: { operatorSecretKey: string; region: string; projectId: string }): Promise<KeyPair | undefined> {
  const secrets = createSecretManagerClient({ secretKey: opts.operatorSecretKey, region: opts.region, projectId: opts.projectId });
  const container = await secrets.getSecretByName(ADMIN_KEY_SECRET_NAME, ENGINE_FOLDER);
  if (!container) return undefined;
  const pair = JSON.parse(await secrets.accessLatestValue(container.id)) as Partial<KeyPair>;
  return pair.accessKey && pair.secretKey ? { accessKey: pair.accessKey, secretKey: pair.secretKey } : undefined;
}

/**
 * Let the operator into the buckets of a stack whose bucket policies were written before it was admitted, once, before anything of the run
 * reads the state. A bucket policy shuts out every principal it does not name, the Owner included, so only the retired admin application,
 * which those policies name, can write them: its key comes from its custody secret, which the operator reads, and it appends a statement
 * that admits the operator to each policy that lacks one. The policies are written through S3, not a targeted `pulumi up`: a targeted run
 * fails on a stack whose provider version changed since its last update. The apply after it writes the program's policies.
 * Returns the resources written, empty when the operator was admitted already. Throws when the policies shut the operator out and the
 * admin key is gone, which nothing in the engine can repair.
 */
export async function admitOperatorToBuckets(opts: {
  appConfig: EngineConfig;
  mode: string;
  projectId: string;
  operator: KeyPair & { applicationId: string };
}): Promise<string[]> {
  const { appConfig, projectId } = opts;
  const region = appConfig.s3.region;
  const buckets = policedBuckets(appConfig);
  const operatorState = stateKeyOf(opts.operator, projectId);
  if (!(await operatorShutOut(region, operatorState, buckets, opts.operator.applicationId))) return [];

  const admin = await retiredAdminKey({ operatorSecretKey: opts.operator.secretKey, region, projectId });
  if (!admin) {
    throw new Error(
      `bucket policies of ${opts.mode} shut the operator out, and the admin application's key (${ADMIN_KEY_SECRET_NAME} under ${ENGINE_FOLDER}) is gone: only a principal they name can rewrite them`,
    );
  }
  const adminKey = stateKeyOf(admin, projectId);
  const s3 = await makeS3Client(region, adminKey.accessKey, adminKey.secretKey);
  const admitted: string[] = [];
  for (const { bucket, resource } of buckets) {
    // A bucket that is absent or whose policy the admin cannot read is left to the apply.
    const policy = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket })).then(
      (res) => res.Policy,
      () => undefined,
    );
    if (!policy || policyAdmits(policy, opts.operator.applicationId)) continue;
    await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: withOperatorAdmitted(policy, bucket, opts.operator.applicationId) }));
    admitted.push(resource);
  }
  return admitted;
}
