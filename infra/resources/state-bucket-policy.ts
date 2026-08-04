import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { stateBucket } from '../lib/stack/control-store';
import { region } from '../pulumi-context';
import { adminApplicationId, ciDeployApplicationId } from './vm-iam';

const appConfig = engineConfig();

const stateBucketName = stateBucket(appConfig.slug);

/**
 * Restricted, deny-by-default policy on the Pulumi STATE bucket (created
 * imperatively in tasks/ensure-state-bucket.ts, which also enables versioning
 * and SSE-ONE encryption). CI gets exactly what the Pulumi backend needs:
 * list, read/write state objects, and plain delete (lock files; on the
 * versioned bucket a delete is a recoverable marker), but neither
 * `s3:DeleteObjectVersion` nor `s3:PutBucketVersioning`, so a leaked or
 * misused CI key cannot destroy version history or suspend versioning. The
 * admin application keeps `s3:*` for recovery and state surgery; its
 * statement is dropped (with a warning from vm-iam.ts) when the app does not
 * exist yet, so a missing admin principal never blocks a deploy. The org
 * Owner can always repair or delete this policy regardless (inherent right).
 */
export const stateBucketPolicy = new scaleway.object.BucketPolicy('state-bucket-policy', {
  bucket: stateBucketName,
  region,
  policy: pulumi.all([ciDeployApplicationId, adminApplicationId]).apply(([ciId, adminId]) =>
    JSON.stringify({
      Version: '2023-04-17',
      Statement: [
        {
          Sid: 'DeployStateAccess',
          Effect: 'Allow',
          Principal: { SCW: `application_id:${ciId}` },
          Action: ['s3:ListBucket', 's3:GetBucketVersioning', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
          Resource: [stateBucketName, `${stateBucketName}/*`],
        },
        ...(adminId
          ? [
              {
                Sid: 'AdminStateAccess',
                Effect: 'Allow',
                Principal: { SCW: `application_id:${adminId}` },
                Action: ['s3:*'],
                Resource: [stateBucketName, `${stateBucketName}/*`],
              },
            ]
          : []),
      ],
    }),
  ),
});
