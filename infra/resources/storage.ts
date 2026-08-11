import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { sizing } from '../config/sizing';
import { appStorageNeeds, services } from '../lib/services';
import { isProduction, naming, region, serviceUrl, tagsAsMap } from '../pulumi-context';
import { adminApplicationId, backendServiceApplicationId, bootApplicationId, ciDeployApplicationId } from './vm-iam';

// App-owned buckets follow the service registry (P2): the SPA bucket needs a
// default-route service, the upload buckets need an s3Access service, and the
// browser CORS origin is the default-route service's URL when both exist. A
// frontend-less registry provisions no app buckets at all; the engine-owned
// boot-diag bucket below is unconditional.
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
 * Admin application S3 access on the CI-scoped bucket policies, so a human key
 * under the admin app can read/refresh buckets without being the CI deploy
 * app. Bucket policies are deny-by-default: without this, even an org-admin or
 * personal key 403s on ListObjects/GetBucketCors during `pulumi up --refresh`.
 * Resolved from IAM by name (vm-iam.ts) so local and CI ups produce the SAME
 * policy. The old env-var source (backend/.env only) made the statement
 * flip-flop between local and CI updates. Absent admin app = statement
 * dropped (vm-iam warns once).
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

// Full S3 access for the CI deploy application: the same statement on every
// bucket policy (bucket policies are deny-by-default, so without it even the
// deploy key cannot touch the bucket).
const deployAccess = (bucketName: pulumi.Input<string>) => ({
  Sid: 'DeployAccess',
  Effect: 'Allow',
  Principal: { SCW: pulumi.interpolate`application_id:${ciDeployApplicationId}` },
  Action: ['s3:*'],
  Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
});

/**
 * CI access on buckets holding irreplaceable user data (REQ-14): everything a
 * deploy/refresh needs EXCEPT `s3:DeleteObjectVersion`. Mirroring the state
 * bucket, a leaked CI key can delete objects (recoverable markers on a
 * versioned bucket) but cannot destroy version history. `PutBucketVersioning`
 * stays granted: Pulumi (as CI) manages the versioning config itself, so
 * denying it would break the up that applies this very posture. Accepted
 * residual: a leaked key can suspend FUTURE versioning, never erase history.
 * The action list is the riskiest piece of this file: Scaleway's supported
 * bucket-policy action vocabulary is not fully documented, so validate on
 * staging before trusting it (fallback: revert to `s3:*`).
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
    // Scaleway spells CORS all-caps (unlike AWS's s3:GetBucketCors); the
    // AWS casing is rejected as an invalid action (MalformedPolicy 400).
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

/**
 * Backend service-app statement on the uploads buckets (REQ-20): object-level
 * only, since the backend signs uploads and presigned URLs with its per-deploy
 * service key. Resolves gracefully (absent app = statement dropped).
 */
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

// Expire stale hashed assets only after old browser tabs are unlikely to lazy-load them.
// Root entry files stay outside this lifecycle prefix.
const assetRetentionDays = sizing.assetRetentionDays;

// Frontend static files bucket (website hosting); only when a default-route
// service exists to serve it.

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
      },
      { protect: isProduction },
    )
  : undefined;

// Public read via bucket policy only: the SPA is served by the Caddy frontend
// VMs proxying the S3 REST endpoint (with their own index.html fallback), so
// no S3 website hosting configuration is needed.
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

// Public uploads bucket (user-uploaded public assets); only when a service
// signs S3 uploads (s3Access).

const publicUploadsBucket = needs.uploadBuckets
  ? new scaleway.object.Bucket('public-uploads-bucket', {
      name: naming.publicBucket,
      region,
      tags: tagsAsMap,
      forceDestroy: !isProduction,
      // User uploads are irreplaceable: versioning + a noncurrent-expiry window is
      // the backup floor (REQ-14). Overwrites/deletes are recoverable for 30
      // days, and the CI statement below cannot delete versions.
      versioning: { enabled: true },
      lifecycleRules: [
        {
          id: 'cleanup-old-versions',
          enabled: true,
          noncurrentVersionExpiration: { noncurrentDays: 30 },
          expiration: { expiredObjectDeleteMarker: true },
        },
      ],
      // Browser direct upload needs the SPA origin; a registry without a
      // default-route service uploads server-side only, no CORS.
      ...(uploadCorsRules ? { corsRules: uploadCorsRules } : {}),
    })
  : undefined;

// Public read access for public uploads
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

// Private uploads bucket (user-uploaded private assets, signed URL access)

const privateUploadsBucket = needs.uploadBuckets
  ? new scaleway.object.Bucket(
      'private-uploads-bucket',
      {
        name: naming.privateBucket,
        region,
        tags: tagsAsMap,
        forceDestroy: !isProduction,
        // Same backup floor as public uploads (REQ-14). This bucket stays
        // policy-less (signed URLs only), so version protection here is IAM-side
        // only until P3 adds the per-service backend statement.
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

/**
 * Deny-by-default policy on the private bucket (P3): no public statement, signed URLs only.
 * Admits the upload signer (backend service app), CI without version deletes (REQ-14),
 * and the admin app; any other key, including a compromised VM boot key or another service's key, is denied.
 */
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

// Boot diagnostics bucket (VM write-only diagnostics channel)

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

// Exports. Skipped buckets export empty strings, matching the provision-less
// primary-store contract in resources/program.ts.

/** Frontend bucket name */
export const frontendBucketName = frontendBucket?.name ?? pulumi.output('');

/** Frontend bucket S3 endpoint */
export const frontendBucketEndpoint = frontendBucket?.endpoint ?? pulumi.output('');

/** Public uploads bucket name */
export const publicUploadsBucketName = publicUploadsBucket?.name ?? pulumi.output('');

/** Public uploads bucket S3 endpoint */
export const publicUploadsBucketEndpoint = publicUploadsBucket?.endpoint ?? pulumi.output('');

/** Private uploads bucket name */
export const privateUploadsBucketName = privateUploadsBucket?.name ?? pulumi.output('');

/** Private uploads bucket S3 endpoint */
export const privateUploadsBucketEndpoint = privateUploadsBucket?.endpoint ?? pulumi.output('');

/** Boot diagnostics bucket name */
export const bootDiagBucketName = bootDiagBucket.name;

/** Boot diagnostics bucket S3 endpoint */
export const bootDiagBucketEndpoint = bootDiagBucket.endpoint;
