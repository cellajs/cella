import { and, eq, ilike, inArray, isNull, lt, or } from 'drizzle-orm';
import { mailer } from '#/lib/mailer';
import { SystemInviteEmail, type SystemInviteEmailProps } from '../../../emails/system-invite';

import { config } from 'config';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import jwt from 'jsonwebtoken';

import { OpenAPIHono } from '@hono/zod-openapi';
import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { requestsTable } from '#/db/schema/requests';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { entityIdFields, entityTables } from '#/entity-config';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { isAuthenticated } from '#/middlewares/guard';
import { logEvent } from '#/middlewares/logger/log-event';
import { getUserBy, getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { verifyUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { nanoid } from '#/utils/nanoid';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { TimeSpan, createDate } from '#/utils/time-span';
import { env } from '../../env';
import { slugFromEmail } from '../auth/helpers/oauth';
import { membershipSelect } from '../memberships/helpers/select';
import { checkSlugAvailable } from './helpers/check-slug';
import generalRouteConfig from './routes';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new OpenAPIHono<Env>();

export const streams = new Map<string, SSEStreamingApi>();

const generalRoutes = app
  /*
   * Get upload token
   */
  .openapi(generalRouteConfig.getUploadToken, async (ctx) => {
    const user = getContextUser();
    const { public: isPublic, organization } = ctx.req.valid('query');

    const sub = organization ? `${organization}/${user.id}` : user.id;

    const token = jwt.sign(
      {
        sub: sub,
        public: isPublic === 'true',
        imado: !!env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
      },
      env.TUS_SECRET,
    );

    return ctx.json({ success: true, data: token }, 200);
  })
  /*
   * Check if slug is available
   */
  .openapi(generalRouteConfig.checkSlug, async (ctx) => {
    const { slug } = ctx.req.valid('json');

    const slugAvailable = await checkSlugAvailable(slug);

    return ctx.json({ success: slugAvailable }, 200);
  })
  /*
   * Invite users to system
   */
  .openapi(generalRouteConfig.createInvite, async (ctx) => {
    const { emails } = ctx.req.valid('json');
    const user = getContextUser();

    const lng = user.language;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.system_invite.subject', { lng, appName: config.name });

    // Query to filter out invitations on same email
    const existingInvitesQuery = db
      .select()
      .from(tokensTable)
      .where(
        and(
          inArray(tokensTable.email, emails),
          eq(tokensTable.type, 'invitation'),
          // Make sure its a system invitation
          isNull(tokensTable.organizationId),
          isNull(tokensTable.role),
          lt(tokensTable.expiresAt, new Date()),
        ),
      );

    const [existingUsers, existingInvites] = await Promise.all([getUsersByConditions([inArray(usersTable.email, emails)]), existingInvitesQuery]);

    // Create a set of emails from both existing users and invitations
    const existingEmails = new Set([...existingUsers.map((user) => user.email), ...existingInvites.map((invite) => invite.email)]);

    // Filter out emails that already user or has invitations
    const recipientEmails = emails.filter((email) => !existingEmails.has(email));

    // Stop if no recipients
    if (recipientEmails.length === 0) return errorResponse(ctx, 400, 'no_recipients', 'warn');

    // Generate tokens
    const tokens = recipientEmails.map((email) => {
      const token = nanoid(40);
      return {
        token,
        type: 'invitation' as const,
        email: email.toLowerCase(),
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      };
    });

    // Batch insert tokens
    const insertedTokens = await db.insert(tokensTable).values(tokens).returning();

    // Remove waitlist request - if found - because users are explicitly invited
    await db.delete(requestsTable).where(and(inArray(requestsTable.email, recipientEmails), eq(requestsTable.type, 'waitlist')));

    // Prepare emails
    const recipients = insertedTokens.map((tokenRecord) => ({
      email: tokenRecord.email,
      lng: lng,
      name: slugFromEmail(tokenRecord.email),
      systemInviteLink: `${config.frontendUrl}/auth/authenticate?token=${tokenRecord.token}&tokenId=${tokenRecord.id}`,
    }));

    type Recipient = (typeof recipients)[number];

    // Send invitation
    const staticProps = { senderName, senderThumbnailUrl, subject, lng };
    await mailer.prepareEmails<SystemInviteEmailProps, Recipient>(SystemInviteEmail, staticProps, recipients, user.email);

    logEvent('Users invited on system level');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Paddle webhook
   */
  .openapi(generalRouteConfig.paddleWebhook, async (ctx) => {
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
   * Get entity search suggestions
   */
  .openapi(generalRouteConfig.getSuggestionsConfig, async (ctx) => {
    const { q, type } = ctx.req.valid('query');

    const user = getContextUser();
    const memberships = getContextMemberships();

    // Retrieve organizationIds
    const organizationIds = memberships.filter((el) => el.type === 'organization').map((el) => String(el.organizationId));
    if (!organizationIds.length) return ctx.json({ success: true, data: { items: [], total: 0 } }, 200);

    // Determine the entity types to query, default to all types if not specified
    const entityTypes = type ? [type] : config.pageEntityTypes;

    // Array to hold queries for concurrent execution
    // TODO move to a helpers file?
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
          if ('email' in table) {
            $or.push(ilike(table.email, query));
          }
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
          .select({
            ...baseSelect,
            membership: membershipSelect,
          })
          .from(table)
          .innerJoin(
            membershipsTable,
            and(eq(table.id, membershipsTable[entityIdField]), eq(membershipsTable.type, entityType === 'user' ? 'organization' : entityType)),
          )
          .where($where)
          .groupBy(table.id, membershipsTable.id) // Group by entity ID for distinct results
          .limit(10);
      })
      .filter(Boolean); // Filter out null values if any entity type is invalid

    const results = await Promise.all(queries);
    const items = results.flat().filter((item) => item !== null);

    return ctx.json({ success: true, data: { items, total: items.length } }, 200);
  })
  /*
   * Unsubscribe a user by token from receiving newsletters
   */
  .openapi(generalRouteConfig.unsubscribeUser, async (ctx) => {
    const { token } = ctx.req.valid('query');

    // Check if token exists
    const user = await getUserBy('unsubscribeToken', token, 'unsafe');
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
