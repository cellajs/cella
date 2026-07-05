/**
 * Storage — S3 buckets for the frontend SPA, user file uploads, and boot diagnostics.
 *
 * Frontend bucket runs in website-hosting mode so direct bucket access (dev) and
 * the Caddy frontend proxy both fall back to index.html for SPA routes.
 * Two upload buckets: a public one served directly, and a private one accessed only
 * via signed URLs. Production buckets are `protect`-ed and `forceDestroy` is off.
 *
 * Config consumed from appConfig: slug, s3.region, s3.publicBucket, s3.privateBucket
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tagsAsMap, isProduction, infra, serviceUrl, ciDeployApplicationId, vmReaderApplicationId, operatorApplicationId } from '../pulumi-context'

// Optional operator application (from SCW_OPERATOR_APPLICATION_ID) granted full
// S3 access alongside the CI deploy app, so a key under it can read & refresh
// buckets. Bucket policies are deny-by-default, so without this only the CI app
// (and public GetObject) can touch them. One Sid per bucket, omitted when unset
// so existing forks see no policy change.
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

// Full S3 access for the CI deploy application — the same statement on every
// bucket policy (bucket policies are deny-by-default, so without it even the
// deploy key cannot touch the bucket).
const deployAccess = (bucketName: pulumi.Input<string>) => ({
  Sid: 'DeployAccess',
  Effect: 'Allow',
  Principal: { SCW: pulumi.interpolate`application_id:${ciDeployApplicationId}` },
  Action: ['s3:*'],
  Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
})

// Days before stale, content-hashed frontend chunks under `assets/` are
// expired by Object Storage. Must outlive any reasonable open browser tab on
// a previous bundle (a tab may lazy-load a chunk it hasn't fetched yet).
// Entry files (index.html, sw.js, manifest, etc.) live at the bucket root —
// outside this prefix — so they are never touched by this rule.
const assetRetentionDays = infra.assetRetentionDays

// ---------------------------------------------------------------------------
// Frontend static files bucket (website hosting)
// ---------------------------------------------------------------------------

const frontendBucket = new scaleway.object.Bucket('frontend-bucket', {
  name: naming.frontendBucket,
  region,
  tags: tagsAsMap,
  forceDestroy: !isProduction,
  versioning: { enabled: true },
  lifecycleRules: [
    {
      id: 'cleanup-old-versions',
      enabled: true,
      expiration: { days: 30 },
      prefix: '_noncurrent/',
    },
    {
      // Prune stale, content-hashed chunks. Because filenames are immutable
      // (content-hashed), "not modified in N days" reliably means "no longer
      // referenced by the current index.html and outlived any open tab".
      // A rollback redeploy rebuilds identical hashes and re-uploads any
      // missing chunk, so expiring old assets never breaks rollback.
      id: 'expire-stale-assets',
      enabled: true,
      expiration: { days: assetRetentionDays },
      prefix: 'assets/',
    },
  ],
}, { aliases: [{ type: 'scaleway:index/objectBucket:ObjectBucket' }], protect: isProduction })

// SPA website configuration — enables S3 website hosting with index.html fallback.
// Required for direct bucket access (dev) and the Caddy frontend proxy.
// Note: requires ObjectStorageFullAccess IAM permission on the SCW API key.
const frontendWebsite = new scaleway.object.BucketWebsiteConfiguration(
  'frontend-website',
  {
    bucket: frontendBucket.name,
    region,
    indexDocument: { suffix: 'index.html' },
    errorDocument: { key: 'index.html' },
  },
)

// Public read access for frontend bucket.
// dependsOn: website config must be created first — the restrictive policy
// (Principal: '*', Action: s3:GetObject only) would otherwise block the
// provider's ListObjects call needed to set up website configuration.
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

// ---------------------------------------------------------------------------
// Public uploads bucket (user-uploaded public assets)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Private uploads bucket (user-uploaded private assets, signed URL access)
// ---------------------------------------------------------------------------

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

// No public policy — access via signed URLs only

// ---------------------------------------------------------------------------
// Boot diagnostics bucket (VM write-only diagnostics channel)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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
