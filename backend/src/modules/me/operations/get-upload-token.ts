import type { UploadTemplateId } from 'shared';
import { isSystemUploadTemplate, systemUploadPrefix, uploadStorage } from 'shared/utils/upload-visibility';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { env } from '#/env';
import { signedUploadParams } from '#/lib/transloadit';
import { checkAccessBatch } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubject } from '#/permissions/build-subject';

interface GetUploadTokenOpts {
  organizationId?: string;
  templateId: UploadTemplateId;
}

/** A system upload (newsletter images) belongs to no organization and is stored under the system prefix. */
const systemUploadSub = (ctx: UserContext) => {
  if (!ctx.var.isSystemAdmin) throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: ctx.var.user.id } });
  return `${systemUploadPrefix}/${ctx.var.user.id}`;
};

/**
 * The organization id becomes the upload's storage prefix, which attachments must name: members only, and to anyone
 * else the organization reads as missing.
 */
const organizationUploadSub = (ctx: UserContext, organizationId?: string) => {
  const isMember = ctx.var.memberships.some((membership) => membership.organizationId === organizationId);
  if (organizationId && !isMember && !ctx.var.isSystemAdmin) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });
  }
  return [organizationId, ctx.var.user.id].filter((part): part is string => typeof part === 'string').join('/');
};

/**
 * Private storage is read only through an attachment row, so a private upload names an organization the user may
 * create attachments in, there or in a channel of it they belong to: no row could name files stored outside one, and
 * no sweep would remove them.
 */
const assertMayUploadAttachments = (ctx: UserContext, organizationId?: string) => {
  if (!organizationId) {
    throw new AppError(400, 'invalid_request', 'warn', { entityType: 'attachment', meta: { reason: 'organization_required' } });
  }
  if (ctx.var.isSystemAdmin) return;
  // A membership row holds its channel's id and the ids above it: the scope of an attachment homed in that channel.
  const homes = ctx.var.memberships
    .filter((membership) => membership.organizationId === organizationId)
    .map((membership) => buildSubject('attachment', membership));
  const { results } = checkAccessBatch(accessFrom(ctx), 'create', homes);
  if (![...results.values()].some(({ allowed }) => allowed)) throw new AppError(403, 'forbidden', 'warn', { entityType: 'attachment' });
};

/**
 * Signs an upload under `<organizationId>/<userId>`, or under the system prefix for a system template. The template
 * decides the bucket and ACL: an avatar, banner or newsletter image is public by design, an attachment (any file type,
 * HTML and SVG included) is private and needs an organization.
 * @throws AppError 400 `invalid_request` for a private template without an organization; 403 `forbidden` when the user
 * may create no attachment in it; 404 `not_found` for an organization the user is no member of.
 */
export function getUploadTokenOp(ctx: UserContext, { organizationId, templateId }: GetUploadTokenOpts) {
  const { publicBucket } = uploadStorage(templateId);

  const sub = isSystemUploadTemplate(templateId) ? systemUploadSub(ctx) : organizationUploadSub(ctx, organizationId);
  if (!publicBucket) assertMayUploadAttachments(ctx, organizationId);

  const signed = signedUploadParams(templateId, sub);
  return { sub, publicBucket, s3: !!env.S3_ACCESS_KEY_ID, params: signed?.params ?? null, signature: signed?.signature ?? null };
}
