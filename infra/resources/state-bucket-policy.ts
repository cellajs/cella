import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { stateBucket } from '../lib/stack/control-store';
import { region } from '../pulumi-context';
import { ciDeployApplicationId, observerApplicationId, operatorApplicationId, retiredAdminApplicationId } from './identities';

const appConfig = engineConfig();

const stateBucketName = stateBucket(appConfig.slug);

/**
 * Deny-by-default policy on the Pulumi state bucket, which tasks/ensure-state-bucket.ts creates with versioning and SSE-ONE encryption.
 * CI gets only what the Pulumi backend needs (list, read/write state objects, plain delete) and neither `s3:DeleteObjectVersion` nor `s3:PutBucketVersioning`, so a leaked CI key cannot destroy version history or suspend versioning.
 * The operator keeps `s3:*` for applies, recovery and state surgery, and the observer reads (the lock, the rollout record, the checkpoint). The
 * retired admin application keeps `s3:*` on the run that admits the operator with its key. A statement is dropped when its app does not exist.
 * @sideEffect
 */
export const stateBucketPolicy = new scaleway.object.BucketPolicy('state-bucket-policy', {
  bucket: stateBucketName,
  region,
  policy: pulumi
    .all([ciDeployApplicationId, operatorApplicationId, observerApplicationId, retiredAdminApplicationId])
    .apply(([ciId, operatorId, observerId, adminId]) =>
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
          ...(operatorId
            ? [
                {
                  Sid: 'OperatorStateAccess',
                  Effect: 'Allow',
                  Principal: { SCW: `application_id:${operatorId}` },
                  Action: ['s3:*'],
                  Resource: [stateBucketName, `${stateBucketName}/*`],
                },
              ]
            : []),
          ...(observerId
            ? [
                {
                  Sid: 'ObserverStateRead',
                  Effect: 'Allow',
                  Principal: { SCW: `application_id:${observerId}` },
                  Action: ['s3:ListBucket', 's3:GetObject'],
                  Resource: [stateBucketName, `${stateBucketName}/*`],
                },
              ]
            : []),
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
