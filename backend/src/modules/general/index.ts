import { type SQL, and, count, eq, ilike, ne, or } from 'drizzle-orm';
import { emailSender } from '../../../../email';
import { InviteEmail } from '../../../../email/emails/invite';

import { render } from '@react-email/render';
import { config } from 'config';
import { env } from 'env';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import jwt from 'jsonwebtoken';
import { type User, generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';

import { db } from '../../db/db';

import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { requestsTable } from '../../db/schema/requests';
import { type TokenModel, tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { errorResponse } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { sendSlackNotification } from '../../lib/notification';
import { getOrderColumn } from '../../lib/order-column';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { apiUserSchema } from '../users/schema';
import { checkRole } from './helpers/check-role';
import { checkSlugAvailable } from './helpers/check-slug';
import {
  acceptInviteRouteConfig,
  actionRequestsConfig,
  checkSlugRouteConfig,
  checkTokenRouteConfig,
  getUploadTokenRouteConfig,
  inviteRouteConfig,
  paddleWebhookRouteConfig,
  requestActionConfig,
  suggestionsConfig,
} from './routes';
import { isAuthenticated } from '../../middlewares/guard';
import { entityTables } from '../../lib/entity';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new CustomHono();

export const streams = new Map<string, SSEStreamingApi>();

// * General endpoints
const generalRoutes = app
  /*
   * Get upload token
   */
  .openapi(getUploadTokenRouteConfig, async (ctx) => {
    const isPublic = ctx.req.query('public');
    const user = ctx.get('user');
    // TODO: validate query param organization?
    const organizationId = ctx.req.query('organizationId');

    const sub = organizationId ? `${organizationId}/${user.id}` : user.id;

    const token = jwt.sign(
      {
        sub: sub,
        public: isPublic === 'true',
        imado: !!env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
      },
      env.TUS_UPLOAD_API_SECRET,
    );

    return ctx.json(
      {
        success: true,
        data: token,
      },
      200,
    );
  })
  /*
   * Check if slug is available
   */
  .openapi(checkSlugRouteConfig, async (ctx) => {
    const { slug } = ctx.req.valid('param');

    const slugAvailable = await checkSlugAvailable(slug);

    return ctx.json(
      {
        success: true,
        data: slugAvailable,
      },
      200,
    );
  })
  /*
   * Check token (token validation)
   */
  .openapi(checkTokenRouteConfig, async (ctx) => {
    const token = ctx.req.valid('param').token;

    // Check if token exists
    const [tokenRecord] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, token)));

    // if (!tokenRecord?.email) return errorResponse(ctx, 404, 'not_found', 'warn', 'token');

    // const [user] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));
    // if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    // For reset token: check if token has valid user
    // if (tokenRecord.type === 'PASSWORD_RESET') {
    //   const [user] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));
    //   if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    // }

    // For system invitation token: check if user email is not already in the system
    // if (tokenRecord.type === 'SYSTEM_INVITATION') {
    //   const [user] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));
    //   if (user) return errorResponse(ctx, 409, 'email_exists', 'error');
    // }

    const data = {
      type: tokenRecord.type,
      email: tokenRecord.email || '',
      organizationName: '',
      organizationSlug: '',
    };

    if (tokenRecord.type === 'ORGANIZATION_INVITATION' && tokenRecord.organizationId) {
      const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tokenRecord.organizationId));
      data.organizationName = organization.name;
      data.organizationSlug = organization.slug;
    }

    return ctx.json(
      {
        success: true,
        data,
      },
      200,
    );
  })
  /*
   * Invite users to the system
   */
  .openapi(inviteRouteConfig, async (ctx) => {
    const { emails, role } = ctx.req.valid('json');
    const user = ctx.get('user');

    if (user.role !== 'ADMIN') return errorResponse(ctx, 403, 'forbidden', 'warn');

    if (!checkRole(apiUserSchema, role)) return errorResponse(ctx, 400, 'invalid_role', 'warn');

    for (const email of emails) {
      const [targetUser] = (await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()))) as (User | undefined)[];

      const token = generateId(40);
      await db.insert(tokensTable).values({
        id: token,
        type: 'SYSTEM_INVITATION',
        userId: targetUser?.id,
        email: email.toLowerCase(),
        role: (role as TokenModel['role']) || 'USER',
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      const emailLanguage = targetUser?.language || config.defaultLanguage;

      const emailHtml = render(
        InviteEmail({
          i18n: i18n.cloneInstance({ lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage }),
          username: email.toLowerCase(),
          inviteUrl: `${config.frontendUrl}/auth/accept-invite/${token}`,
          invitedBy: user.name,
          type: 'system',
          replyTo: user.email,
        }),
      );
      logEvent('User invited on system level');

      emailSender.send(config.senderIsReceiver ? user.email : email.toLowerCase(), 'Invitation to Cella', emailHtml, user.email).catch((error) => {
        logEvent('Error sending email', { error: (error as Error).message }, 'error');
      });
    }

    return ctx.json(
      {
        success: true,
        data: undefined,
      },
      200,
    );
  })
  /*
   * Accept invite token
   */
  .openapi(acceptInviteRouteConfig, async (ctx) => {
    const verificationToken = ctx.req.valid('param').token;
    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)));
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.email || !token.role || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token_or_expired', 'warn');
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, token.email));

    if (!user) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', {
        email: token.email,
      });
    }

    if (token.type === 'SYSTEM_INVITATION') {
      if (token.role === 'ADMIN') {
        await db.update(usersTable).set({ role: 'ADMIN' }).where(eq(usersTable.id, user.id));
      }

      return ctx.json(
        {
          success: true,
        },
        200,
      );
    }

    if (token.type === 'ORGANIZATION_INVITATION') {
      if (!token.organizationId) {
        return errorResponse(ctx, 400, 'invalid_token', 'warn');
      }

      const [organization] = await db
        .select()
        .from(organizationsTable)
        .where(and(eq(organizationsTable.id, token.organizationId)));

      if (!organization) {
        return errorResponse(ctx, 404, 'not_found', 'warn', 'ORGANIZATION', {
          organizationId: token.organizationId,
        });
      }

      const [existingMembership] = await db
        .select()
        .from(membershipsTable)
        .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, user.id)));

      if (existingMembership) {
        if (existingMembership.role !== token.role) {
          await db
            .update(membershipsTable)
            .set({ role: token.role as MembershipModel['role'] })
            .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, user.id)));
        }

        return ctx.json(
          {
            success: true,
          },
          200,
        );
      }

      await db.insert(membershipsTable).values({
        organizationId: organization.id,
        userId: user.id,
        role: token.role as MembershipModel['role'],
        createdBy: user.id,
      });

      sendSSE(user.id, 'new_membership', {
        ...organization,
        userRole: token.role,
      });
    }

    return ctx.json(
      {
        success: true,
      },
      200,
    );
  })
  /*
   * Paddle webhook
   */
  .openapi(paddleWebhookRouteConfig, async (ctx) => {
    const signature = ctx.req.header('paddle-signature');
    const rawRequestBody = String(ctx.req.raw.body);

    try {
      if (signature && rawRequestBody) {
        const eventData = paddle.webhooks.unmarshal(rawRequestBody, env.PADDLE_WEBHOOK_KEY || '', signature);
        switch (eventData?.eventType) {
          case EventName.SubscriptionCreated:
            logEvent(`Subscription ${eventData.data.id} was created`, {
              ecent: JSON.stringify(eventData),
            });
            break;
          default:
            logEvent('Unhandled paddle event', {
              event: JSON.stringify(eventData),
            });
        }
      }
    } catch (error) {
      logEvent('Error handling paddle webhook', { error: (error as Error).message }, 'error');
    }

    return ctx.json(
      {
        success: true,
        data: undefined,
      },
      200,
    );
  })
  /*
   * Get suggestions
   */
  .openapi(suggestionsConfig, async (ctx) => {
    const { q, type } = ctx.req.valid('query');
    const entitiesResult = [];
    if (type === undefined) {
      for (const defaultEntity of config.entityTypes) {
        const table = entityTables.get(defaultEntity);
        if (!table) continue;
        const entities = await db
          .select({
            id: table.id,
            slug: table.slug,
            name: table.name,
            ...('email' in table && { email: table.email }),
            ...('thumbnailUrl' in table && { thumbnailUrl: table.thumbnailUrl }),
          })
          .from(table)
          .where('email' in table ? or(ilike(table.name, `%${q}%`), ilike(table.email, `%${q}%`)) : ilike(table.name, `%${q}%`))
          .limit(10);
        entitiesResult.push(...entities.map((entity) => ({ ...entity, type: defaultEntity })));
      }
    } else {
      const table = entityTables.get(type);
      if (table) {
        const entities = await db
          .select({
            id: table.id,
            slug: table.slug,
            name: table.name,
            ...('email' in table && { email: table.email }),
            ...('thumbnailUrl' in table && { thumbnailUrl: table.thumbnailUrl }),
          })
          .from(table)
          .where('email' in table ? or(ilike(table.name, `%${q}%`), ilike(table.email, `%${q}%`)) : ilike(table.name, `%${q}%`))
          .limit(10);

        entitiesResult.push(...entities.map((entity) => ({ ...entity, type })));
      }
    }
    return ctx.json(
      {
        success: true,
        data: {
          entities: entitiesResult,
          total: entitiesResult.length,
        },
      },
      200,
    );
  })
  /*
   *  Create request
   */
  .openapi(requestActionConfig, async (ctx) => {
    const { email, userId, organizationId, type, message } = ctx.req.valid('json');

    const [createdAccessRequest] = await db
      .insert(requestsTable)
      .values({
        email,
        type,
        user_id: userId,
        organization_id: organizationId,
        message: message,
      })
      .returning();

    // slack notifications
    if (type === 'WAITLIST_REQUEST') await sendSlackNotification('to join the waitlist.', email);
    if (type === 'ORGANIZATION_REQUEST') await sendSlackNotification('to join an organization.', email);
    if (type === 'NEWSLETTER_REQUEST') await sendSlackNotification('to become a donate or build member.', email);
    if (type === 'CONTACT_REQUEST') await sendSlackNotification(`for contact from ${message}.`, email);

    return ctx.json(
      {
        success: true,
        data: {
          email: createdAccessRequest.email,
          type: createdAccessRequest.type,
          userId: createdAccessRequest.user_id,
          organizationId: createdAccessRequest.organization_id,
        },
      },
      200,
    );
  })
  /*
   *  Get requests
   */
  .openapi(actionRequestsConfig, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const filter: SQL | undefined = q
      ? and(ilike(requestsTable.email, `%${q}%`), ne(requestsTable.type, 'ORGANIZATION_REQUEST'))
      : ne(requestsTable.type, 'ORGANIZATION_REQUEST');

    // if (mode === 'organization') {
    //   filter = q
    //     ? and(ilike(requestsTable.email, `%${q}%`), eq(requestsTable.type, 'ORGANIZATION_REQUEST'))
    //     : eq(requestsTable.type, 'ORGANIZATION_REQUEST');
    // }

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

    // const organizationJoinFilter = organizationId
    //   ? and(eq(organizationsTable.id, requestsTable.organization_id), eq(organizationsTable.id, organizationId))
    //   : eq(organizationsTable.id, requestsTable.organization_id);
    // const requests = await db
    //   .select({
    //     requests: requestsTable,
    //     user: usersTable,
    //     organization: organizationsTable,
    //   })
    //   .from(requestsQuery.as('requests'))
    //   .leftJoin(organizationsTable, organizationJoinFilter)
    //   .leftJoin(usersTable, eq(usersTable.id, requestsTable.user_id))
    //   .orderBy(orderColumn)
    //   .limit(Number(limit))
    //   .offset(Number(offset));

    const requests = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    // return ctx.json(
    //   {
    //     success: true,
    //     data: {
    //       requestsInfo: requests.map(({ requests }) => ({
    //         id: requests.id,
    //         email: requests.email,
    //         createdAt: requests.createdAt,
    //         type: requests.type,
    //         message: requests.message,
    //         userId: user?.id || null,
    //         userName: user?.name || null,
    //         userThumbnail: user?.thumbnailUrl || null,
    //         organizationId: organization?.id || null,
    //         organizationSlug: organization?.slug || null,
    //         organizationName: organization?.name || null,
    //         organizationThumbnail: organization?.thumbnailUrl || null,
    //       })),
    //       total,
    //     },
    //   },
    //   200,
    // );
    return ctx.json(
      {
        success: true,
        data: {
          requestsInfo: requests.map((el) => ({
            id: el.id,
            email: el.email,
            createdAt: el.createdAt,
            type: el.type,
            message: el.message,
          })),
          total,
        },
      },
      200,
    );
  })
  .get('/sse', isAuthenticated, async (ctx) => {
    const user = ctx.get('user');
    return streamSSE(ctx, async (stream) => {
      streams.set(user.id, stream);
      console.info('User connected to SSE', user.id);
      await stream.writeSSE({
        event: 'connected',
        data: 'connected',
        retry: 5000,
      });

      stream.onAbort(async () => {
        console.info('User disconnected from SSE', user.id);
        streams.delete(user.id);
      });

      // Keep connection alive
      while (true) {
        await stream.writeSSE({
          event: 'ping',
          data: 'pong',
          retry: 5000,
        });
        await stream.sleep(30000);
      }
    });
  });

export default generalRoutes;

export type GeneralRoutes = typeof generalRoutes;
