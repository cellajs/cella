import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getColumns, gte, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';
import { html, raw } from 'hono/html';
import { appConfig } from 'shared';
import { attachmentsTable } from '#/db/schema/attachments';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { seenCountsTable } from '#/db/schema/seen-counts';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { getSignedUrlFromKey } from '#/lib/signed-url';
import attachmentRoutes from '#/modules/attachment/attachment-routes';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import {
  auditUserSelect,
  coalesceAuditUsers,
  createdByUser,
  modifiedByUser,
  withAuditUser,
  withAuditUsers,
} from '#/modules/user/helpers/audit-user';
import { canAccessEntity, canCreateEntity, checkPermission } from '#/permissions';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { splitByPermission } from '#/permissions/split-by-permission';
import { buildStx, isTransactionProcessed } from '#/sync';
import { checkFieldConflicts, throwIfConflicts } from '#/sync/field-versions';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const attachmentRouteHandlers = app
  /**
   * Get list of attachments
   */
  .openapi(attachmentRoutes.getAttachments, async (ctx) => {
    const { q, sort, order, limit, offset, modifiedAfter } = ctx.req.valid('query');

    const organization = ctx.var.organization;

    canAccessEntity(ctx, 'read', { entityType: 'attachment', organizationId: organization.id });

    const filters: SQL[] = [eq(attachmentsTable.organizationId, organization.id)];

    // Delta sync filter
    if (modifiedAfter) {
      filters.push(gte(attachmentsTable.modifiedAt, modifiedAfter));
    }

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

    const tenantDb = ctx.var.db;
    const { createdBy: _cb, modifiedBy: _mb, ...attachmentCols } = getColumns(attachmentsTable);
    const attachmentsQuery = tenantDb
      .select({
        ...attachmentCols,
        ...auditUserSelect,
        viewCount: sql<number>`coalesce(${seenCountsTable.viewCount}, 0)`.as('view_count'),
      })
      .from(attachmentsTable)
      .leftJoin(seenCountsTable, eq(seenCountsTable.entityId, attachmentsTable.id))
      .leftJoin(createdByUser, eq(createdByUser.id, attachmentsTable.createdBy))
      .leftJoin(modifiedByUser, eq(modifiedByUser.id, attachmentsTable.modifiedBy))
      .where(and(...filters));

    const [items, [{ total }]] = await Promise.all([
      attachmentsQuery.orderBy(orderColumn).limit(limit).offset(offset),
      tenantDb.select({ total: count() }).from(attachmentsQuery.as('attachments')),
    ]);

    return ctx.json({ items: coalesceAuditUsers(items), total }, 200);
  })
  /**
   * Get presigned URL for private attachment.
   * IMPORTANT: Must be registered before /{id} routes to avoid path conflict.
   */
  .openapi(attachmentRoutes.getPresignedUrl, async (ctx) => {
    const { key } = ctx.req.valid('query');

    const tenantDb = ctx.var.db;

    const [attachment] = await tenantDb
      .select()
      .from(attachmentsTable)
      .where(
        or(
          eq(attachmentsTable.originalKey, key),
          eq(attachmentsTable.thumbnailKey, key),
          eq(attachmentsTable.convertedKey, key),
        ),
      )
      .limit(1);

    const bucketName = attachment?.bucketName ?? appConfig.s3.privateBucket;

    if (attachment) {
      const user = ctx.var.user;
      const isSystemAdmin = ctx.var.isSystemAdmin;

      const memberships = await tenantDb
        .select(membershipBaseSelect)
        .from(membershipsTable)
        .where(eq(membershipsTable.userId, user.id));

      const { isAllowed } = checkPermission(memberships, 'read', attachment);

      if (!isSystemAdmin && !isAllowed) {
        throw new AppError(403, 'forbidden', 'warn', { entityType: attachment.entityType });
      }
    }

    const url = await getSignedUrlFromKey(key, { bucketName, isPublic: false });

    return ctx.json(url, 200);
  })
  /**
   * Get single attachment by ID
   */
  .openapi(attachmentRoutes.getAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const organization = ctx.var.organization;

    const { entity: attachment } = await getValidProductEntity(ctx, id, 'attachment', 'read');

    if (attachment.organizationId !== organization.id) {
      throw new AppError(404, 'not_found', 'warn', { entityType: 'attachment' });
    }

    const tenantDb = ctx.var.db;
    const attachmentResponse = await withAuditUser(attachment, tenantDb);

    ctx.set('entityCacheData', attachmentResponse as Record<string, unknown>);

    return ctx.json(attachmentResponse, 200);
  })
  /**
   * Create one or more attachments
   */
  .openapi(attachmentRoutes.createAttachments, async (ctx) => {
    const newAttachments = ctx.req.valid('json');
    const tenantDb = ctx.var.db;

    const organization = ctx.var.organization;

    canCreateEntity(ctx, { entityType: 'attachment', organizationId: organization.id });

    // Idempotency check
    const batchStxId = newAttachments[0].stx.mutationId;

    if (await isTransactionProcessed(batchStxId, tenantDb)) {
      const existingBatch = await tenantDb
        .select()
        .from(attachmentsTable)
        .where(sql`${attachmentsTable.stx}->>'mutationId' = ${batchStxId}`);
      if (existingBatch.length > 0) {
        const attachmentResponses = await withAuditUsers(existingBatch, tenantDb);
        return ctx.json({ data: attachmentResponses, rejectedItemIds: [] }, 200);
      }
    }

    const user = ctx.var.user;
    const attachmentRestrictions = ctx.var.tenant.restrictions.quotas.attachment;

    if (attachmentRestrictions !== 0 && newAttachments.length > attachmentRestrictions) {
      throw new AppError(403, 'restrict_by_org', 'warn', { entityType: 'attachment' });
    }

    const [{ currentAttachments }] = await tenantDb
      .select({ currentAttachments: count() })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.organizationId, organization.id));

    if (attachmentRestrictions !== 0 && currentAttachments + newAttachments.length > attachmentRestrictions) {
      throw new AppError(403, 'restrict_by_org', 'warn', { entityType: 'attachment' });
    }

    const attachmentsToInsert = newAttachments.map(({ stx, ...att }) => ({
      ...att,
      tenantId: organization.tenantId,
      organizationId: organization.id,
      createdAt: getIsoDate(),
      createdBy: user.id,
      stx: buildStx(stx),
    }));

    const createdAttachments = await tenantDb.insert(attachmentsTable).values(attachmentsToInsert).returning();

    logEvent('info', `${createdAttachments.length} attachments have been created`);

    const attachmentResponses = await withAuditUsers(createdAttachments, tenantDb, user);

    return ctx.json({ data: attachmentResponses, rejectedItemIds: [] }, 201);
  })
  /**
   * Update an attachment by id
   */
  .openapi(attachmentRoutes.updateAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const { key, data: updateData, stx } = ctx.req.valid('json');

    const { entity } = await getValidProductEntity(ctx, id, 'attachment', 'update');

    const user = ctx.var.user;

    // Field-level conflict detection
    const changedFields = key ? [key] : [];
    const { conflicts } = checkFieldConflicts(changedFields, entity.stx, stx.lastReadVersion);
    throwIfConflicts('attachment', conflicts);

    const tenantDb = ctx.var.db;

    const [updatedAttachmentRecord] = await tenantDb
      .update(attachmentsTable)
      .set({
        [key]: updateData,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
        stx: buildStx(stx, entity, changedFields),
      })
      .where(eq(attachmentsTable.id, id))
      .returning();

    logEvent('info', 'Attachment updated', { attachmentId: updatedAttachmentRecord.id });

    const attachmentResponse = await withAuditUser(updatedAttachmentRecord, tenantDb, user);

    return ctx.json(attachmentResponse, 200);
  })
  // Delete attachments
  .openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
    const { ids, stx } = ctx.req.valid('json');

    const memberships = ctx.var.memberships;

    // Log stx for CDC echo prevention
    if (stx) {
      logEvent('debug', 'Delete with stx metadata', { stxId: stx.mutationId, sourceId: stx.sourceId });
    }

    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    const { allowedIds, disallowedIds: rejectedItemIds } = await splitByPermission(
      ctx,
      'delete',
      'attachment',
      toDeleteIds,
      memberships,
    );

    const tenantDb = ctx.var.db;
    await tenantDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, allowedIds));

    logEvent('info', 'Attachments deleted', allowedIds);

    return ctx.json({ data: [] as never[], rejectedItemIds }, 200);
  })
  /**
   * Redirect to attachment
   */
  .openapi(attachmentRoutes.redirectToAttachment, async (ctx) => {
    const db = ctx.var.db;
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));
    if (!attachment) throw new AppError(404, 'not_found', 'warn', { entityType: 'attachment' });

    const [organization] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, attachment.organizationId));
    if (!organization) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });

    const url = new URL(`${appConfig.frontendUrl}/organization/${organization.slug}/attachments`);
    url.searchParams.set('attachmentDialogId', attachment.id);
    if (attachment.groupId) url.searchParams.set('groupId', attachment.groupId);

    const redirectUrl = url.toString();

    return ctx.html(html`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />

          <title>${attachment.filename}</title>
          <meta property="og:description" content="View an attachment in ${organization.name}." />
          <meta name="description" content="View an attachment in ${organization.name}." />
          <meta property="og:url" content="${redirectUrl}" />

          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="${appConfig.name}" />
          <meta property="og:locale" content="${appConfig.defaultLanguage}" />
          <link rel="logo" type="image/png" href="/static/logo/logo.png" />
          <link rel="icon" type="image/png" sizes="512x512" href="/static/icons/icon-512x512.png" />
          <link rel="icon" type="image/png" sizes="192x192" href="/static/icons/icon-192x192.png" />
          <meta name="robots" content="index,follow" />
        </head>
      <script>
        ${raw(`window.location.href = "${redirectUrl}";`)}
      </script>
      </html>
    `);
  });

export default attachmentRouteHandlers;
