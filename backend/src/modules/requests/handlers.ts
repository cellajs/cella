import { type SQL, and, count, eq, ilike, inArray } from 'drizzle-orm';

import { OpenAPIHono } from '@hono/zod-openapi';
import { db } from '#/db/db';
import { type RequestModel, requestsTable } from '#/db/schema/requests';
import type { Env } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { sendSlackMessage } from '#/lib/notification';
import defaultHook from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { getUserBy } from '../users/helpers/get-user-by';
import requestsRouteConfig from './routes';

// These requests are only allowed to be created if user has none yet
const uniqueRequests: RequestModel['type'][] = ['waitlist', 'newsletter'];

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

const requestsRoutes = app
  /*
   *  Create request
   */
  .openapi(requestsRouteConfig.createRequest, async (ctx) => {
    const { email, type, message } = ctx.req.valid('json');

    if (type === 'waitlist') {
      const existingUser = await getUserBy('email', email);
      if (existingUser) return errorResponse(ctx, 400, 'request_email_is_user', 'info');
    }

    // Check if not duplicate for unique requests
    if (uniqueRequests.includes(type)) {
      const [existingRequest] = await db
        .select()
        .from(requestsTable)
        .where(and(eq(requestsTable.email, email), inArray(requestsTable.type, uniqueRequests)));
      if (existingRequest?.type === type) return errorResponse(ctx, 409, 'request_exists', 'info');
    }

    const [{ ...createdRequest }] = await db.insert(requestsTable).values({ email, type, message }).returning();

    // Slack notifications
    if (type === 'waitlist') await sendSlackMessage('Join waitlist', email);
    if (type === 'newsletter') await sendSlackMessage('Join newsletter', email);
    if (type === 'contact') await sendSlackMessage(`for contact from ${message}.`, email);

    const data = {
      ...createdRequest,
    };

    return ctx.json({ success: true, data }, 200);
  })
  /*
   *  Get list of requests for system admins
   */
  .openapi(requestsRouteConfig.getRequests, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const filter: SQL | undefined = q ? ilike(requestsTable.email, prepareStringForILikeFilter(q)) : undefined;

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
  })
  /*
   *  Delete requests
   */
  .openapi(requestsRouteConfig.deleteRequests, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    // Delete the requests
    await db.delete(requestsTable).where(inArray(requestsTable.id, toDeleteIds));

    return ctx.json({ success: true }, 200);
  });

export default requestsRoutes;
