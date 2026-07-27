import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { engineConfig } from '../config/engine-config'
import { stateBucket } from '../lib/stack/control-store'
import { region } from '../pulumi-context'
import { ciDeployApplicationId, operatorApplicationId } from './vm-iam'

const appConfig = engineConfig()

const stateBucketName = stateBucket(appConfig.slug)

/**
 * Restricted, deny-by-default policy on the Pulumi STATE bucket (created
 * imperatively in tasks/ensure-state-bucket.ts, which also enables versioning
 * and SSE-ONE encryption). CI gets exactly what the Pulumi backend needs:
 * list, read/write state objects, and plain delete (lock files; on the
 * versioned bucket a delete is a recoverable marker), but neither
 * `s3:DeleteObjectVersion` nor `s3:PutBucketVersioning`, so a leaked or
 * misused CI key cannot destroy version history or suspend versioning. The
 * operator application keeps `s3:*` for recovery and state surgery.
 */
export const stateBucketPolicy = new scaleway.object.BucketPolicy('state-bucket-policy', {
  bucket: stateBucketName,
  region,
  policy: pulumi.jsonStringify({
    Version: '2023-04-17',
    Statement: [
      {
        Sid: 'DeployStateAccess',
        Effect: 'Allow',
        Principal: { SCW: pulumi.interpolate`application_id:${ciDeployApplicationId}` },
        Action: ['s3:ListBucket', 's3:GetBucketVersioning', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        Resource: [stateBucketName, `${stateBucketName}/*`],
      },
      {
        Sid: 'OperatorStateAccess',
        Effect: 'Allow',
        Principal: { SCW: pulumi.interpolate`application_id:${operatorApplicationId}` },
        Action: ['s3:*'],
        Resource: [stateBucketName, `${stateBucketName}/*`],
      },
    ],
  }),
})
