import { and, eq, ilike, inArray, ne, notInArray, or } from 'drizzle-orm';
import { emailSender } from '#/lib/mailer';
import { SystemInviteEmail } from '../../../emails/system-invite';

import { config } from 'config';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import jwt from 'jsonwebtoken';
import { render } from 'jsx-email';
import { generateId } from 'lucia';
import { TimeSpan, createDate } from 'oslo';
import { env } from '../../../env';

import { db } from '#/db/db';
import { getContextUser, getMemberships } from '#/lib/context';

import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { requestsTable } from '#/db/schema/requests';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { getUserBy } from '#/db/util';
import { entityIdFields, entityTables } from '#/entity-config';
import { errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { isAuthenticated } from '#/middlewares/guard';
import { logEvent } from '#/middlewares/logger/log-event';
import { verifyUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { CustomHono } from '#/types/common';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { checkSlugAvailable } from './helpers/check-slug';
import generalRoutesConfig from './routes';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new CustomHono();

export const streams = new Map<string, SSEStreamingApi>();

// General endpoints
const generalRoutes = app
  /*
   * Get upload token
   */
  .openapi(generalRoutesConfig.getUploadToken, async (ctx) => {
    const user = getContextUser();
    const { public: isPublic, organization } = ctx.req.valid('query');

    const sub = organization ? `${organization}/${user.id}` : user.id;

    const token = jwt.sign(
      {
        sub: sub,
        public: isPublic === 'true',
        imado: !!env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
      },
      env.TUS_UPLOAD_API_SECRET,
    );

    return ctx.json({ success: true, data: token }, 200);
  })
  /*
   * Check if slug is available
   */
  .openapi(generalRoutesConfig.checkSlug, async (ctx) => {
    const { slug } = ctx.req.valid('json');

    const slugAvailable = await checkSlugAvailable(slug);

    return ctx.json({ success: slugAvailable }, 200);
  })
  /*
   * Invite users to system
   */
  .openapi(generalRoutesConfig.createInvite, async (ctx) => {
    const { emails, role } = ctx.req.valid('json');
    const user = getContextUser();

    for (const email of emails) {
      const targetUser = await getUserBy('email', email.toLowerCase());

      if (targetUser) continue;

      const token = generateId(40);
      await db.insert(tokensTable).values({
        id: token,
        type: 'system_invitation',
        email: email.toLowerCase(),
        role,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      await db
        .update(requestsTable)
        .set({ token })
        .where(and(eq(requestsTable.email, email), eq(requestsTable.type, 'waitlist')));

      const emailHtml = await render(
        SystemInviteEmail({
          userLanguage: user.language,
          inviteBy: user.name,
          token,
        }),
      );
      logEvent('User invited on system level');

      emailSender
        .send(
          config.senderIsReceiver ? user.email : email.toLowerCase(),
          i18n.t('backend:email.system_invite.subject', { lng: config.defaultLanguage, appName: config.name }),
          emailHtml,
          user.email,
        )
        .catch((error) => {
          if (error instanceof Error) {
            logEvent('Error sending email', { error: error.message }, 'error');
          }
        });
    }

    return ctx.json({ success: true }, 200);
  })
  /*
   * Paddle webhook
   */
  .openapi(generalRoutesConfig.paddleWebhook, async (ctx) => {
    const signature = ctx.req.header('paddle-signature');
    const rawRequestBody = String(ctx.req.raw.body);

    try {
      if (signature && rawRequestBody) {
        const eventData = paddle.webhooks.unmarshal(rawRequestBody, env.PADDLE_WEBHOOK_KEY || '', signature);
        switch ((await eventData)?.eventType) {
          case EventName.SubscriptionCreated:
            logEvent(`Subscription ${(await eventData)?.data.id} was created`, {
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
      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error handling paddle webhook', { errorMessage }, 'error');
      }
    }

    return ctx.json({ success: true }, 200);
  })
  /*
   * Get suggestions
   */
  .openapi(generalRoutesConfig.getSuggestionsConfig, async (ctx) => {
    const { q, type } = ctx.req.valid('query');

    const user = getContextUser();
    const memberships = getMemberships();

    // Retrieve organizationIds
    const organizationIds = memberships.filter((el) => el.type === 'organization').map((el) => String(el.organizationId));
    if (!organizationIds.length) return ctx.json({ success: true, data: { items: [], total: 0 } }, 200);

    // Determine the entity types to query, default to all types if not specified
    const entityTypes = type ? [type] : config.pageEntityTypes;

    // Array to hold queries for concurrent execution
    const queries = entityTypes
      .map((entityType) => {
        const table = entityTables[entityType];
        const entityIdField = entityIdFields[entityType];

        if (!table) return null;

        // Base selection setup including membership details
        const baseSelect = {
          id: table.id,
          slug: table.slug,
          name: table.name,
          entity: table.entity,
          ...('email' in table && { email: table.email }),
          ...('thumbnailUrl' in table && { thumbnailUrl: table.thumbnailUrl }),
        };

        // Build search filters
        const $or = [];
        if (q) {
          const query = prepareStringForILikeFilter(q);
          $or.push(ilike(table.name, query));
          if ('email' in table) $or.push(ilike(table.email, query));
        }

        // Perform the join with memberships
        const $where = and(
          or(...$or),
          entityType !== 'user' ? eq(membershipsTable.userId, user.id) : undefined,
          inArray(membershipsTable.organizationId, organizationIds),
          eq(membershipsTable[entityIdField], table.id),
        );

        // Execute the query using inner join with memberships table
        return db
          .selectDistinctOn([baseSelect.id], {
            ...baseSelect,
            membership: membershipSelect,
          })
          .from(table)
          .innerJoin(
            membershipsTable,
            and(eq(table.id, membershipsTable[entityIdField]), eq(membershipsTable.type, entityType === 'user' ? 'organization' : entityType)),
          )
          .where($where)
          .limit(10);
      })
      .filter(Boolean); // Filter out null values if any entity type is invalid

    const results = await Promise.all(queries);
    const items = results.flat().filter((item) => item !== null);

    return ctx.json({ success: true, data: { items, total: items.length } }, 200);
  })
  /*
   * Get invite suggestions
   */
  .openapi(generalRoutesConfig.getInviteSuggestionsConfig, async (ctx) => {
    const { q, entityId, entityType } = ctx.req.valid('query');

    const user = getContextUser();
    const memberships = getMemberships();
    // Retrieve organizationIds
    const organizationIds = memberships.filter((el) => el.type === 'organization').map((el) => String(el.organizationId));
    if (!organizationIds.length) return ctx.json({ success: true, data: { items: [], total: 0 } }, 200);

    // Build search filters
    const $or = [];
    if (q) {
      const query = prepareStringForILikeFilter(q);
      $or.push(ilike(usersTable.name, query));
      $or.push(ilike(usersTable.email, query));
    }

    const entityIdField = entityIdFields[entityType];

    const currentEntityMembers = await db
      .select({ userId: membershipsTable.userId })
      .from(membershipsTable)
      .where(eq(membershipsTable[entityIdField], entityId));

    const items = await db
      .selectDistinctOn([usersTable.id], {
        id: usersTable.id,
        slug: usersTable.slug,
        name: usersTable.name,
        entity: usersTable.entity,
        email: usersTable.email,
        thumbnailUrl: usersTable.thumbnailUrl,
        membership: membershipSelect,
      })
      .from(usersTable)
      .innerJoin(
        membershipsTable,
        and(
          eq(usersTable.id, membershipsTable.userId),
          eq(membershipsTable.type, 'organization'),
          inArray(membershipsTable.organizationId, organizationIds),
          notInArray(
            membershipsTable.userId,
            currentEntityMembers.map(({ userId }) => userId),
          ),
        ),
      )
      .where(and(or(...$or), ne(usersTable.id, user.id)))
      .limit(10);

    return ctx.json({ success: true, data: { items, total: items.length } }, 200);
  })
  /*
   * Unsubscribe a user by token
   */
  .openapi(generalRoutesConfig.unsubscribeUser, async (ctx) => {
    const { token } = ctx.req.valid('query');

    // Check if token exists
    const user = await getUserBy('unsubscribeToken', token);
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    // Verify token
    const isValid = verifyUnsubscribeToken(user.email, token);
    if (!isValid) return errorResponse(ctx, 401, 'unsubscribe_failed', 'warn', 'user');

    // Update user
    await db.update(usersTable).set({ newsletter: false }).where(eq(usersTable.id, user.id));

    const redirectUrl = `${config.frontendUrl}/unsubscribe`;
    return ctx.redirect(redirectUrl, 302);
  })
  /*
   *  Get SSE stream
   */
  .get('/sse', isAuthenticated, async (ctx) => {
    const user = getContextUser();
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');
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
