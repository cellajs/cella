import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { sizing } from '../config/sizing';
import { appStorageNeeds, services } from '../lib/services';
import { isProduction, naming, region, serviceUrl, tagsAsMap } from '../pulumi-context';
import {
  backendServiceApplicationId,
  bootApplicationId,
  builderApplicationId,
  ciDeployApplicationId,
  observerApplicationId,
  operatorApplicationId,
} from './identities';

// App-owned buckets follow the service registry: the SPA bucket needs a default-route service, the upload buckets need an s3Access service, and browser CORS exists only when both do. The boot-diag bucket below is unconditional.
const needs = appStorageNeeds(services);
const browserOrigin = needs.browserOriginSlug ? serviceUrl(needs.browserOriginSlug) : undefined;
const uploadCorsRules = browserOrigin
  ? [{ allowedHeaders: ['*'], allowedMethods: ['GET', 'PUT', 'POST'], allowedOrigins: [browserOrigin], maxAgeSeconds: 3600 }]
  : undefined;

/**
 * The people's S3 access on the bucket policies: the operator application, which applies the stack. Bucket policies are deny-by-default, so
 * without it even a key with every IAM right 403s on ListObjects/GetBucketCors during `pulumi up --refresh`. Resolved from IAM by name so
 * local and CI ups produce the same policy; an application that does not exist drops its statement.
 */
const humanAccess = (bucketName: pulumi.Input<string>) =>
  operatorApplicationId.apply((operatorId) =>
    operatorId
      ? [
          {
            Sid: 'OperatorAccess',
            Effect: 'Allow',
            Principal: { SCW: `application_id:${operatorId}` },
            Action: ['s3:*'],
            Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
          },
        ]
      : [],
  );

/**
 * The deploy key's access on a bucket policy: objects only, under `prefix` when given (the frontend's files, GeoIP data, boot diagnostics). A
 * bucket's configuration and its policy are the apply's, a privileged change the deploy stops on, and no version is deleted, so on a
 * versioned bucket a leaked deploy key can delete objects but not their history. Policies are deny-by-default, so a bucket without this
 * statement, the private uploads bucket, is out of the deploy key's reach.
 */
const deployAccess = (bucketName: pulumi.Input<string>, prefix = '') => ({
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
  ],
  Resource: [bucketName, pulumi.interpolate`${bucketName}/${prefix}*`],
});

/** Backend service-app statement on the uploads buckets: object-level only, since the backend signs uploads and presigned URLs with its standing service key. An absent app drops the statement. */
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
      Statement: humanAccess(frontendBucket.name).apply((admin) => [
        {
          Sid: 'PublicRead',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [pulumi.interpolate`${frontendBucket.name}/*`],
        },
        deployAccess(frontendBucket.name),
        // The builder writes a release's files, listing them first to skip unchanged ones; it deletes nothing.
        {
          Sid: 'BuilderFiles',
          Effect: 'Allow',
          Principal: { SCW: pulumi.interpolate`application_id:${builderApplicationId}` },
          Action: ['s3:ListBucket', 's3:GetObject', 's3:PutObject'],
          Resource: [frontendBucket.name, pulumi.interpolate`${frontendBucket.name}/*`],
        },
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
      Statement: pulumi.all([humanAccess(publicUploadsBucket.name), uploadsSignerAccess(publicUploadsBucket.name)]).apply(([admin, signers]) => [
        {
          Sid: 'PublicRead',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [pulumi.interpolate`${publicUploadsBucket.name}/*`],
        },
        // The deploy writes GeoIP data and nothing else here: the users' files are the backend's.
        deployAccess(publicUploadsBucket.name, 'geoip/'),
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

/** Deny-by-default policy on the private bucket: signed URLs only. Admits the upload signer and the people's applications; every other key, the deploy key and a machine's boot key included, is denied. */
if (privateUploadsBucket) {
  new scaleway.object.BucketPolicy('private-uploads-policy', {
    bucket: privateUploadsBucket.name,
    region,
    policy: pulumi.jsonStringify({
      Version: '2023-04-17',
      Statement: pulumi
        .all([humanAccess(privateUploadsBucket.name), uploadsSignerAccess(privateUploadsBucket.name)])
        .apply(([admin, signers]) => [...admin, ...signers]),
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
    // Versioned, so the deploy key, which may delete objects, cannot erase a run record or a boot account: a deleted one stays for 60 days.
    versioning: { enabled: true },
    // Records and boot accounts keep as long as Scaleway keeps the job runs they describe (D25).
    lifecycleRules: [
      {
        id: 'cleanup-old-versions',
        enabled: true,
        noncurrentVersionExpiration: { noncurrentDays: 60 },
        expiration: { expiredObjectDeleteMarker: true },
      },
      { id: 'expire-boot-diag', enabled: true, expiration: { days: 60 }, prefix: 'boot-diag/' },
      { id: 'expire-runs', enabled: true, expiration: { days: 60 }, prefix: 'runs/' },
    ],
  },
  { protect: isProduction },
);

new scaleway.object.BucketPolicy('boot-diag-policy', {
  bucket: bootDiagBucket.name,
  region,
  policy: pulumi.jsonStringify({
    Version: '2023-04-17',
    Statement: pulumi.all([humanAccess(bootDiagBucket.name), bootApplicationId, observerApplicationId]).apply(([admin, bootId, observerId]) => [
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
      // The observer reads what machines wrote about their boot.
      ...(observerId
        ? [
            {
              Sid: 'ObserverReadBootDiagnostics',
              Effect: 'Allow',
              Principal: { SCW: `application_id:${observerId}` },
              Action: ['s3:ListBucket', 's3:GetObject'],
              Resource: [bootDiagBucket.name, pulumi.interpolate`${bootDiagBucket.name}/*`],
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
