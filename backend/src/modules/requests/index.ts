import { type SQL, and, count, eq, ilike, inArray } from 'drizzle-orm';

import { db } from '#/db/db';
import { requestsTable } from '#/db/schema/requests';
import { usersTable } from '#/db/schema/users';
import { errorResponse } from '#/lib/errors';
import { sendSlackNotification } from '#/lib/notification';
import { getOrderColumn } from '#/lib/order-column';
import { CustomHono } from '#/types/common';
import requestsRoutesConfig from './routes';

const app = new CustomHono();

// Requests endpoints
const requestsRoutes = app
  /*
   *  Create request
   */
  .openapi(requestsRoutesConfig.createRequest, async (ctx) => {
    const { email, type, message } = ctx.req.valid('json');

    const conflictingTypes = ['waitlist', 'newsletter'];
    if (type === 'waitlist') {
      const [existingRequest] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (existingRequest) return errorResponse(ctx, 400, 'request_email_is_user', 'info');
    }

    if (conflictingTypes.includes(type)) {
      const [existingRequest] = await db
        .select()
        .from(requestsTable)
        .where(and(eq(requestsTable.email, email), inArray(requestsTable.type, ['waitlist', 'newsletter'])));
      if (existingRequest?.type === type) return errorResponse(ctx, 409, 'request_exists', 'info');
      if (conflictingTypes.includes(existingRequest?.type)) return errorResponse(ctx, 400, `${type}_request_error`, 'info');
    }

    const [createdAccessRequest] = await db
      .insert(requestsTable)
      .values({
        email,
        type,
        message: message,
      })
      .returning();

    // slack notifications
    if (type === 'waitlist') await sendSlackNotification('to join the waitlist.', email);
    if (type === 'newsletter') await sendSlackNotification('to become a donate or build member.', email);
    if (type === 'contact') await sendSlackNotification(`for contact from ${message}.`, email);

    return ctx.json(
      {
        success: true,
        data: {
          email: createdAccessRequest.email,
          type: createdAccessRequest.type,
        },
      },
      200,
    );
  })
  /*
   *  Get list of requests for system admins
   */
  .openapi(requestsRoutesConfig.getRequests, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const filter: SQL | undefined = q ? ilike(requestsTable.email, `%${q}%`) : undefined;

    const requestsQuery = db.select().from(requestsTable).where(filter);

    const [{ total }] = await db.select({ total: count() }).from(requestsQuery.as('requests'));

    const orderColumn = getOrderColumn(
      {
        id: requestsTable.id,
        email: requestsTable.email,
        createdAt: requestsTable.createdAt,
        type: requestsTable.type,
      },
      sort,
      requestsTable.id,
      order,
    );

    const items = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    return ctx.json({ success: true, data: { items, total } }, 200);
  });

export default requestsRoutes;
