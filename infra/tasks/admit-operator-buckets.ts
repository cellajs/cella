import { spawnSync } from 'node:child_process';
import { GetBucketPolicyCommand } from '@aws-sdk/client-s3';
import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import type { KeyPair } from '../lib/scaleway/operator-identity';
import { ADMISSION_RUN_ENV } from '../lib/scaleway/principals';
import { buildProviderEnv } from '../lib/scaleway/provider-env';
import { makeS3Client, stateKeyOf } from '../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { engineSecretPath } from '../lib/scaleway/secret-paths';
import { stateBackendUrl, stateBucket } from '../lib/stack/control-store';
import { infraDir } from '../lib/utils/paths';

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

/** The resources whose bucket `key` reads a policy of that does not admit `applicationId`. A bucket that is absent or unreadable is left out. */
async function lackingPolicies(region: string, key: KeyPair, buckets: readonly PolicedBucket[], applicationId: string): Promise<string[]> {
  const s3 = await makeS3Client(region, key.accessKey, key.secretKey);
  const lacking: string[] = [];
  for (const { bucket, resource } of buckets) {
    const policy = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket })).then(
      (res) => res.Policy,
      () => undefined,
    );
    if (policy && !policyAdmits(policy, applicationId)) lacking.push(resource);
  }
  return lacking;
}

/** True when the operator is refused a bucket's policy: a policy written before the operator was admitted shuts it out. */
async function operatorShutOut(region: string, operator: KeyPair, buckets: readonly PolicedBucket[]): Promise<boolean> {
  const s3 = await makeS3Client(region, operator.accessKey, operator.secretKey);
  for (const { bucket } of buckets) {
    const refused = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket })).then(
      () => false,
      (error: { name?: string; $metadata?: { httpStatusCode?: number } }) => error.$metadata?.httpStatusCode === 403 || error.name === 'AccessDenied',
    );
    if (refused) return true;
  }
  return false;
}

/** The retired admin application's key from its custody secret, read with the operator key; undefined when the secret is gone. */
async function retiredAdminKey(opts: {
  operatorSecretKey: string;
  region: string;
  projectId: string;
  slug: string;
  mode: string;
}): Promise<KeyPair | undefined> {
  const secrets = createSecretManagerClient({ secretKey: opts.operatorSecretKey, region: opts.region, projectId: opts.projectId });
  const container = await secrets.getSecretByName(ADMIN_KEY_SECRET_NAME, engineSecretPath(opts.slug, opts.mode));
  if (!container) return undefined;
  const pair = JSON.parse(await secrets.accessLatestValue(container.id)) as Partial<KeyPair>;
  return pair.accessKey && pair.secretKey ? { accessKey: pair.accessKey, secretKey: pair.secretKey } : undefined;
}

/**
 * Let the operator into the buckets of a stack whose bucket policies were written before it was admitted, once, before anything of the run
 * reads the state. A bucket policy shuts out every principal it does not name, the Owner included, so only the retired admin application,
 * which those policies name, can write them: its key comes from its custody secret, which the operator reads, and a targeted `pulumi up`
 * writes the policies that lack the operator. That run keeps the admin's statements (`ADMISSION_RUN_ENV`); the apply after it drops them.
 * Returns the resources written, empty when the operator was admitted already. Throws when the policies shut the operator out and the
 * admin key is gone, which nothing in the engine can repair.
 */
export async function admitOperatorToBuckets(opts: {
  appConfig: EngineConfig;
  mode: string;
  projectId: string;
  organizationId: string;
  stack: string;
  operator: KeyPair & { applicationId: string };
  passphrase: string;
}): Promise<string[]> {
  const { appConfig, projectId } = opts;
  const region = appConfig.s3.region;
  const buckets = policedBuckets(appConfig);
  const operatorState = stateKeyOf(opts.operator, projectId);
  if (!(await operatorShutOut(region, operatorState, buckets))) return [];

  const admin = await retiredAdminKey({ operatorSecretKey: opts.operator.secretKey, region, projectId, slug: appConfig.slug, mode: opts.mode });
  if (!admin) {
    throw new Error(
      `bucket policies of ${opts.mode} shut the operator out, and the admin application's key (${ADMIN_KEY_SECRET_NAME} under ${engineSecretPath(appConfig.slug, opts.mode)}) is gone: only a principal they name can rewrite them`,
    );
  }
  const lacking = await lackingPolicies(region, stateKeyOf(admin, projectId), buckets, opts.operator.applicationId);
  if (lacking.length === 0) return [];

  const env = {
    ...buildProviderEnv(infraDir, { ...admin, projectId, passphrase: opts.passphrase, organizationId: opts.organizationId }),
    [ADMISSION_RUN_ENV]: '1',
  };
  const shortStack = opts.stack.split('/').pop() ?? opts.stack;
  const targets = lacking.flatMap((resource) => [
    '--target',
    `urn:pulumi:${shortStack}::infra::scaleway:object/bucketPolicy:BucketPolicy::${resource}`,
  ]);
  const login = spawnSync('pulumi', ['login', stateBackendUrl(stateBucket(appConfig.slug), region)], {
    cwd: infraDir,
    env,
    stdio: 'inherit',
  });
  if (login.status !== 0) throw new Error(`pulumi login with the admin application key exited ${login.status}`);
  const run = spawnSync('pulumi', ['up', '--yes', '--non-interactive', '--skip-preview', ...targets, '--stack', opts.stack], {
    cwd: infraDir,
    env,
    stdio: 'inherit',
  });
  if (run.status !== 0) throw new Error(`the targeted update of the bucket policies exited ${run.status}`);
  return lacking;
}
