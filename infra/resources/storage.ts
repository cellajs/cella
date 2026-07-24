import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tagsAsMap, isProduction, serviceUrl } from '../pulumi-context'
import { sizing } from '../config/sizing'
import { ciDeployApplicationId, vmReaderApplicationId } from './vm-iam'

/**
 * Optional operator application id (SCW_OPERATOR_APPLICATION_ID). When set, this
 * IAM application is granted full S3 access on the CI-scoped bucket policies, so
 * an operator key under it can read/refresh buckets without being the CI deploy
 * app. Bucket policies are deny-by-default: without this, even an org-admin or
 * personal key 403s on ListObjects/GetBucketCors during `pulumi up --refresh`.
 * Empty = only the CI deploy app + public reads, the default.
 */
const operatorApplicationId: string | undefined = process.env.SCW_OPERATOR_APPLICATION_ID?.trim() || undefined

// Optionally grant the operator application S3 access alongside CI in deny-by-default policies.
// Omit its statement when unset so existing forks keep their policy unchanged.
const operatorAccess = (bucketName: pulumi.Input<string>) =>
  operatorApplicationId
    ? [{
        Sid: 'OperatorAccess',
        Effect: 'Allow',
        Principal: { SCW: `application_id:${operatorApplicationId}` },
        Action: ['s3:*'],
        Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
      }]
    : []

// Full S3 access for the CI deploy application: the same statement on every
// bucket policy (bucket policies are deny-by-default, so without it even the
// deploy key cannot touch the bucket).
const deployAccess = (bucketName: pulumi.Input<string>) => ({
  Sid: 'DeployAccess',
  Effect: 'Allow',
  Principal: { SCW: pulumi.interpolate`application_id:${ciDeployApplicationId}` },
  Action: ['s3:*'],
  Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
})

// Expire stale hashed assets only after old browser tabs are unlikely to lazy-load them.
// Root entry files stay outside this lifecycle prefix.
const assetRetentionDays = sizing.assetRetentionDays

// Frontend static files bucket (website hosting)

const frontendBucket = new scaleway.object.Bucket('frontend-bucket', {
  name: naming.frontendBucket,
  region,
  tags: tagsAsMap,
  forceDestroy: !isProduction,
  versioning: { enabled: true },
  lifecycleRules: [
    {
      // Versioned expiration creates delete markers, so purge noncurrent objects bucket-wide
      // after 30 days and remove markers once no versions remain.
      id: 'cleanup-old-versions',
      enabled: true,
      noncurrentVersionExpiration: { noncurrentDays: 30 },
      expiration: { expiredObjectDeleteMarker: true },
    },
    {
      // Expire immutable chunks after the open-tab window; rollback reuploads identical hashes.
      // Versioning creates a marker here, while the old-version rule performs deletion.
      id: 'expire-stale-assets',
      enabled: true,
      expiration: { days: assetRetentionDays },
      prefix: 'assets/',
    },
  ],
}, { aliases: [{ type: 'scaleway:index/objectBucket:ObjectBucket' }], protect: isProduction })

// SPA website configuration: enables S3 website hosting with index.html fallback.
// Required for direct bucket access (dev) and the Caddy frontend proxy.
// Requires ObjectStorageFullAccess IAM permission on the SCW API key.
const frontendWebsite = new scaleway.object.BucketWebsiteConfiguration(
  'frontend-website',
  {
    bucket: frontendBucket.name,
    region,
    indexDocument: { suffix: 'index.html' },
    errorDocument: { key: 'index.html' },
  },
)

// Create website configuration before restricting the public policy to GetObject;
// the provider needs ListObjects while configuring the website.
new scaleway.object.BucketPolicy('frontend-policy', {
  bucket: frontendBucket.name,
  region,
  policy: pulumi.jsonStringify({
    Version: '2023-04-17',
    Statement: [
      {
        Sid: 'PublicRead',
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [pulumi.interpolate`${frontendBucket.name}/*`],
      },
      deployAccess(frontendBucket.name),
      ...operatorAccess(frontendBucket.name),
    ],
  }),
}, { aliases: [{ type: 'scaleway:index/objectBucketPolicy:ObjectBucketPolicy' }], dependsOn: [frontendWebsite] })

// Public uploads bucket (user-uploaded public assets)

const publicUploadsBucket = new scaleway.object.Bucket('public-uploads-bucket', {
  name: naming.publicBucket,
  region,
  tags: tagsAsMap,
  forceDestroy: !isProduction,
  versioning: { enabled: false },
  corsRules: [
    {
      allowedHeaders: ['*'],
      allowedMethods: ['GET', 'PUT', 'POST'],
      allowedOrigins: [serviceUrl('frontend')],
      maxAgeSeconds: 3600,
    },
  ],
}, { aliases: [{ type: 'scaleway:index/objectBucket:ObjectBucket' }] })

// Public read access for public uploads
new scaleway.object.BucketPolicy('public-uploads-policy', {
  bucket: publicUploadsBucket.name,
  region,
  policy: pulumi.jsonStringify({
    Version: '2023-04-17',
    Statement: [
      {
        Sid: 'PublicRead',
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [pulumi.interpolate`${publicUploadsBucket.name}/*`],
      },
      deployAccess(publicUploadsBucket.name),
      ...operatorAccess(publicUploadsBucket.name),
    ],
  }),
}, { aliases: [{ type: 'scaleway:index/objectBucketPolicy:ObjectBucketPolicy' }] })

// Private uploads bucket (user-uploaded private assets, signed URL access)

const privateUploadsBucket = new scaleway.object.Bucket('private-uploads-bucket', {
  name: naming.privateBucket,
  region,
  tags: tagsAsMap,
  forceDestroy: !isProduction,
  versioning: { enabled: false },
  corsRules: [
    {
      allowedHeaders: ['*'],
      allowedMethods: ['GET', 'PUT', 'POST'],
      allowedOrigins: [serviceUrl('frontend')],
      maxAgeSeconds: 3600,
    },
  ],
}, { aliases: [{ type: 'scaleway:index/objectBucket:ObjectBucket' }] , protect: isProduction })

// No public policy: access via signed URLs only.

// Boot diagnostics bucket (VM write-only diagnostics channel)

const bootDiagBucket = new scaleway.object.Bucket('boot-diag-bucket', {
  name: naming.bootDiagBucket,
  region,
  tags: tagsAsMap,
  forceDestroy: !isProduction,
  versioning: { enabled: false },
  lifecycleRules: [
    {
      id: 'expire-boot-diag',
      enabled: true,
      expiration: { days: 30 },
      prefix: 'boot-diag/',
    },
  ],
}, { protect: isProduction })

new scaleway.object.BucketPolicy('boot-diag-policy', {
  bucket: bootDiagBucket.name,
  region,
  policy: pulumi.jsonStringify({
    Version: '2023-04-17',
    Statement: [
      {
        Sid: 'VmWriteBootDiagnostics',
        Effect: 'Allow',
        Principal: { SCW: pulumi.interpolate`application_id:${vmReaderApplicationId}` },
        Action: ['s3:PutObject'],
        Resource: [pulumi.interpolate`${bootDiagBucket.name}/boot-diag/*`],
      },
      deployAccess(bootDiagBucket.name),
      ...operatorAccess(bootDiagBucket.name),
    ],
  }),
})

// Exports

/** Frontend bucket name */
export const frontendBucketName = frontendBucket.name

/** Frontend bucket S3 endpoint */
export const frontendBucketEndpoint = frontendBucket.endpoint

/** Frontend website endpoint */
export const frontendWebsiteEndpoint = frontendWebsite.websiteEndpoint

/** Public uploads bucket name */
export const publicUploadsBucketName = publicUploadsBucket.name

/** Public uploads bucket S3 endpoint */
export const publicUploadsBucketEndpoint = publicUploadsBucket.endpoint

/** Private uploads bucket name */
export const privateUploadsBucketName = privateUploadsBucket.name

/** Private uploads bucket S3 endpoint */
export const privateUploadsBucketEndpoint = privateUploadsBucket.endpoint

/** Boot diagnostics bucket name */
export const bootDiagBucketName = bootDiagBucket.name

/** Boot diagnostics bucket S3 endpoint */
export const bootDiagBucketEndpoint = bootDiagBucket.endpoint

