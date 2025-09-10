import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getTableColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type RequestModel, requestsTable } from '#/db/schema/requests';
import { usersTable } from '#/db/schema/users';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { sendSlackMessage } from '#/lib/notifications';
import requestRoutes from '#/modules/requests/routes';
import { usersBaseQuery } from '#/modules/users/helpers/select';
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

    const normalizedEmail = email.toLowerCase().trim();

    if (type === 'waitlist') {
      const [existingUser] = await usersBaseQuery()
        .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
        .where(eq(emailsTable.email, normalizedEmail))
        .limit(1);

      if (existingUser) throw new AppError({ status: 400, type: 'request_email_is_user' });
    }

    // Check if not duplicate for unique requests
    if (uniqueRequests.includes(type)) {
      const [existingRequest] = await db
        .select()
        .from(requestsTable)
        .where(and(eq(requestsTable.email, normalizedEmail), inArray(requestsTable.type, uniqueRequests)));
      if (existingRequest?.type === type) throw new AppError({ status: 409, type: 'request_exists' });
    }
    const { tokenId, ...requestsSelect } = getTableColumns(requestsTable);

    const [createdRequest] = await db
      .insert(requestsTable)
      .values({ email: normalizedEmail, type, message })
      .returning({ ...requestsSelect });

    // Slack notifications
    if (type === 'waitlist') await sendSlackMessage('Join waitlist request', normalizedEmail);
    if (type === 'newsletter') await sendSlackMessage('Join newsletter request', normalizedEmail);
    if (type === 'contact') await sendSlackMessage(`Request for contact with message: ${message},`, normalizedEmail);

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

    const items = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(limit).offset(offset);

    return ctx.json({ items, total }, 200);
  })
  /*
   *  Delete requests
   */
  .openapi(requestRoutes.deleteRequests, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Delete the requests
    await db.delete(requestsTable).where(inArray(requestsTable.id, toDeleteIds));

    return ctx.json(true, 200);
  });

export default requestRouteHandlers;
