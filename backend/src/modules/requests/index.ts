import { type SQL, and, count, eq, ilike, inArray } from 'drizzle-orm';

import { OpenAPIHono } from '@hono/zod-openapi';
import { db } from '#/db/db';
import { type RequestsModel, requestsTable } from '#/db/schema/requests';
import { usersTable } from '#/db/schema/users';
import type { Env } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { sendSlackMessage } from '#/lib/notification';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import requestsRoutesConfig from './routes';

// These requests are only allowed to be created if user has none yet
const uniqueRequests: RequestsModel['type'][] = ['waitlist', 'newsletter'];

const app = new OpenAPIHono<Env>();

// Requests endpoints
const requestsRoutes = app
  /*
   *  Create request
   */
  .openapi(requestsRoutesConfig.createRequest, async (ctx) => {
    const { email, type, message } = ctx.req.valid('json');
    if (type === 'waitlist') {
      const [existingRequest] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (existingRequest) return errorResponse(ctx, 400, 'request_email_is_user', 'info');
    }

    // Check if not duplicate for unique requests
    if (uniqueRequests.includes(type)) {
      const [existingRequest] = await db
        .select()
        .from(requestsTable)
        .where(and(eq(requestsTable.email, email), inArray(requestsTable.type, uniqueRequests)));
      if (existingRequest?.type === type) return errorResponse(ctx, 409, 'request_exists', 'info');
    }

    const [{ token, ...createdRequest }] = await db
      .insert(requestsTable)
      .values({
        email,
        type,
        message,
      })
      .returning();

    // Slack notifications
    if (type === 'waitlist') await sendSlackMessage('Join waitlist', email);
    if (type === 'newsletter') await sendSlackMessage('Join newsletter', email);
    if (type === 'contact') await sendSlackMessage(`for contact from ${message}.`, email);

    const data = {
      ...createdRequest,
      requestPending: false,
    };

    return ctx.json({ success: true, data }, 200);
  })
  /*
   *  Get list of requests for system admins
   */
  .openapi(requestsRoutesConfig.getRequests, async (ctx) => {
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

    const requests = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    const items = requests.map(({ token, ...rest }) => ({
      ...rest,
      requestPending: token !== null,
    }));
    return ctx.json({ success: true, data: { items, total } }, 200);
  })
  /*
   *  Delete requests
   */
  .openapi(requestsRoutesConfig.deleteRequests, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    // Delete the requests
    await db.delete(requestsTable).where(inArray(requestsTable.id, toDeleteIds));

    return ctx.json({ success: true }, 200);
  });

export default requestsRoutes;
