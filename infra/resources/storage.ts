import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { generalConfig } from '../config/general.config';
import { BOOT_ACCOUNTS_PREFIX } from '../lib/deploy/boot-accounts';
import { ENV_PREFIX, RELEASES_PREFIX } from '../lib/deploy/release-archives';
import { RUNS_PREFIX } from '../lib/deploy/run-record';
import { resolvePerMode } from '../lib/general-config';
import { appStorageNeeds, services } from '../lib/services';
import { CONTROL_PREFIX } from '../lib/stack/control-store';
import { deployMode, naming, region, serviceUrl, tagsAsMap } from '../pulumi-context';
import { ciDeployApplicationId, observerApplicationId, operatorApplicationId, operatorMemberUserIds, uploadsApplicationId } from './identities';

// The app's buckets follow the service registry: the SPA bucket needs a default-route service, the upload buckets need an s3Access service, and browser CORS exists only when both do. The boot-diag bucket below is unconditional.
const needs = appStorageNeeds(services);
const browserOrigin = needs.browserOriginSlug ? serviceUrl(needs.browserOriginSlug) : undefined;
const uploadCorsRules = browserOrigin
  ? [{ allowedHeaders: ['*'], allowedMethods: ['GET', 'PUT', 'POST'], allowedOrigins: [browserOrigin], maxAgeSeconds: 3600 }]
  : undefined;

/**
 * The people's S3 access on the bucket policies: the operator application and each member of the operators group, who apply the stack, in
 * one statement, as Scaleway refuses a bucket policy of over ten. Bucket policies are deny-by-default, so without it even a key with every
 * IAM right 403s on ListObjects/GetBucketCors during `pulumi up --refresh`. Resolved from IAM at apply time so local and CI ups produce the
 * same policy: a member joins the policies at the next apply, and an application that does not exist drops the statement.
 */
const humanAccess = (bucketName: pulumi.Input<string>) =>
  pulumi.all([operatorApplicationId, operatorMemberUserIds]).apply(([operatorId, userIds]) => {
    const principals = [...(operatorId ? [`application_id:${operatorId}`] : []), ...userIds.map((id) => `user_id:${id}`)];
    return principals.length > 0
      ? [
          {
            Sid: 'OperatorAccess',
            Effect: 'Allow',
            Principal: { SCW: principals },
            Action: ['s3:*'],
            Resource: [bucketName, pulumi.interpolate`${bucketName}/*`],
          },
        ]
      : [];
  });

/**
 * The deploy key's access on a bucket policy: objects only, under the prefixes given, the whole bucket without one (the frontend's files).
 * A bucket's configuration and its policy are the apply's, and no version is deleted, so on a versioned bucket a leaked deploy key can
 * delete objects but not their history. Policies are deny-by-default, so a bucket without this statement, the private uploads bucket, and
 * a prefix outside it, such as the boot-diag bucket's final dumps, are out of the deploy key's reach.
 */
const deployAccess = (bucketName: pulumi.Input<string>, prefixes: readonly string[] = ['']) => ({
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
  Resource: [bucketName, ...prefixes.map((prefix) => pulumi.interpolate`${bucketName}/${prefix}*`)],
});

/** The uploads application's statement on the upload buckets: object-level only, as the backend signs uploads and presigned URLs with its key. */
const uploadsSignerAccess = (bucketName: pulumi.Input<string>) =>
  uploadsApplicationId.apply((uploadsId) =>
    uploadsId
      ? [
          {
            Sid: 'UploadsObjectAccess',
            Effect: 'Allow',
            Principal: { SCW: `application_id:${uploadsId}` },
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

// The upload buckets and the boot-diag bucket, with their policies, outlive a destroy and keep their contents: a teardown keeps them, and a
// setup adopts them again (lib/stack/kept-resources.ts). A policy stays so a kept bucket admits no more principals than before.
const kept = { retainOnDelete: true };

// Expire stale hashed assets only after old browser tabs stop lazy-loading them; root entry files stay outside this lifecycle prefix.
const assetRetentionDays = resolvePerMode(generalConfig.assets.retentionDays, deployMode);

// Frontend static files bucket, only when a default-route service exists to serve it.

const frontendBucket = needs.spaBucket
  ? new scaleway.object.Bucket('frontend-bucket', {
      name: naming.frontendBucket,
      region,
      tags: tagsAsMap,
      // A teardown deletes it with the frontend's files, which every deploy writes again.
      forceDestroy: true,
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
    })
  : undefined;

// Public read via bucket policy only: the frontend machines' Caddy proxies the S3 REST endpoint with their own index.html fallback, so no S3 website hosting config is needed.
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
        ...admin,
      ]),
    }),
  });
}

// Public uploads bucket, only when a service signs S3 uploads.

const publicUploadsBucket = needs.uploadBuckets
  ? new scaleway.object.Bucket(
      'public-uploads-bucket',
      {
        name: naming.publicBucket,
        region,
        tags: tagsAsMap,
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
      },
      kept,
    )
  : undefined;

if (publicUploadsBucket) {
  new scaleway.object.BucketPolicy(
    'public-uploads-policy',
    {
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
          deployAccess(publicUploadsBucket.name, ['geoip/']),
          ...admin,
          ...signers,
        ]),
      }),
    },
    kept,
  );
}

const privateUploadsBucket = needs.uploadBuckets
  ? new scaleway.object.Bucket(
      'private-uploads-bucket',
      {
        name: naming.privateBucket,
        region,
        tags: tagsAsMap,
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
      kept,
    )
  : undefined;

/** Deny-by-default policy on the private bucket: signed URLs only. Admits the upload signer and the people's applications; every other key, the deploy key included, is denied. */
if (privateUploadsBucket) {
  new scaleway.object.BucketPolicy(
    'private-uploads-policy',
    {
      bucket: privateUploadsBucket.name,
      region,
      policy: pulumi.jsonStringify({
        Version: '2023-04-17',
        Statement: pulumi
          .all([humanAccess(privateUploadsBucket.name), uploadsSignerAccess(privateUploadsBucket.name)])
          .apply(([admin, signers]) => [...admin, ...signers]),
      }),
    },
    kept,
  );
}

const bootDiagBucket = new scaleway.object.Bucket(
  'boot-diag-bucket',
  {
    name: naming.bootDiagBucket,
    region,
    tags: tagsAsMap,
    // Versioned, so the deploy key, which may delete objects, cannot erase a run record or a boot account: a deleted one stays for 60 days.
    versioning: { enabled: true },
    // Records, boot accounts and release archives keep as long as Scaleway keeps the job runs they describe. An env file holds a
    // machine's secret values: it and its versions go within a day, and the deploy deletes it once the machine booted.
    lifecycleRules: [
      {
        id: 'cleanup-old-versions',
        enabled: true,
        noncurrentVersionExpiration: { noncurrentDays: 60 },
        expiration: { expiredObjectDeleteMarker: true },
      },
      { id: 'expire-boot-diag', enabled: true, expiration: { days: 60 }, prefix: BOOT_ACCOUNTS_PREFIX },
      { id: 'expire-runs', enabled: true, expiration: { days: 60 }, prefix: RUNS_PREFIX },
      { id: 'expire-releases', enabled: true, expiration: { days: 60 }, prefix: RELEASES_PREFIX },
      { id: 'expire-env', enabled: true, expiration: { days: 1 }, noncurrentVersionExpiration: { noncurrentDays: 1 }, prefix: ENV_PREFIX },
    ],
  },
  kept,
);

new scaleway.object.BucketPolicy(
  'boot-diag-policy',
  {
    bucket: bootDiagBucket.name,
    region,
    policy: pulumi.jsonStringify({
      Version: '2023-04-17',
      // Four statements of the ten Scaleway allows: machines and the builder write through links the deploy key signs, so no machine is named.
      Statement: pulumi.all([humanAccess(bootDiagBucket.name), observerApplicationId]).apply(([admin, observerId]) => [
        // The observer reads what machines wrote about their boot, every version of a run record, which it reads by the first, and the
        // control records (the live record, the lease, the rotations); never an env file, which holds a machine's secret values.
        ...(observerId
          ? [
              {
                Sid: 'ObserverReadBootDiagnostics',
                Effect: 'Allow',
                Principal: { SCW: `application_id:${observerId}` },
                Action: ['s3:ListBucket', 's3:ListBucketVersions', 's3:GetObject', 's3:GetObjectVersion'],
                Resource: [
                  bootDiagBucket.name,
                  pulumi.interpolate`${bootDiagBucket.name}/${BOOT_ACCOUNTS_PREFIX}*`,
                  pulumi.interpolate`${bootDiagBucket.name}/${RUNS_PREFIX}*`,
                  pulumi.interpolate`${bootDiagBucket.name}/${CONTROL_PREFIX}*`,
                ],
              },
            ]
          : []),
        // The release's archives, manifest and builder reports, the env files, the boot accounts, the run records and the control records.
        deployAccess(bootDiagBucket.name, [RELEASES_PREFIX, ENV_PREFIX, BOOT_ACCOUNTS_PREFIX, RUNS_PREFIX, CONTROL_PREFIX]),
        // The deploy deletes a booted machine's env file with its version, which no other object of the bucket may lose.
        {
          Sid: 'DeployEnvRemoval',
          Effect: 'Allow',
          Principal: { SCW: pulumi.interpolate`application_id:${ciDeployApplicationId}` },
          Action: ['s3:DeleteObjectVersion'],
          Resource: [pulumi.interpolate`${bootDiagBucket.name}/${ENV_PREFIX}*`],
        },
        ...admin,
      ]),
    }),
  },
  kept,
);

// Skipped buckets export empty strings, matching the provision-less primary-store contract in resources/program.ts.

export const frontendBucketName = frontendBucket?.name ?? pulumi.output('');

export const frontendBucketEndpoint = frontendBucket?.endpoint ?? pulumi.output('');

export const publicUploadsBucketName = publicUploadsBucket?.name ?? pulumi.output('');

export const publicUploadsBucketEndpoint = publicUploadsBucket?.endpoint ?? pulumi.output('');

export const privateUploadsBucketName = privateUploadsBucket?.name ?? pulumi.output('');

export const privateUploadsBucketEndpoint = privateUploadsBucket?.endpoint ?? pulumi.output('');

export const bootDiagBucketName = bootDiagBucket.name;

export const bootDiagBucketEndpoint = bootDiagBucket.endpoint;
