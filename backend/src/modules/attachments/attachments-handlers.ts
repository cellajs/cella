import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { html, raw } from 'hono/html';
import { db } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/error';
import attachmentRoutes from '#/modules/attachments/attachments-routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import { defaultHook } from '#/utils/default-hook';
import { proxyElectricSync } from '#/utils/electric-utils';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const attachmentsRouteHandlers = app
  /**
   * Proxy to electric for syncing to client
   * Hono handlers are executed in registration order, so registered first to avoid route collisions.
   */
  .openapi(attachmentRoutes.syncAttachments, async (ctx) => {
    const { table, ...query } = ctx.req.valid('query');

    // Validate query params
    if (table !== 'attachments') throw new AppError(400, 'sync_table_mismatch', 'error');

    if (query.where && /organization_id\s*=/.test(query.where)) {
      throw new AppError(400, 'sync_organization_mismatch', 'error');
    }
    const organization = getContextOrganization();

    const clientWhere = query.where || '';

    query.where = clientWhere ? `organization_id = $1 AND (${clientWhere})` : `organization_id = $1`;

    // Provide the organization ID as params for the parameterized query
    // Electric SQL expects object format: {"1": "value"} for $1 placeholder
    const enrichedQuery = {
      ...query,
      params: JSON.stringify({ '1': organization.id }),
    };

    return await proxyElectricSync(table, enrichedQuery, 'attachment');
  })
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
    const newAttachments = ctx.req.valid('json');

    const organization = getContextOrganization();
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

    const createdAttachments = await db.insert(attachmentsTable).values(newAttachments).returning();

    logEvent('info', `${createdAttachments.length} attachments have been created`);

    return ctx.json(createdAttachments, 201);
  })
  /**
   * Update an attachment by id
   */
  .openapi(attachmentRoutes.updateAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    await getValidProductEntity(id, 'attachment', 'update');

    const user = getContextUser();
    const updatedFields = ctx.req.valid('json');

    const [updatedAttachment] = await db
      .update(attachmentsTable)
      .set({
        ...updatedFields,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(attachmentsTable.id, id))
      .returning();

    logEvent('info', 'Attachment updated', { attachmentId: updatedAttachment.id });

    return ctx.json(updatedAttachment, 200);
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

    const { allowedIds, disallowedIds: rejectedItems } = await splitByAllowance(
      'delete',
      'attachment',
      toDeleteIds,
      memberships,
    );

    if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType: 'attachment' });

    // Delete the attachments
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, allowedIds));

    logEvent('info', 'Attachments deleted', allowedIds);

    return ctx.json({ success: true, rejectedItems }, 200);
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

export default attachmentsRouteHandlers;
