import { type SQL, count, ilike } from 'drizzle-orm';

import { db } from '../../db/db';
import { requestsTable } from '../../db/schema/requests';
import { sendSlackNotification } from '../../lib/notification';
import { getOrderColumn } from '../../lib/order-column';
import { CustomHono } from '../../types/common';
import {
  createRequestConfig,
  getRequestsConfig,
} from './routes';

const app = new CustomHono();

// * Requests endpoints
const requestsRoutes = app
  /*
   *  Create request
   */
  .openapi(createRequestConfig, async (ctx) => {
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
    if (type === 'WAITLIST_REQUEST') await sendSlackNotification('to join the waitlist.', email);
    if (type === 'NEWSLETTER_REQUEST') await sendSlackNotification('to become a donate or build member.', email);
    if (type === 'CONTACT_REQUEST') await sendSlackNotification(`for contact from ${message}.`, email);

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
  .openapi(getRequestsConfig, async (ctx) => {
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

    const requests = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    return ctx.json({ success: true, data: { items: requests, total } }, 200);
  })


export default requestsRoutes;
