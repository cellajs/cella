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
 * Seeding: Pulumi creates each object once with placeholder content
 * `bootstrap`. CI overwrites them per release. We mark `ignoreChanges:
 * ['content', 'etag', 'hash']` so Pulumi never reverts a CI write back to
 * `bootstrap` on the next `pulumi up`.
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

const applicationId = infraConfig.require('applicationId')

// Optional CI application_id — when set, the bucket policy grants it
// PutObject/GetObject on `deploy/*` only. Until rotated (P1.9), the CI key
// reuses the Pulumi principal and these statements collapse to no-ops.
const ciApplicationId = infraConfig.get('ciApplicationId') ?? applicationId
// Optional VM application_id — read-only on `deploy/*`. Same caveat: until
// per-VM credentials are provisioned, this stays equal to applicationId.
const vmApplicationId = infraConfig.get('vmApplicationId') ?? applicationId

/** Services that ship as their own image and need an independent tag file. */
export const taggedServices = ['backend', 'cdc', 'yjs', 'ai', 'frontend'] as const
export type TaggedService = (typeof taggedServices)[number]

const deployTagsBucket = new scaleway.object.Bucket('deploy-tags-bucket', {
  name: naming.deployTagsBucket,
  region,
  tags: Object.fromEntries(tags.map((t) => t.split(':') as [string, string])),
  // Never force-destroy in production — losing the tag file mid-deploy
  // would let the reconciler crash-loop on an empty pull.
  forceDestroy: !isProduction,
  versioning: { enabled: false },
}, { protect: isProduction })

// Lock down the bucket: only Pulumi (seed/GC) and the configured app principal
// can touch it. CI and VM principals get their s3:PutObject / s3:GetObject
// grants via separate IAM policies attached to their own application IDs
// (see secrets.ts / compute.ts in PR2 of the migration plan).
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

// Seed one object per service with a placeholder. The reconciler treats
// `bootstrap` as "no release pushed yet — keep whatever is currently running"
// so existing VMs aren't disrupted when the bucket is first introduced.
const seededTags = Object.fromEntries(
  taggedServices.map((svc) => [
    svc,
    new scaleway.object.Item(
      `deploy-tag-${svc}`,
      {
        bucket: deployTagsBucket.name,
        region,
        key: `deploy/${svc}.tag`,
        content: 'bootstrap',
        contentType: 'text/plain',
        // CI owns the content after seeding — don't let `pulumi up` clobber
        // a freshly-deployed SHA back to the placeholder.
        visibility: 'private',
      },
      { ignoreChanges: ['content', 'etag', 'hash'] },
    ),
  ]),
) as Record<TaggedService, scaleway.object.Item>

/** Bucket name — consumed by CI and cloud-init scripts. */
export const deployTagsBucketName = deployTagsBucket.name

/** Per-service tag object keys — exported for documentation / CI templating. */
export const deployTagKeys = Object.fromEntries(
  taggedServices.map((svc) => [svc, seededTags[svc].key]),
) as Record<TaggedService, pulumi.Output<string>>
