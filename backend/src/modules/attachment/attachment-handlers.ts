import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getColumns, ilike, or, type SQL, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { attachmentsTable } from '#/db/schema/attachments';
import { productCountersTable } from '#/db/schema/product-counters';
import { tenantContext, tenantRead } from '#/db/tenant-context';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import {
  countAttachmentsByOrg,
  deleteAttachmentsByIds,
  findAttachmentByKey,
  findAttachmentsByStxMutationId,
  findAttachmentViewCount,
  insertAttachments,
  updateAttachment,
} from '#/modules/attachment/attachment-queries';
import attachmentRoutes from '#/modules/attachment/attachment-routes';
import {
  auditUserSelect,
  coalesceAuditUsers,
  createdByUser,
  updatedByUser,
  withAuditUser,
  withAuditUserLite,
  withAuditUsers,
} from '#/modules/user/helpers/audit-user';
import { canCreateEntity, canPerEntityType, checkPermission } from '#/permissions';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { splitByPermission } from '#/permissions/split-by-permission';
import { buildStx, checkIdempotency, resolveUpdateOps } from '#/sync';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { seqCursorFilters } from '#/utils/seq-cursor';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { getSignedUrlFromKey } from './helpers/signed-url';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Get list of attachments
 */
app.openapi(attachmentRoutes.getAttachments, async (ctx) => {
  const organizationId = ctx.var.organization.id;

  const { q, sort, order, limit, offset, seqCursor } = ctx.req.valid('query');

  canPerEntityType(ctx, 'read', { entityType: 'attachment', organizationId });

  const filters: SQL[] = [eq(attachmentsTable.organizationId, organizationId)];

  // Sequence-based delta sync filter
  filters.push(...seqCursorFilters(attachmentsTable.seq, seqCursor));

  if (q?.trim()) {
    const queryToken = prepareStringForILikeFilter(q.trim());
    filters.push(
      or(
        ilike(attachmentsTable.name, queryToken),
        ilike(attachmentsTable.filename, queryToken),
        ilike(attachmentsTable.contentType, queryToken),
      ) as SQL,
    );
  }

  const orderColumn = getOrderColumn(sort, attachmentsTable.createdAt, order, {
    name: attachmentsTable.name,
    createdAt: attachmentsTable.createdAt,
    contentType: attachmentsTable.contentType,
  });

  const { rawItems, total } = await tenantRead(ctx, async (readCtx) => {
    const { db } = readCtx.var;
    const { createdBy: _cb, updatedBy: _mb, ...attachmentCols } = getColumns(attachmentsTable);

    const attachmentsQuery = db
      .select({
        ...attachmentCols,
        ...auditUserSelect,
        viewCount: sql<number>`coalesce(${productCountersTable.viewCount}, 0)`.as('view_count'),
      })
      .from(attachmentsTable)
      .leftJoin(productCountersTable, eq(productCountersTable.entityId, attachmentsTable.id))
      .leftJoin(createdByUser, eq(createdByUser.id, attachmentsTable.createdBy))
      .leftJoin(updatedByUser, eq(updatedByUser.id, attachmentsTable.updatedBy))
      .where(and(...filters));

    const [rawItems, [{ total }]] = await Promise.all([
      attachmentsQuery.orderBy(orderColumn).limit(limit).offset(offset),
      db.select({ total: count() }).from(attachmentsQuery.as('attachments')),
    ]);

    return { rawItems, total };
  });

  const items = coalesceAuditUsers(rawItems);
  return ctx.json({ items, total }, 200);
});

/**
 * Get presigned URL for private attachment.
 * IMPORTANT: Must be registered before /{id} routes to avoid path conflict.
 */
app.openapi(attachmentRoutes.getPresignedUrl, async (ctx) => {
  const { key } = ctx.req.valid('query');

  const attachment = await tenantRead(ctx, async (readCtx) => {
    return findAttachmentByKey(readCtx, { key });
  });

  const bucketName = attachment?.bucketName ?? appConfig.s3.privateBucket;

  if (attachment) {
    const isSystemAdmin = ctx.var.isSystemAdmin;
    const memberships = ctx.var.memberships;

    const { isAllowed } = checkPermission(memberships, 'read', attachment);

    if (!isSystemAdmin && !isAllowed) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: attachment.entityType });
    }
  }

  const url = await getSignedUrlFromKey(key, { bucketName, isPublic: false });

  return ctx.json(url, 200);
});

/**
 * Get single attachment by ID
 */
app.openapi(attachmentRoutes.getAttachment, async (ctx) => {
  const { id } = ctx.req.valid('param');

  const { entity: attachment } = await getValidProductEntity(ctx, id, 'attachment', 'read');

  // withAuditUser queries users (no RLS), findAttachmentViewCount queries counters (no RLS)
  const attachmentResponse = await withAuditUser(ctx, attachment);
  const viewCount = await findAttachmentViewCount(ctx, { entityId: id });

  const response = { ...attachmentResponse, viewCount };
  ctx.set('entityCacheData', response as Record<string, unknown>);
  return ctx.json(response, 200);
});

/**
 * Create one or more attachments
 */
app.openapi(attachmentRoutes.createAttachments, async (ctx) => {
  const organization = ctx.var.organization;

  const newAttachments = ctx.req.valid('json');

  canCreateEntity(ctx, { entityType: 'attachment', organizationId: organization.id });

  const attachmentRestrictions = ctx.var.tenant.restrictions.quotas.attachment;

  if (attachmentRestrictions !== 0 && newAttachments.length > attachmentRestrictions) {
    throw new AppError(403, 'restrict_by_org', 'warn', { entityType: 'attachment' });
  }

  // Idempotency check
  const batchStxId = newAttachments[0].stx.mutationId;
  const existing = await checkIdempotency(batchStxId, () =>
    tenantRead(ctx, async (readCtx) => {
      const batch = await findAttachmentsByStxMutationId(readCtx, { mutationId: batchStxId });
      return withAuditUsers(readCtx, batch);
    }),
  );
  if (existing) return ctx.json({ data: existing, rejectedIds: [] }, 200);

  const currentAttachments = await tenantRead(ctx, (readCtx) => countAttachmentsByOrg(readCtx));

  if (attachmentRestrictions !== 0 && currentAttachments + newAttachments.length > attachmentRestrictions) {
    throw new AppError(403, 'restrict_by_org', 'warn', { entityType: 'attachment' });
  }

  const attachmentsToInsert = newAttachments.map(({ stx, ...att }) => ({
    ...att,
    convertedKey: att.convertedKey || null,
    convertedContentType: att.convertedContentType || null,
    thumbnailKey: att.thumbnailKey || null,
    groupId: att.groupId || null,
    tenantId: organization.tenantId,
    organizationId: organization.id,
    createdAt: getIsoDate(),
    createdBy: ctx.var.user.id,
    stx: buildStx(stx),
  }));

  const createdAttachments = await tenantContext(ctx, (txCtx) => insertAttachments(txCtx, attachmentsToInsert));

  logEvent(ctx, 'info', 'Attachments created', { count: createdAttachments.length });

  const attachmentResponses = await withAuditUsers(ctx, createdAttachments, ctx.var.user);

  return ctx.json({ data: attachmentResponses, rejectedIds: [] }, 201);
});

/**
 * Update an attachment by id
 */
app.openapi(attachmentRoutes.updateAttachment, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const { ops: rawOps, stx } = ctx.req.valid('json');

  // Single tenantContext wraps permission check + write to avoid double-transaction pool pressure
  const updatedAttachmentRecord = await tenantContext(ctx, async (txCtx) => {
    const { entity } = await getValidProductEntity(txCtx, id, 'attachment', 'update');

    const resolved = resolveUpdateOps(entity, rawOps, stx);

    const values = {
      ...(resolved.changed ? resolved.values : {}),
      updatedAt: getIsoDate(),
      updatedBy: ctx.var.user.id,
      ...(resolved.changed ? { stx: resolved.stx } : {}),
    };
    return updateAttachment(txCtx, { id, values });
  });

  logEvent(ctx, 'info', 'Attachment updated', { attachmentId: updatedAttachmentRecord.id });

  const { fullResponse } = ctx.req.valid('query');
  const attachmentResponse = fullResponse
    ? await withAuditUser(ctx, updatedAttachmentRecord, ctx.var.user)
    : withAuditUserLite(updatedAttachmentRecord, ctx.var.user);

  return ctx.json(attachmentResponse, 200);
});

// Delete attachments
app.openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
  const { ids } = ctx.req.valid('json');

  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  const { allowedIds, rejectedIds } = await splitByPermission(ctx, 'delete', 'attachment', toDeleteIds);

  await tenantContext(ctx, (txCtx) => deleteAttachmentsByIds(txCtx, { ids: allowedIds }));

  logEvent(ctx, 'info', 'Attachments deleted', { ids: allowedIds });

  return ctx.json({ data: [] as never[], rejectedIds }, 200);
});

export { attachmentTag } from '#/modules/attachment/attachment-module';
export const attachmentHandlers = app;
