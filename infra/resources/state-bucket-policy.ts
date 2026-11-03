import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { stateBucket } from '../lib/stack/control-store';
import { region } from '../pulumi-context';
import { ciDeployApplicationId, observerApplicationId, operatorApplicationId, operatorMemberUserIds } from './identities';

const appConfig = engineConfig();

const stateBucketName = stateBucket(appConfig.slug);

/**
 * Deny-by-default policy on the Pulumi state bucket, which tasks/ensure-state-bucket.ts creates with versioning and SSE-ONE encryption.
 * CI gets only what the Pulumi backend needs (list, read/write state objects, plain delete) and neither `s3:DeleteObjectVersion` nor `s3:PutBucketVersioning`, so a leaked CI key cannot destroy version history or suspend versioning.
 * The operator application and the operators group's members keep `s3:*` for applies, recovery and state surgery, in one statement. The
 * observer reads `control/` only (the lock, the rollout record), never a checkpoint, so only the deploy key and the operators read the
 * stack's state, and both read the keys the passphrase guards in it anyway. A statement is dropped when its principals do not exist. It
 * outlives a destroy with the bucket, which a teardown keeps.
 * @sideEffect
 */
export const stateBucketPolicy = new scaleway.object.BucketPolicy(
  'state-bucket-policy',
  {
    bucket: stateBucketName,
    region,
    policy: pulumi
      .all([ciDeployApplicationId, operatorApplicationId, operatorMemberUserIds, observerApplicationId])
      .apply(([ciId, operatorId, userIds, observerId]) => {
        const operators = [...(operatorId ? [`application_id:${operatorId}`] : []), ...userIds.map((id) => `user_id:${id}`)];
        return JSON.stringify({
          Version: '2023-04-17',
          Statement: [
            {
              Sid: 'DeployStateAccess',
              Effect: 'Allow',
              Principal: { SCW: `application_id:${ciId}` },
              Action: ['s3:ListBucket', 's3:GetBucketVersioning', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
              Resource: [stateBucketName, `${stateBucketName}/*`],
            },
            ...(operators.length > 0
              ? [
                  {
                    Sid: 'OperatorStateAccess',
                    Effect: 'Allow',
                    Principal: { SCW: operators },
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
                    Resource: [stateBucketName, `${stateBucketName}/control/*`],
                  },
                ]
              : []),
          ],
        });
      }),
  },
  { retainOnDelete: true },
);
