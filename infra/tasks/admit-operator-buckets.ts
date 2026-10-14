import { spawnSync } from 'node:child_process';
import { GetBucketPolicyCommand } from '@aws-sdk/client-s3';
import type { KeyPair } from '../lib/scaleway/operator-identity';
import { makeS3Client } from '../lib/scaleway/s3-client';
import { infraDir } from '../lib/utils/paths';

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

/**
 * Let the operator into the buckets of a stack whose bucket policies were written before the operator was admitted. The operator cannot
 * refresh or change a bucket whose policy does not admit it, and the state bucket's policy is privileged, so a deploy never changes it: the
 * admin application key, which every policy admits, writes the policies that lack the operator in one targeted `pulumi up`. Returns the
 * resources it wrote, empty when nothing was needed. A stack set up after the operator was admitted never needs it.
 */
export async function admitOperatorToBuckets(opts: {
  stack: string;
  buckets: readonly PolicedBucket[];
  region: string;
  operatorApplicationId: string;
  admin: KeyPair;
  env: NodeJS.ProcessEnv;
}): Promise<string[]> {
  const s3 = await makeS3Client(opts.region, opts.admin.accessKey, opts.admin.secretKey);
  const lacking: string[] = [];
  for (const { bucket, resource } of opts.buckets) {
    const policy = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket })).then(
      (res) => res.Policy,
      () => undefined,
    );
    if (policy && !policyAdmits(policy, opts.operatorApplicationId)) lacking.push(resource);
  }
  if (lacking.length === 0) return [];
  const shortStack = opts.stack.split('/').pop() ?? opts.stack;
  const targets = lacking.flatMap((resource) => [
    '--target',
    `urn:pulumi:${shortStack}::infra::scaleway:object/bucketPolicy:BucketPolicy::${resource}`,
  ]);
  const run = spawnSync('pulumi', ['up', '--yes', '--non-interactive', '--skip-preview', ...targets, '--stack', opts.stack], {
    cwd: infraDir,
    env: { ...opts.env, SCW_ACCESS_KEY: opts.admin.accessKey, SCW_SECRET_KEY: opts.admin.secretKey },
    stdio: 'inherit',
  });
  if (run.status !== 0) throw new Error(`the targeted update of the bucket policies exited ${run.status}`);
  return lacking;
}
