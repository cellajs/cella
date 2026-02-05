import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getTableColumns, gte, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';
import { html, raw } from 'hono/html';
import { appConfig } from 'shared';
import { db } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import {
  type Env,
  getContextMemberships,
  getContextOrganization,
  getContextUser,
  getContextUserSystemRole,
} from '#/lib/context';
import { AppError } from '#/lib/error';
import { getSignedUrlFromKey } from '#/lib/signed-url';
import attachmentRoutes from '#/modules/attachment/attachment-routes';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { splitByPermission } from '#/permissions/split-by-permission';
import { isTransactionProcessed } from '#/sync';
import {
  buildFieldVersions,
  checkFieldConflicts,
  getChangedTrackedFields,
  throwIfConflicts,
} from '#/sync/field-versions';
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

    const organization = getContextOrganization();

    const filters: SQL[] = [eq(attachmentsTable.organizationId, organization.id)];

    // Delta sync filter: only return attachments modified at or after the given timestamp
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

    const attachmentsQuery = db
      .select(getTableColumns(attachmentsTable))
      .from(attachmentsTable)
      .where(and(...filters));

    const [items, [{ total }]] = await Promise.all([
      attachmentsQuery.orderBy(orderColumn).limit(limit).offset(offset),
      db.select({ total: count() }).from(attachmentsQuery.as('attachments')),
    ]);

    return ctx.json({ items, total }, 200);
  })
  /**
   * Get single attachment by ID
   */
  .openapi(attachmentRoutes.getAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const organization = getContextOrganization();

    // Get attachment with permission check
    const { entity: attachment } = await getValidProductEntity(id, 'attachment', 'read');

    // Verify attachment belongs to the organization context
    if (attachment.organizationId !== organization.id) {
      throw new AppError(404, 'not_found', 'warn', { entityType: 'attachment' });
    }

    // Set cache data for passthrough pattern (appCache middleware will cache this)
    ctx.set('entityCacheData', attachment as Record<string, unknown>);

    return ctx.json(attachment, 200);
  })
  /**
   * Create one or more attachments
   */
  .openapi(attachmentRoutes.createAttachments, async (ctx) => {
    const newAttachments = ctx.req.valid('json');

    // Idempotency check - use first item's tx.id to check entire batch
    const batchTxId = newAttachments[0].tx.id;
    if (await isTransactionProcessed(batchTxId)) {
      // Fetch all items from same batch by querying tx.id in JSONB column
      const existingBatch = await db
        .select()
        .from(attachmentsTable)
        .where(sql`${attachmentsTable.tx}->>'id' = ${batchTxId}`);
      if (existingBatch.length > 0) {
        return ctx.json({ data: existingBatch, rejectedItemIds: [] }, 200);
      }
    }

    const organization = getContextOrganization();
    const user = getContextUser();
    const attachmentRestrictions = organization.restrictions.attachment;

    // Check restriction limits
    if (attachmentRestrictions !== 0 && newAttachments.length > attachmentRestrictions) {
      throw new AppError(403, 'restrict_by_org', 'warn', { entityType: 'attachment' });
    }

    const [{ currentAttachments }] = await db
      .select({ currentAttachments: count() })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.organizationId, organization.id));

    if (attachmentRestrictions !== 0 && currentAttachments + newAttachments.length > attachmentRestrictions) {
      throw new AppError(403, 'restrict_by_org', 'warn', { entityType: 'attachment' });
    }

    // Prepare attachments with tx metadata for CDC
    const attachmentsToInsert = newAttachments.map(({ tx, ...att }) => ({
      ...att,
      entityType: 'attachment' as const,
      createdAt: getIsoDate(),
      createdBy: user.id,
      modifiedAt: null,
      modifiedBy: null,
      keywords: '', // Required by productEntityColumns
      description: '', // Required by baseEntityColumns
      // Sync: write transient tx metadata for CDC Worker
      tx: {
        id: tx.id,
        sourceId: tx.sourceId,
        version: 1,
        fieldVersions: {},
      },
    }));

    const createdAttachments = await db.insert(attachmentsTable).values(attachmentsToInsert).returning();

    logEvent('info', `${createdAttachments.length} attachments have been created`);

    // Return entities with tx embedded (for client tracking)
    return ctx.json({ data: createdAttachments, rejectedItemIds: [] }, 201);
  })
  /**
   * Update an attachment by id
   */
  .openapi(attachmentRoutes.updateAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const { tx, ...updatedFields } = ctx.req.valid('json');

    const { entity, can } = await getValidProductEntity(id, 'attachment', 'update');

    const user = getContextUser();

    // Get all tracked fields that are being updated
    const trackedFields = ['name', 'filename', 'contentType'] as const;
    const changedFields = getChangedTrackedFields(updatedFields, trackedFields);

    // Field-level conflict detection - check ALL changed fields
    const { conflicts } = checkFieldConflicts(changedFields, entity.tx, tx.baseVersion);
    throwIfConflicts('attachment', conflicts);

    const newVersion = (entity.tx?.version ?? 0) + 1;

    const [updatedAttachment] = await db
      .update(attachmentsTable)
      .set({
        ...updatedFields,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
        // Sync: write transient tx metadata for CDC Worker + client tracking
        tx: {
          id: tx.id,
          sourceId: tx.sourceId,
          version: newVersion,
          fieldVersions: buildFieldVersions(entity.tx?.fieldVersions, changedFields, newVersion),
        },
      })
      .where(eq(attachmentsTable.id, id))
      .returning();

    logEvent('info', 'Attachment updated', { attachmentId: updatedAttachment.id });

    // Return entity directly with can permissions (tx embedded for client tracking)
    return ctx.json({ ...updatedAttachment, can }, 200);
  })
  /**
   * Delete attachments by ids
   */
  .openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
    const { ids, tx } = ctx.req.valid('json');

    const memberships = getContextMemberships();

    // tx is available for CDC echo prevention (sourceId tracking)
    // CDC will read tx from the deleted row's old data
    if (tx) {
      logEvent('debug', 'Delete with tx metadata', { txId: tx.id, sourceId: tx.sourceId });
    }

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError(400, 'invalid_request', 'warn', { entityType: 'attachment' });

    const { allowedIds, disallowedIds: rejectedItemIds } = await splitByPermission(
      'delete',
      'attachment',
      toDeleteIds,
      memberships,
    );

    if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType: 'attachment' });

    // Delete the attachments
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, allowedIds));

    logEvent('info', 'Attachments deleted', allowedIds);

    return ctx.json({ success: true, rejectedItemIds }, 200);
  })
  /**
   * Redirect to attachment
   */
  .openapi(attachmentRoutes.redirectToAttachment, async (ctx) => {
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
  })
  /**
   * Get presigned URL for private attachment
   */
  .openapi(attachmentRoutes.getPresignedUrl, async (ctx) => {
    const { key } = ctx.req.valid('query');

    const [attachment] = await db
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

    // Determine bucket - use attachment record if found, otherwise assume private
    const bucketName = attachment?.bucketName ?? appConfig.s3.privateBucket;

    // Permission check: verify user has access to this attachment
    if (attachment) {
      const user = getContextUser();
      const userSystemRole = getContextUserSystemRole();

      const memberships = await db
        .select(membershipBaseSelect)
        .from(membershipsTable)
        .where(eq(membershipsTable.userId, user.id));

      const isSystemAdmin = userSystemRole === 'admin';
      const { isAllowed } = checkPermission(memberships, 'read', attachment);

      if (!isSystemAdmin && !isAllowed) {
        throw new AppError(403, 'forbidden', 'warn', { entityType: attachment.entityType });
      }
    }

    const url = await getSignedUrlFromKey(key, { bucketName, isPublic: false });

    return ctx.json(url, 200);
  });

export default attachmentRouteHandlers;
