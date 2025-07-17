import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getTableColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';

import { db } from '#/db/db';
import { type RequestModel, requestsTable } from '#/db/schema/requests';
import type { Env } from '#/lib/context';
import { ApiError } from '#/lib/errors';
import { sendSlackMessage } from '#/lib/notifications';
import requestRoutes from '#/modules/requests/routes';
import { getUserBy } from '#/modules/users/helpers/get-user-by';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

// These requests are only allowed to be created if user has none yet
const uniqueRequests: RequestModel['type'][] = ['waitlist', 'newsletter'];

const app = new OpenAPIHono<Env>({ defaultHook });

const requestRouteHandlers = app
  /*
   *  Create request
   */
  .openapi(requestRoutes.createRequest, async (ctx) => {
    const { email, type, message } = ctx.req.valid('json');

    const loweredEmail = email.toLowerCase();

    if (type === 'waitlist') {
      const existingUser = await getUserBy('email', loweredEmail);
      if (existingUser) throw new ApiError({ status: 400, type: 'request_email_is_user' });
    }

    // Check if not duplicate for unique requests
    if (uniqueRequests.includes(type)) {
      const [existingRequest] = await db
        .select()
        .from(requestsTable)
        .where(and(eq(requestsTable.email, loweredEmail), inArray(requestsTable.type, uniqueRequests)));
      if (existingRequest?.type === type) throw new ApiError({ status: 409, type: 'request_exists' });
    }
    const { tokenId, ...requestsSelect } = getTableColumns(requestsTable);

    const [createdRequest] = await db
      .insert(requestsTable)
      .values({ email: loweredEmail, type, message })
      .returning({ ...requestsSelect });

    // Slack notifications
    if (type === 'waitlist') await sendSlackMessage('Join waitlist request', loweredEmail);
    if (type === 'newsletter') await sendSlackMessage('Join newsletter request', loweredEmail);
    if (type === 'contact') await sendSlackMessage(`Request for contact with message: ${message},`, loweredEmail);

    const data = {
      ...createdRequest,
      wasInvited: false,
    };

    return ctx.json(data, 200);
  })
  /*
   *  Get list of requests for system admins
   */
  .openapi(requestRoutes.getRequests, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const filter: SQL | undefined = q ? ilike(requestsTable.email, prepareStringForILikeFilter(q)) : undefined;

    const { tokenId, ...requestsSelect } = getTableColumns(requestsTable);

    const requestsQuery = db
      .select({ ...requestsSelect, wasInvited: sql`(${requestsTable.tokenId} IS NOT NULL)`.as('wasInvited') })
      .from(requestsTable)
      .where(filter);

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

    return ctx.json({ items, total }, 200);
  })
  /*
   *  Delete requests
   */
  .openapi(requestRoutes.deleteRequests, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new ApiError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Delete the requests
    await db.delete(requestsTable).where(inArray(requestsTable.id, toDeleteIds));

    return ctx.json(true, 200);
  });

export default requestRouteHandlers;
