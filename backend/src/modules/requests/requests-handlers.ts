import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import i18n from 'i18next';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type RequestModel, requestsTable } from '#/db/schema/requests';
import { usersTable } from '#/db/schema/users';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { mailer } from '#/lib/mailer';
import { sendMatrixMessage } from '#/lib/notifications/send-matrix-message';
import requestRoutes from '#/modules/requests/requests-routes';
import { userSelect } from '#/modules/user/helpers/select';
import { type ActivityEventWithEntity, activityBus, getTypedEntity } from '#/sync/activity-bus';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { RequestInfoEmail, RequestResponseEmail } from '../../../emails';

// These requests are only allowed to be created if user has none yet
const uniqueRequests: RequestModel['type'][] = ['waitlist', 'newsletter'];

// ============================================
// ActivityBus: link waitlist requests to invitation tokens
// ============================================
// When an inactive membership is created with a tokenId, update the matching
// waitlist request so it is marked as "invited". This keeps the requests module
// self-contained — the memberships module has no knowledge of requests.
activityBus.on('inactive_membership.created', async (event: ActivityEventWithEntity) => {
  const membership = getTypedEntity(event, 'inactive_membership');
  if (!membership?.tokenId || !membership.email) return;

  try {
    await baseDb
      .update(requestsTable)
      .set({ tokenId: membership.tokenId })
      .where(and(eq(requestsTable.email, membership.email), eq(requestsTable.type, 'waitlist')));
  } catch (error) {
    logEvent('error', 'Failed to link waitlist request to token', { error, email: membership.email });
  }
});

const app = new OpenAPIHono<Env>({ defaultHook });

const requestsRouteHandlers = app
  /**
   *  Create request
   */
  .openapi(requestRoutes.createRequest, async (ctx) => {
    const db = ctx.var.db;
    const { email, type: requestType, message } = ctx.req.valid('json');
    // Cast type to proper literal union for Drizzle v1 strict types
    const type = requestType as RequestModel['type'];

    const normalizedEmail = email.toLowerCase().trim();

    if (type === 'waitlist') {
      const [existingUser] = await db
        .select(userSelect)
        .from(usersTable)
        .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
        .where(eq(emailsTable.email, normalizedEmail))
        .limit(1);

      if (existingUser) throw new AppError(400, 'request_email_is_user', 'info');
    }

    // Check if not duplicate for unique requests
    if (uniqueRequests.includes(type)) {
      const [existingRequest] = await db
        .select()
        .from(requestsTable)
        .where(and(eq(requestsTable.email, normalizedEmail), inArray(requestsTable.type, uniqueRequests)));
      if (existingRequest?.type === type) throw new AppError(409, 'request_exists', 'info');
    }
    const { tokenId, ...requestsSelect } = getColumns(requestsTable);

    const [createdRequest] = await db
      .insert(requestsTable)
      .values({ email: normalizedEmail, type, message })
      .returning({ ...requestsSelect });

    // Determine message content based on notification type
    let textMessage: string;
    let title: string;

    switch (type) {
      case 'waitlist':
        textMessage = `New Waitlist Request\nEmail: ${normalizedEmail}`;
        title = 'Join waitlist request';
        break;
      case 'newsletter':
        textMessage = `Newsletter Signup Request\nEmail: ${normalizedEmail}`;
        title = 'Join newsletter request';
        break;
      case 'contact':
        textMessage = `Contact Request\nMessage: "${message}"\nEmail: ${normalizedEmail}`;
        title = `Request for contact with message: "${message}"`;
        break;
      default:
        textMessage = `Request\nEmail: ${normalizedEmail}`;
        title = 'Request received';
    }

    // Send message to Matrix
    const matrixResp = await sendMatrixMessage({ msgtype: 'm.notice', textMessage });

    // Send email
    const lng = appConfig.defaultLanguage;
    const subject = i18n.t('backend:email.request.subject', { lng, appName: appConfig.name, requestType: type });
    const staticProps = { lng, subject, type, message };
    const recipients = [{ email: normalizedEmail }];

    if (!matrixResp || !matrixResp.ok) {
      mailer.prepareEmails(RequestInfoEmail, { ...staticProps, subject: title }, [{ email: appConfig.company.email }]);
    }

    mailer.prepareEmails(RequestResponseEmail, staticProps, recipients);

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
    const db = ctx.var.db;
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const filter: SQL | undefined = q ? ilike(requestsTable.email, prepareStringForILikeFilter(q)) : undefined;

    const { tokenId, ...requestsSelect } = getColumns(requestsTable);

    const requestsQuery = db
      .select({
        ...requestsSelect,
        wasInvited: sql<boolean>`(${requestsTable.tokenId} IS NOT NULL)::boolean`.as('wasInvited'),
      })
      .from(requestsTable)
      .where(filter);

    const [{ total }] = await db.select({ total: count() }).from(requestsQuery.as('requests'));

    const orderColumn = getOrderColumn(sort, requestsTable.id, order, {
      id: requestsTable.id,
      email: requestsTable.email,
      createdAt: requestsTable.createdAt,
      type: requestsTable.type,
    });

    const items = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(limit).offset(offset);

    return ctx.json({ items, total }, 200);
  })
  /**
   *  Delete requests
   */
  .openapi(requestRoutes.deleteRequests, async (ctx) => {
    const db = ctx.var.db;
    const { ids } = ctx.req.valid('json');

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError(400, 'invalid_request', 'error');

    // Delete the requests
    await db.delete(requestsTable).where(inArray(requestsTable.id, toDeleteIds));

    return ctx.json({ data: [], rejectedItemIds: [] }, 200);
  });

export default requestsRouteHandlers;
