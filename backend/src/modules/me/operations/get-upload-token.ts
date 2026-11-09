import { and, count, eq, isNull } from 'drizzle-orm';
import type { UploadTemplateId } from 'shared';
import { buildSubject, checkAccessBatch } from 'shared';
import { isSystemUploadTemplate, maxFilesPerUpload, systemUploadPrefix, uploadStorage } from 'shared/utils/upload-visibility';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantReadById } from '#/db/tenant-context';
import { env } from '#/env';
import { signedUploadParams } from '#/lib/transloadit';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { loadTenant } from '#/modules/tenants/load-tenant';
import { accessFrom } from '#/permissions/access';

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
  const outsideOrganization = organizationId && !isMember && !ctx.var.isSystemAdmin;
  if (outsideOrganization) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });
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
  const results = checkAccessBatch(accessFrom(ctx), 'create', homes);
  if (![...results.values()].some(({ allowed }) => allowed)) throw new AppError(403, 'forbidden', 'warn', { entityType: 'attachment' });
};

/**
 * The attachments the organization's tenant may still take, up to one upload's worth: its quota less the rows it holds.
 * Checked here, before the files are stored, since the row insert alone would refuse them only afterwards.
 * @throws AppError 403 `restrict_by_app` at the quota, with the cap in `meta.quota`.
 */
const attachmentsLeft = async (ctx: UserContext, organizationId?: string) => {
  const tenantId = ctx.var.memberships.find((membership) => membership.organizationId === organizationId)?.tenantId;
  const tenant = tenantId ? await loadTenant(tenantId) : undefined;
  const quota = tenant?.restrictions.quotas.attachment ?? 0;
  if (!tenant || ctx.var.isSystemAdmin || quota === 0) return maxFilesPerUpload;

  const held = await tenantReadById(tenant.id, async (db) => {
    const [row] = await db
      .select({ total: count() })
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.tenantId, tenant.id), isNull(attachmentsTable.deletedAt)));
    return row.total;
  });
  if (held >= quota) throw new AppError(403, 'restrict_by_app', 'warn', { entityType: 'attachment', meta: { resource: 'attachment', quota } });
  return Math.min(maxFilesPerUpload, quota - held);
};

/**
 * Signs an upload under `<organizationId>/<userId>`, or under the system prefix for a system template. The template
 * decides the bucket and ACL: an avatar, banner or newsletter image is public by design, an attachment (any file type,
 * HTML and SVG included) is private and needs an organization, and is signed for no more files than its tenant's
 * attachment quota leaves.
 * @throws AppError 400 `invalid_request` for a private template without an organization; 403 `forbidden` when the user
 * may create no attachment in it, 403 `restrict_by_app` at its tenant's attachment quota; 404 `not_found` for an
 * organization the user is no member of.
 */
export async function getUploadTokenOp(ctx: UserContext, { organizationId, templateId }: { organizationId?: string; templateId: UploadTemplateId }) {
  const { publicBucket } = uploadStorage(templateId);

  const sub = isSystemUploadTemplate(templateId) ? systemUploadSub(ctx) : organizationUploadSub(ctx, organizationId);
  let maxFiles = maxFilesPerUpload;
  if (!publicBucket) {
    assertMayUploadAttachments(ctx, organizationId);
    maxFiles = await attachmentsLeft(ctx, organizationId);
  }

  const signed = signedUploadParams(templateId, sub, maxFiles);
  return { sub, publicBucket, s3: !!env.S3_ACCESS_KEY_ID, params: signed?.params ?? null, signature: signed?.signature ?? null };
}
