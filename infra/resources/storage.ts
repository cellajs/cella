import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { sizing } from '../config/sizing';
import { appStorageNeeds, services } from '../lib/services';
import { isProduction, naming, region, serviceUrl, tagsAsMap } from '../pulumi-context';
import { adminApplicationId, backendServiceApplicationId, bootApplicationId, ciDeployApplicationId } from './vm-iam';

// App-owned buckets follow the service registry: the SPA bucket needs a default-route service, the upload buckets need an s3Access service, and browser CORS exists only when both do. The boot-diag bucket below is unconditional.
const needs = appStorageNeeds(services);
const browserOrigin = needs.browserOriginSlug ? serviceUrl(needs.browserOriginSlug) : undefined;
const uploadCorsRules = browserOrigin
  ? [
      {
        allowedHeaders: ['*'],
        allowedMethods: ['GET', 'PUT', 'POST'],
        allowedOrigins: [browserOrigin],
        maxAgeSeconds: 3600,
      },
    ]
  : undefined;

/**
 * Admin application S3 access on the CI-scoped bucket policies. Bucket policies are deny-by-default, so without it even an org-admin key 403s on ListObjects/GetBucketCors during `pulumi up --refresh`.
 * Resolved from IAM by name so local and CI ups produce the same policy; an absent admin app drops the statement.
 */
const adminAccess = (bucketName: pulumi.Input<string>) =>
  adminApplicationId.apply((adminId) =>
    adminId
      ? [
          {
            Sid: 'AdminAccess',
            Effect: 'Allow',
            Principal: { SCW: `application_id:${adminId}` },
            Action: ['s3:*'],
            Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
          },
        ]
      : [],
  );

// Full S3 access for the CI deploy application, on every bucket policy: policies are deny-by-default, so without it the deploy key cannot touch the bucket.
const deployAccess = (bucketName: pulumi.Input<string>) => ({
  Sid: 'DeployAccess',
  Effect: 'Allow',
  Principal: { SCW: pulumi.interpolate`application_id:${ciDeployApplicationId}` },
  Action: ['s3:*'],
  Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
});

/**
 * CI access on buckets holding irreplaceable user data: everything a deploy or refresh needs except `s3:DeleteObjectVersion`, so a leaked CI key can delete objects but not destroy version history.
 * `PutBucketVersioning` stays granted because Pulumi manages the versioning config itself; the residual risk is that a leaked key can suspend future versioning.
 * Scaleway's supported bucket-policy action vocabulary is undocumented, so validate any change to this list on staging before trusting it.
 */
const deployAccessNoVersionDelete = (bucketName: pulumi.Input<string>) => ({
  Sid: 'DeployAccess',
  Effect: 'Allow',
  Principal: { SCW: pulumi.interpolate`application_id:${ciDeployApplicationId}` },
  Action: [
    's3:ListBucket',
    's3:ListBucketMultipartUploads',
    's3:ListMultipartUploadParts',
    's3:GetObject',
    's3:PutObject',
    's3:DeleteObject',
    's3:AbortMultipartUpload',
    's3:GetBucketTagging',
    's3:PutBucketTagging',
    's3:GetBucketVersioning',
    's3:PutBucketVersioning',
    // Scaleway spells CORS all-caps; the AWS casing is rejected as an invalid action (MalformedPolicy 400).
    's3:GetBucketCORS',
    's3:PutBucketCORS',
    's3:GetLifecycleConfiguration',
    's3:PutLifecycleConfiguration',
    's3:GetBucketAcl',
    's3:GetBucketLocation',
    's3:GetBucketWebsite',
  ],
  Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
});

/** Backend service-app statement on the uploads buckets: object-level only, since the backend signs uploads and presigned URLs with its per-deploy service key. An absent app drops the statement. */
const uploadsSignerAccess = (bucketName: pulumi.Input<string>) =>
  backendServiceApplicationId.apply((backendId) =>
    backendId
      ? [
          {
            Sid: 'BackendObjectAccess',
            Effect: 'Allow',
            Principal: { SCW: `application_id:${backendId}` },
            Action: [
              's3:ListBucket',
              's3:ListBucketMultipartUploads',
              's3:ListMultipartUploadParts',
              's3:GetObject',
              's3:PutObject',
              's3:DeleteObject',
              's3:AbortMultipartUpload',
            ],
            Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
          },
        ]
      : [],
  );

// Expire stale hashed assets only after old browser tabs stop lazy-loading them; root entry files stay outside this lifecycle prefix.
const assetRetentionDays = sizing.assetRetentionDays;

// Frontend static files bucket, only when a default-route service exists to serve it.

const frontendBucket = needs.spaBucket
  ? new scaleway.object.Bucket(
      'frontend-bucket',
      {
        name: naming.frontendBucket,
        region,
        tags: tagsAsMap,
        forceDestroy: !isProduction,
        versioning: { enabled: true },
        lifecycleRules: [
          {
            // Versioned expiration creates delete markers, so purge noncurrent objects after 30 days and remove markers once no versions remain.
            id: 'cleanup-old-versions',
            enabled: true,
            noncurrentVersionExpiration: { noncurrentDays: 30 },
            expiration: { expiredObjectDeleteMarker: true },
          },
          {
            // Expire immutable chunks after the open-tab window; versioning creates a marker here and the old-version rule performs the deletion.
            id: 'expire-stale-assets',
            enabled: true,
            expiration: { days: assetRetentionDays },
            prefix: 'assets/',
          },
        ],
      },
      { protect: isProduction },
    )
  : undefined;

// Public read via bucket policy only: the Caddy frontend VMs proxy the S3 REST endpoint with their own index.html fallback, so no S3 website hosting config is needed.
if (frontendBucket) {
  new scaleway.object.BucketPolicy('frontend-policy', {
    bucket: frontendBucket.name,
    region,
    policy: pulumi.jsonStringify({
      Version: '2023-04-17',
      Statement: adminAccess(frontendBucket.name).apply((admin) => [
        {
          Sid: 'PublicRead',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [pulumi.interpolate`${frontendBucket.name}/*`],
        },
        deployAccess(frontendBucket.name),
        ...admin,
      ]),
    }),
  });
}

// Public uploads bucket, only when a service signs S3 uploads.

const publicUploadsBucket = needs.uploadBuckets
  ? new scaleway.object.Bucket('public-uploads-bucket', {
      name: naming.publicBucket,
      region,
      tags: tagsAsMap,
      forceDestroy: !isProduction,
      // User uploads are irreplaceable: versioning plus a noncurrent-expiry window keeps overwrites and deletes recoverable for 30 days, and the CI statement below cannot delete versions.
      versioning: { enabled: true },
      lifecycleRules: [
        {
          id: 'cleanup-old-versions',
          enabled: true,
          noncurrentVersionExpiration: { noncurrentDays: 30 },
          expiration: { expiredObjectDeleteMarker: true },
        },
      ],
      // Browser direct upload needs the SPA origin; without a default-route service uploads are server-side only and need no CORS.
      ...(uploadCorsRules ? { corsRules: uploadCorsRules } : {}),
    })
  : undefined;

if (publicUploadsBucket) {
  new scaleway.object.BucketPolicy('public-uploads-policy', {
    bucket: publicUploadsBucket.name,
    region,
    policy: pulumi.jsonStringify({
      Version: '2023-04-17',
      Statement: pulumi
        .all([adminAccess(publicUploadsBucket.name), uploadsSignerAccess(publicUploadsBucket.name)])
        .apply(([admin, signers]) => [
          {
            Sid: 'PublicRead',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [pulumi.interpolate`${publicUploadsBucket.name}/*`],
          },
          deployAccessNoVersionDelete(publicUploadsBucket.name),
          ...admin,
          ...signers,
        ]),
    }),
  });
}

const privateUploadsBucket = needs.uploadBuckets
  ? new scaleway.object.Bucket(
      'private-uploads-bucket',
      {
        name: naming.privateBucket,
        region,
        tags: tagsAsMap,
        forceDestroy: !isProduction,
        // Same versioning protection as public uploads. This bucket is reached by signed URLs only, so version protection is IAM-side.
        versioning: { enabled: true },
        lifecycleRules: [
          {
            id: 'cleanup-old-versions',
            enabled: true,
            noncurrentVersionExpiration: { noncurrentDays: 30 },
            expiration: { expiredObjectDeleteMarker: true },
          },
        ],
        ...(uploadCorsRules ? { corsRules: uploadCorsRules } : {}),
      },
      { protect: isProduction },
    )
  : undefined;

/** Deny-by-default policy on the private bucket: signed URLs only. Admits the upload signer, CI without version deletes, and the admin app; every other key, including a VM boot key, is denied. */
if (privateUploadsBucket) {
  new scaleway.object.BucketPolicy('private-uploads-policy', {
    bucket: privateUploadsBucket.name,
    region,
    policy: pulumi.jsonStringify({
      Version: '2023-04-17',
      Statement: pulumi
        .all([adminAccess(privateUploadsBucket.name), uploadsSignerAccess(privateUploadsBucket.name)])
        .apply(([admin, signers]) => [deployAccessNoVersionDelete(privateUploadsBucket.name), ...admin, ...signers]),
    }),
  });
}

const bootDiagBucket = new scaleway.object.Bucket(
  'boot-diag-bucket',
  {
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
  },
  { protect: isProduction },
);

new scaleway.object.BucketPolicy('boot-diag-policy', {
  bucket: bootDiagBucket.name,
  region,
  policy: pulumi.jsonStringify({
    Version: '2023-04-17',
    Statement: pulumi.all([adminAccess(bootDiagBucket.name), bootApplicationId]).apply(([admin, bootId]) => [
      // The boot fetcher writes diagnostics during VM startup.
      ...(bootId
        ? [
            {
              Sid: 'BootWriteBootDiagnostics',
              Effect: 'Allow',
              Principal: { SCW: `application_id:${bootId}` },
              Action: ['s3:PutObject'],
              Resource: [pulumi.interpolate`${bootDiagBucket.name}/boot-diag/*`],
            },
          ]
        : []),
      deployAccess(bootDiagBucket.name),
      ...admin,
    ]),
  }),
});

// Skipped buckets export empty strings, matching the provision-less primary-store contract in resources/program.ts.

export const frontendBucketName = frontendBucket?.name ?? pulumi.output('');

export const frontendBucketEndpoint = frontendBucket?.endpoint ?? pulumi.output('');

export const publicUploadsBucketName = publicUploadsBucket?.name ?? pulumi.output('');

export const publicUploadsBucketEndpoint = publicUploadsBucket?.endpoint ?? pulumi.output('');

export const privateUploadsBucketName = privateUploadsBucket?.name ?? pulumi.output('');

export const privateUploadsBucketEndpoint = privateUploadsBucket?.endpoint ?? pulumi.output('');

export const bootDiagBucketName = bootDiagBucket.name;

export const bootDiagBucketEndpoint = bootDiagBucket.endpoint;
