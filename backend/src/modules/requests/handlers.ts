import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type RequestModel, requestsTable } from '#/db/schema/requests';
import { usersTable } from '#/db/schema/users';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { sendMatrixMessage } from '#/lib/notifications/send-matrix-message';
import { sendSlackMessage } from '#/lib/notifications/send-slack-message';
import requestRoutes from '#/modules/requests/routes';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { RequestResponseEmail, RequestResponseEmailProps } from '../../../emails/request-was-sent';

// These requests are only allowed to be created if user has none yet
const uniqueRequests: RequestModel['type'][] = ['waitlist', 'newsletter'];

const app = new OpenAPIHono<Env>({ defaultHook });

const requestRouteHandlers = app
  /**
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

    // Determine message content based on notification type
    let textMessage: string;
    let slackTitle: string;

    switch (type) {
      case 'waitlist':
        textMessage = `New Waitlist Request\nEmail: ${normalizedEmail}`;
        slackTitle = 'Join waitlist request';
        break;
      case 'newsletter':
        textMessage = `Newsletter Signup Request\nEmail: ${normalizedEmail}`;
        slackTitle = 'Join newsletter request';
        break;
      case 'contact':
        textMessage = `Contact Request\nMessage: "${message}"\nEmail: ${normalizedEmail}`;
        slackTitle = `Request for contact with message: "${message}"`;
        break;
    }

    // Send message to Matrix
    await sendMatrixMessage({ msgtype: 'm.notice', textMessage });

    // Send message to Slack
    await sendSlackMessage(slackTitle, normalizedEmail);

    // Send email
    const lng = appConfig.defaultLanguage;
    const subject = i18n.t('backend:email.request.subject', { lng, appName: appConfig.name, requestType: type });
    const staticProps = { lng, subject, type, message };
    const recipients = [{ email: normalizedEmail }];

    type Recipient = { email: string };

    mailer.prepareEmails<RequestResponseEmailProps, Recipient>(RequestResponseEmail, staticProps, recipients);

    const data = {
      ...createdRequest,
      wasInvited: false,
    };

    return ctx.json(data, 201);
  })
  /**
   *  Get list of requests for system admins
   */
  .openapi(requestRoutes.getRequests, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const filter: SQL | undefined = q ? ilike(requestsTable.email, prepareStringForILikeFilter(q)) : undefined;

    const { tokenId, ...requestsSelect } = getTableColumns(requestsTable);

    const requestsQuery = db
      .select({ ...requestsSelect, wasInvited: sql<boolean>`(${requestsTable.tokenId} IS NOT NULL)::boolean`.as('wasInvited') })
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
  /**
   *  Delete requests
   */
  .openapi(requestRoutes.deleteRequests, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Delete the requests
    await db.delete(requestsTable).where(inArray(requestsTable.id, toDeleteIds));

    return ctx.body(null, 204);
  });

export default requestRouteHandlers;
