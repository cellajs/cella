import { db } from '#/db/db';

import { type SQL, count, ilike, inArray } from 'drizzle-orm';
import { attachmentsTable } from '#/db/schema/attachments';
import { getContextUser, getMemberships } from '#/lib/context';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { getOrderColumn } from '#/utils/order-column';
import { splitByAllowance } from '#/utils/split-by-allowance';
import attachmentsRoutesConfig from './routes';

const app = new CustomHono();

// Attachment endpoints
const attachmentsRoutes = app
  /*
   * Create attachment
   */
  .openapi(attachmentsRoutesConfig.createAttachment, async (ctx) => {
    const newAttachment = ctx.req.valid('json');
    const user = getContextUser();
    const [createdAttachment] = await db
      .insert(attachmentsTable)
      .values({
        ...newAttachment,
        createdBy: user.id,
      })
      .returning();

    logEvent('Attachment created', { attachment: createdAttachment.id });

    return ctx.json({ success: true, data: createdAttachment }, 200);
  })
  /*
   * Get attachments
   */
  .openapi(attachmentsRoutesConfig.getAttachments, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const filter: SQL | undefined = q ? ilike(attachmentsTable.filename, `%${q}%`) : undefined;

    const orderColumn = getOrderColumn(
      {
        id: attachmentsTable.id,
        filename: attachmentsTable.filename,
        contentType: attachmentsTable.contentType,
        createdAt: attachmentsTable.createdAt,
      },
      sort,
      attachmentsTable.id,
      order,
    );

    const attachmentsQuery = db.select().from(attachmentsTable).where(filter).orderBy(orderColumn);

    const attachments = await attachmentsQuery.offset(Number(offset)).limit(Number(limit));

    const [{ total }] = await db.select({ total: count() }).from(attachmentsQuery.as('attachments'));

    return ctx.json(
      {
        success: true,
        data: {
          items: attachments,
          total,
        },
      },
      200,
    );
  })
  /*
   * Delete attachments
   */
  .openapi(attachmentsRoutesConfig.deleteAttachments, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    const memberships = getMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    if (!toDeleteIds.length) return errorResponse(ctx, 400, 'invalid_request', 'warn', 'attachment');

    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'attachment', toDeleteIds, memberships);

    // Map errors for disallowed ids
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'attachment', { attachment: id }));

    if (!allowedIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', 'attachment');

    // Delete the attachments
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, allowedIds));

    logEvent('Attachments deleted', { ids: allowedIds.join() });

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default attachmentsRoutes;
