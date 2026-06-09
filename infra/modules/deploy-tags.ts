/**
 * Deploy tags bucket — the cutover surface between CI and the on-VM reconciler.
 *
 * Why a bucket instead of baking the tag into cloud-init?
 *   Baking *_TAG into cloud-init made every release mutate the userdata, which
 *   trips `replaceOnChanges: ['cloudInit']` on the VM — Pulumi would destroy and
 *   recreate the instance per push. Moving the image tag out-of-band lets us:
 *     - keep VMs long-lived (no apt + docker pull on a fresh kernel each push)
 *     - run a reconciler systemd unit that watches `s3://<bucket>/deploy/<svc>.tag`
 *       and `docker compose pull && up -d` only the changed service
 *   The tag now lives ONLY here; no Pulumi config or cloud-init constant carries
 *   it. `replaceOnChanges` is retained but only fires for genuine cloud-init
 *   edits (reconciler script, package install) — never for a routine release.
 *
 * Layout (one object per service):
 *   s3://<prefix>-deploy-tags/deploy/backend.tag    -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/cdc.tag        -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/yjs.tag        -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/ai.tag         -> "<git-sha>"
 *   s3://<prefix>-deploy-tags/deploy/frontend.tag   -> "<git-sha>"
 *
 * Content is just the tag string (no JSON wrapper). Keeps the on-VM script
 * trivial: `aws s3 cp ... -` produces the literal value to compare against
 * `docker inspect`.
 *
 * No seeding: Pulumi does NOT create placeholder objects. CI's first roll
 * creates each `deploy/<svc>.tag` via PutObject. Until then the object simply
 * doesn't exist, and every reader treats a MISSING object as "no release yet,
 * keep whatever is running" (reconciler.sh classifies a 404 as a quiet skip;
 * the cloud-init fallback boots nothing and lets the timer converge). This
 * avoids the old create-then-disown pattern (a Pulumi `Item` with
 * `ignoreChanges:['content',…]` whose content CI immediately overwrites).
 *
 * IAM split:
 *   - Pulumi application_id: full s3:* on the bucket (seed + GC).
 *   - CI application_id: s3:PutObject on `deploy/*` only — write path.
 *   - VM application_id: s3:GetObject on `deploy/<own-service>.tag` only.
 *     Each compute module wires the per-service read in cloud-init.
 *
 * No public read, no versioning. Tag flips must be irreversible at the
 * bucket layer — rollback happens by CI pushing the previous SHA, not by
 * S3 version restore (which would race the reconciler).
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tags, isProduction, infraConfig } from '../helpers'
import { serviceNames, type ServiceName } from '../src/services.js'

const applicationId = infraConfig.require('applicationId')

// Optional CI application_id — when set, the bucket policy grants it
// PutObject/GetObject on `deploy/*` only. Until rotated (P1.9), the CI key
// reuses the Pulumi principal and these statements collapse to no-ops.
const ciApplicationId = infraConfig.get('ciApplicationId') ?? applicationId
// Optional VM application_id — read-only on `deploy/*`. Same caveat: until
// per-VM credentials are provisioned, this stays equal to applicationId.
const vmApplicationId = infraConfig.get('vmApplicationId') ?? applicationId

// Local `pulumi up` (bootstrap and the "Apply infra change" path) authenticates
// as the operator's own Scaleway key — NOT the CI `applicationId`. Once this
// policy is attached, Object Storage becomes authoritative and denies every
// principal it does not name, so the operator key would 403 on the seed/GC
// PutObject below. `bootstrap.ts` records the operator's principal string
// (`user_id:<id>` or `application_id:<id>`) as `infra:operatorPrincipal` so we
// can grant it here. Absent in CI, where pulumi already runs as applicationId.
const operatorPrincipal = infraConfig.get('operatorPrincipal')

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
