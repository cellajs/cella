import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { html, raw } from 'hono/html';
import { db } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/error';
import attachmentRoutes from '#/modules/attachment/attachment-routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import { getEntityByTransaction, isTransactionProcessed } from '#/sync';
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
    const { q, sort, order, limit, offset } = ctx.req.valid('query');

    const organization = getContextOrganization();

    const filters: SQL[] = [eq(attachmentsTable.organizationId, organization.id)];

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

    const orderColumn = getOrderColumn(
      {
        name: attachmentsTable.name,
        createdAt: attachmentsTable.createdAt,
        contentType: attachmentsTable.contentType,
      },
      sort,
      attachmentsTable.createdAt,
      order,
    );

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
   * Create one or more attachments
   */
  .openapi(attachmentRoutes.createAttachments, async (ctx) => {
    const { data: newAttachments, tx } = ctx.req.valid('json');

    // Idempotency check - return existing entities if transaction already processed
    if (await isTransactionProcessed(tx.id)) {
      const ref = await getEntityByTransaction(tx.id);
      if (ref) {
        // For batch create, the first attachment ID is stored - fetch all from that batch
        const existing = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, ref.entityId));
        if (existing.length > 0) {
          return ctx.json({ data: existing, rejectedItemIds: [] }, 200);
        }
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
    const attachmentsToInsert = newAttachments.map((att) => ({
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
    const { data: updatedFields, tx } = ctx.req.valid('json');

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
    const { ids } = ctx.req.valid('json');

    const memberships = getContextMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError(400, 'invalid_request', 'warn', { entityType: 'attachment' });

    const { allowedIds, disallowedIds: rejectedItemIds } = await splitByAllowance(
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
  });

export default attachmentRouteHandlers;
