import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { stateBucket } from '../lib/stack/control-store';
import { region } from '../pulumi-context';
import { observerApplicationId, operatorApplicationId, operatorMemberUserIds } from './identities';

const appConfig = engineConfig();

const stateBucketName = stateBucket(appConfig.slug);

/**
 * Deny-by-default policy on the Pulumi state bucket, which tasks/ensure-state-bucket.ts creates with versioning and SSE-ONE encryption.
 * Only the people who apply read or write it: the operator application and the operators group's members keep `s3:*` for applies,
 * recovery and state surgery, in one statement. The deploy key is named nowhere, as a deploy plans no stack, and the observer may only list
 * it, so status can tell the bucket is there without reading a checkpoint. A statement is dropped when its principals do not exist.
 * @sideEffect
 */
export const stateBucketPolicy = new scaleway.object.BucketPolicy('state-bucket-policy', {
  bucket: stateBucketName,
  region,
  policy: pulumi.all([operatorApplicationId, operatorMemberUserIds, observerApplicationId]).apply(([operatorId, userIds, observerId]) => {
    const operators = [...(operatorId ? [`application_id:${operatorId}`] : []), ...userIds.map((id) => `user_id:${id}`)];
    return JSON.stringify({
      Version: '2023-04-17',
      Statement: [
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
                Sid: 'ObserverStateList',
                Effect: 'Allow',
                Principal: { SCW: `application_id:${observerId}` },
                Action: ['s3:ListBucket'],
                Resource: [stateBucketName],
              },
            ]
          : []),
      ],
    });
  }),
});
