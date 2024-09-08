import { type SQL, count, ilike } from 'drizzle-orm';

import { db } from '#/db/db';
import { requestsTable } from '#/db/schema/requests';
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

export type AppRequestsType = typeof requestsRoutes;

export default requestsRoutes;
