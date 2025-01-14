import { type SQL, and, count, eq, ilike, inArray } from 'drizzle-orm';

import { config } from 'config';
import { render } from 'jsx-email';
import { db } from '#/db/db';
import { requestsTable } from '#/db/schema/requests';
import { usersTable } from '#/db/schema/users';
import { getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { emailSender } from '#/lib/mailer';
import { sendSlackMessage } from '#/lib/notification';
import { CustomHono } from '#/types/common';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { RequestsFeedback } from '../../../emails/requests-feedback';
import { env } from '../../../env';
import requestsRoutesConfig from './routes';

const conflictingTypes = ['waitlist', 'newsletter'];

const app = new CustomHono();

// Requests endpoints
const requestsRoutes = app
  /*
   *  Create request
   */
  .openapi(requestsRoutesConfig.createRequest, async (ctx) => {
    const { email, type, message } = ctx.req.valid('json');
    if (type === 'waitlist') {
      const [existingRequest] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (existingRequest) return errorResponse(ctx, 401, 'request_email_is_user', 'info');
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
        message,
      })
      .returning();

    // slack notifications
    if (type === 'waitlist') await sendSlackMessage('Join waitlist.', email);
    if (type === 'newsletter') await sendSlackMessage('Newsletter', email);
    if (type === 'contact') await sendSlackMessage(`for contact from ${message}.`, email);

    return ctx.json({ success: true, data: createdAccessRequest }, 200);
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

    const items = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

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
  })
  /*
   *  Send feedback letter to requests
   */
  .openapi(requestsRoutesConfig.sendFeedbackLetters, async (ctx) => {
    const user = getContextUser();
    const { emails, subject, content } = ctx.req.valid('json');

    // Generate email HTML
    const emailHtml = await render(
      RequestsFeedback({
        userLanguage: user.language,
        subject,
        content,
        appName: config.name,
      }),
    );
    // For test purposes
    if (env.NODE_ENV === 'development') {
      emailSender.send(env.SEND_ALL_TO_EMAIL ?? user.email, subject, emailHtml);
    } else {
      for (const email of emails) emailSender.send(email, subject, emailHtml);
    }

    return ctx.json({ success: true }, 200);
  });

export default requestsRoutes;
