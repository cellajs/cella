import { GetBucketPolicyCommand } from '@aws-sdk/client-s3';
import type { EngineConfig } from '../../config/engine-config';
import { deriveInfra } from '../naming';
import { stateBucket } from '../stack/control-store';
import type { KeyPair } from './operator-identity';
import { makeS3Client, stateKeyOf } from './s3-client';

/** True when a bucket policy document admits the principal (`application_id:<id>` or `user_id:<id>`). */
export function policyAdmits(policyText: string | undefined, principal: string): boolean {
  if (!policyText) return false;
  const { Statement = [] } = JSON.parse(policyText) as { Statement?: Array<{ Principal?: unknown }> };
  return Statement.some((statement) => JSON.stringify(statement.Principal ?? '').includes(principal));
}

/** Every bucket whose policy the program writes. */
function policedBuckets(appConfig: EngineConfig): string[] {
  const { naming } = deriveInfra(appConfig);
  return [stateBucket(appConfig.slug), naming.frontendBucket, naming.publicBucket, naming.privateBucket, naming.bootDiagBucket];
}

/**
 * True when the bucket policies shut a key's bearer out, named as `user_id:<id>` or `application_id:<id>`: the key is refused a policy, or
 * reads one that does not name it (its IAM rights let it read a policy that still refuses it every object). A bucket without a policy shuts
 * nobody out. A member of the operators group is shut out until the first apply since they joined, which runs on a key the policies admit:
 * nothing in the engine can let a member in by their own key.
 */
export async function shutOutOfBuckets(opts: { appConfig: EngineConfig; projectId: string; key: KeyPair; principal: string }): Promise<boolean> {
  const key = stateKeyOf(opts.key, opts.projectId);
  const s3 = await makeS3Client(opts.appConfig.s3.region, key.accessKey, key.secretKey);
  for (const bucket of policedBuckets(opts.appConfig)) {
    const shutOut = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket })).then(
      (res) => !!res.Policy && !policyAdmits(res.Policy, opts.principal),
      (error: { name?: string; $metadata?: { httpStatusCode?: number } }) => error.$metadata?.httpStatusCode === 403 || error.name === 'AccessDenied',
    );
    if (shutOut) return true;
  }
  return false;
}
