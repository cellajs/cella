/**
 * Deploy tags bucket — the cutover surface between CI and the on-VM reconciler.
 *
 * The image SHA for each service lives ONLY here, as a plain-text object. Keeping
 * it out of cloud-init means a release never mutates VM userdata, so
 * `replaceOnChanges: ['cloudInit']` fires only for genuine cloud-init edits
 * (reconciler script, package install) — never for a routine release. VMs stay
 * long-lived; a reconciler systemd unit watches `s3://<bucket>/deploy/<svc>.tag`
 * and runs `docker compose pull && up -d` only for the changed service.
 *
 * Layout (one object per service):
 *   s3://<prefix>-deploy-tags/deploy/backend.tag    -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/cdc.tag        -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/yjs.tag        -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/ai.tag         -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/frontend.tag   -> "<git-sha>"
 *
 * Content is the bare tag string (no JSON wrapper), so the on-VM script stays
 * trivial: `aws s3 cp ... -` yields the literal value to compare against
 * `docker inspect`.
 *
 * No seeding: Pulumi creates no placeholder objects. CI's first roll creates
 * each `deploy/<svc>.tag` via PutObject. Until then a MISSING object means "no
 * release yet, keep whatever is running" (reconciler.sh treats a 404 as a quiet
 * skip; the cloud-init fallback boots nothing and lets the timer converge).
 *
 * IAM split:
 *   - Pulumi application_id: full s3:* on the bucket (seed + GC).
 *   - CI application_id: s3:PutObject on `deploy/*` only — write path.
 *   - VM application_id: s3:GetObject on `deploy/<own-service>.tag` only.
 *     Each compute module wires the per-service read in cloud-init.
 *
 * No public read, no versioning: tag flips must be irreversible at the bucket
 * layer — rollback happens by CI pushing the previous SHA, not by S3 version
 * restore (which would race the reconciler).
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tags, isProduction, infraConfig, ciDeployApplicationId, vmReaderApplicationId, operatorPrincipal } from '../pulumi-context'
import { serviceNames, type ServiceName } from '../lib/services'

// CI deploy application id — derived from IAM by name (SOVRUN §3.3), was the
// stored `infra:applicationId`. Gets full s3:* (seed + GC) on the bucket.
const applicationId = ciDeployApplicationId

// Optional override for a distinct CI principal; defaults to the CI deploy app.
// Until split out (P1.9) the CI key reuses the same principal and these
// statements collapse onto one application id.
const ciApplicationId = infraConfig.get('ciApplicationId') ?? ciDeployApplicationId
// VM application_id — read-only on `deploy/<own>.tag`. Derived from IAM by name
// (was the stored `infra:vmApplicationId`); the IAM segregation it enforces
// prevents a compromised container from writing arbitrary deploy tags or
// reading other services' tags.
const vmApplicationId = vmReaderApplicationId

// Local `pulumi up` (bootstrap and the "Apply infra change" path) authenticates
// as the operator's own Scaleway key — NOT the CI `applicationId`. Once this
// policy is attached, Object Storage becomes authoritative and denies every
// principal it does not name, so the operator key would 403 on the seed/GC
// PutObject below. `operatorPrincipal` is derived from the calling SCW_ACCESS_KEY
// (pulumi-context.ts) as `user_id:<id>` or `application_id:<id>` so we can grant it
// here. Undefined when no access key is in the environment (e.g. CI, where
// pulumi already runs as the CI applicationId and the grant is redundant).

/** Services that ship as their own tag file. Derived from the canonical registry. */
export const taggedServices = serviceNames
export type TaggedService = ServiceName

const deployTagsBucket = new scaleway.object.Bucket('deploy-tags-bucket', {
  name: naming.deployTagsBucket,
  region,
  tags: Object.fromEntries(tags.map((t) => t.split(':') as [string, string])),
  // Never force-destroy in production — losing the tag file mid-deploy
  // would let the reconciler crash-loop on an empty pull.
  forceDestroy: !isProduction,
  versioning: { enabled: false },
}, { protect: isProduction })

// Lock down the bucket: only Pulumi and the configured app principal can touch
// it. CI and VM principals get their s3:PutObject / s3:GetObject grants via
// separate IAM policies attached to their own application IDs (see secrets.ts /
// compute.ts in PR2 of the migration plan).
new scaleway.object.BucketPolicy('deploy-tags-policy', {
  bucket: deployTagsBucket.name,
  region,
  policy: pulumi.jsonStringify({
    Version: '2023-04-17',
    Statement: [
      {
        Sid: 'PulumiManage',
        Effect: 'Allow',
        Principal: { SCW: pulumi.interpolate`application_id:${applicationId}` },
        Action: ['s3:*'],
        Resource: [
          deployTagsBucket.name,
          pulumi.interpolate`${deployTagsBucket.name}/*`,
        ],
      },
      // Operator principal — the human/key that runs `pulumi up` locally. Full
      // access so an operator can inspect or hand-fix tags outside CI. Omitted
      // when unset (CI runs already authenticate as `applicationId`).
      ...(operatorPrincipal
        ? [
            {
              Sid: 'OperatorManage',
              Effect: 'Allow',
              Principal: { SCW: operatorPrincipal },
              Action: ['s3:*'],
              Resource: [
                deployTagsBucket.name,
                pulumi.interpolate`${deployTagsBucket.name}/*`,
              ],
            },
          ]
        : []),
      {
        // CI: write image SHAs into `deploy/<service>.tag`. Get is included
        // so the roll-services job can read-back the tag for idempotency
        // (skip rewriting when SHA already matches).
        Sid: 'CIWriteTags',
        Effect: 'Allow',
        Principal: { SCW: pulumi.interpolate`application_id:${ciApplicationId}` },
        Action: ['s3:PutObject', 's3:GetObject'],
        Resource: [pulumi.interpolate`${deployTagsBucket.name}/deploy/*`],
      },
      {
        // VMs: read-only on the prefix. Listing is allowed at the bucket
        // root so `aws s3 cp` (which HEADs first) doesn't 403 on the parent.
        Sid: 'VMReadTags',
        Effect: 'Allow',
        Principal: { SCW: pulumi.interpolate`application_id:${vmApplicationId}` },
        Action: ['s3:GetObject', 's3:ListBucket'],
        Resource: [
          deployTagsBucket.name,
          pulumi.interpolate`${deployTagsBucket.name}/deploy/*`,
        ],
      },
    ],
  }),
})

// No seeding: CI's first roll creates each `deploy/<svc>.tag` via PutObject.
// Until then the object is absent, and every reader treats a MISSING object as
// "no release yet, keep whatever is running" — see the module header.

/** Bucket name — consumed by CI and cloud-init scripts. */
export const deployTagsBucketName = deployTagsBucket.name

/** Per-service tag object keys — exported for documentation / CI templating. */
export const deployTagKeys = Object.fromEntries(
  taggedServices.map((svc) => [svc, `deploy/${svc}.tag`]),
) as Record<TaggedService, string>
