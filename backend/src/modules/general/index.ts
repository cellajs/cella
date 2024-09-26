import { type SQL, and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { emailSender } from '#/lib/mailer';
import { InviteSystemEmail } from '../../../emails/system-invite';

import { config } from 'config';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import jwt from 'jsonwebtoken';
import { render } from 'jsx-email';
import { generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';
import { env } from '../../../env';

import { db } from '#/db/db';
import { getContextUser } from '#/lib/context';

import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { type MembershipModel, membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { safeUserSelect, usersTable } from '#/db/schema/users';
import { getUserBy } from '#/db/util';
import { entityTables } from '#/entity-config';
import { memberCountsQuery } from '#/lib/counts';
import { resolveEntity } from '#/lib/entity';
import { errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { getOrderColumn } from '#/lib/order-column';
import { verifyUnsubscribeToken } from '#/lib/unsubscribe-token';
import { isAuthenticated } from '#/middlewares/guard';
import { logEvent } from '#/middlewares/logger/log-event';
import { type ContextEntity, CustomHono } from '#/types/common';
import { insertMembership } from '../memberships/helpers/insert-membership';
import { checkSlugAvailable } from './helpers/check-slug';
import generalRouteConfig from './routes';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new CustomHono();

export const streams = new Map<string, SSEStreamingApi>();

// General endpoints
const generalRoutes = app
  /*
   * Get upload token
   */
  .openapi(generalRouteConfig.getUploadToken, async (ctx) => {
    const isPublic = ctx.req.query('public');
    const user = getContextUser();
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
   * Check token (token validation)
   */
  .openapi(generalRouteConfig.checkToken, async (ctx) => {
    const { token } = ctx.req.valid('json');

    // Check if token exists
    const [tokenRecord] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, token)));
    // if (!tokenRecord?.email) return errorResponse(ctx, 404, 'not_found', 'warn', 'token');

    // const user = await getUserBy('email', tokenRecord.email);
    // if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    // For reset token: check if token has valid user
    // if (tokenRecord.type === 'password_reset') {
    //   const user = await getUserBy('email', tokenRecord.email);
    //   if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    // }

    // For system invitation token: check if user email is not already in the system
    // if (tokenRecord.type === 'system_invitation') {
    //   const user = await getUserBy('email', tokenRecord.email);
    //   if (user) return errorResponse(ctx, 409, 'email_exists', 'error');
    // }

    const data = {
      type: tokenRecord.type,
      email: tokenRecord.email || '',
      organizationName: '',
      organizationSlug: '',
    };

    if (tokenRecord.type === 'membership_invitation' && tokenRecord.organizationId) {
      const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tokenRecord.organizationId));
      data.organizationName = organization.name;
      data.organizationSlug = organization.slug;
    }

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Invite users to the system
   */
  .openapi(generalRouteConfig.createInvite, async (ctx) => {
    const { emails, role } = ctx.req.valid('json');
    const user = getContextUser();

    for (const email of emails) {
      const targetUser = await getUserBy('email', email.toLowerCase());

      const token = generateId(40);
      await db.insert(tokensTable).values({
        id: token,
        type: 'system_invitation',
        userId: targetUser?.id,
        email: email.toLowerCase(),
        role,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      const emailHtml = await render(
        InviteSystemEmail({
          userName: targetUser?.name,
          userThumbnailUrl: targetUser?.thumbnailUrl,
          userLanguage: targetUser?.language || user.language,
          inviteBy: user.name,
          inviterEmail: user.email,
          token,
        }),
      );
      logEvent('User invited on system level');

      emailSender
        .send(
          config.senderIsReceiver ? user.email : email.toLowerCase(),
          i18n.t('backend:email.subject.invitation_to_system', { lng: config.defaultLanguage, appName: config.name }),
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
   * Accept invite token
   */
  .openapi(generalRouteConfig.acceptInvite, async (ctx) => {
    const verificationToken = ctx.req.valid('param').token;

    const [token]: (TokenModel | undefined)[] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)))
      .limit(1);

    // Delete token
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.email || !token.role || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token_or_expired', 'warn');
    }
    const user = await getUserBy('email', token.email);
    if (!user) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { email: token.email });
    }

    // If it is a system invitation, update user role
    if (token.type === 'system_invitation') return ctx.json({ success: true }, 200);

    if (token.type === 'membership_invitation') {
      if (!token.organizationId) return errorResponse(ctx, 400, 'invalid_token', 'warn');

      const [organization] = await db
        .select()
        .from(organizationsTable)
        .where(and(eq(organizationsTable.id, token.organizationId)));

      if (!organization) {
        return errorResponse(ctx, 404, 'not_found', 'warn', 'organization', { organization: token.organizationId });
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

        return ctx.json({ success: true }, 200);
      }

      // Insert membership
      const role = token.role as MembershipModel['role'];
      await insertMembership({ user, role, entity: organization });
    }

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
  .openapi(generalRouteConfig.getSuggestionsConfig, async (ctx) => {
    const { q, type } = ctx.req.valid('query');
    const user = getContextUser();

    // Retrieve user memberships to filter suggestions by relevant organization,  admin users see everything
    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

    // Retrieve organizationIds for non-admin users and check if the user has at least one organization membership
    let organizationIds: string[] = [];

    if (user.role !== 'admin') {
      organizationIds = memberships.filter((el) => el.type === 'organization').map((el) => String(el.organizationId));
      if (!organizationIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });
    }

    // Provide suggestions for all entities or narrow them down to a specific type if specified
    const entityTypes = type ? [type] : config.pageEntityTypes;

    // Array to hold queries for concurrent execution
    const queries = [];

    for (const entityType of entityTypes) {
      const table = entityTables[entityType];
      if (!table) continue;

      // Basic selection setup
      const baseSelect = {
        id: table.id,
        slug: table.slug,
        name: table.name,
        entity: table.entity,
        ...('email' in table && { email: table.email }),
        ...('thumbnailUrl' in table && { thumbnailUrl: table.thumbnailUrl }),
        ...('parentId' in table && { parentId: table.parentId }),
      };

      // Build search filters
      const $or = [ilike(table.name, `%${q}%`)];
      if ('email' in table) $or.push(ilike(table.email, `%${q}%`));

      // Build organization filters
      const $and = [];
      if (organizationIds.length) {
        const $membershipAnd = [inArray(membershipsTable.organizationId, organizationIds)];
        if (config.contextEntityTypes.includes(entityType as ContextEntity)) {
          $membershipAnd.push(eq(membershipsTable.type, entityType as ContextEntity));
        }

        const memberships = await db
          .select()
          .from(membershipsTable)
          .where(and(...$membershipAnd));

        const uniqueValuesSet = new Set<string>();

        for (const member of memberships) {
          const id = member[`${entityType}Id`];
          if (id) uniqueValuesSet.add(id);
        }

        const uniqueValuesArray = Array.from(uniqueValuesSet);
        $and.push(inArray(table.id, uniqueValuesArray));
      }

      $and.push($or.length > 1 ? or(...$or) : $or[0]);
      const $where = $and.length > 1 ? and(...$and) : $and[0];

      // Build query
      queries.push(db.select(baseSelect).from(table).where($where).limit(10));
    }

    const results = await Promise.all(queries);
    const items = results.flat();

    return ctx.json({ success: true, data: { items, total: items.length } }, 200);
  })
  /*
   * Get members by entity id and type
   */
  .openapi(generalRouteConfig.getMembers, async (ctx) => {
    const { idOrSlug, entityType, q, sort, order, offset, limit, role } = ctx.req.valid('query');
    const entity = await resolveEntity(entityType, idOrSlug);

    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);

    // TODO use filter query helper to avoid code duplication. Also, this specific filter is missing name search?
    const filter: SQL | undefined = q ? ilike(usersTable.email, `%${q}%`) : undefined;

    const usersQuery = db.select().from(usersTable).where(filter).as('users');

    const membersFilters = [eq(membershipsTable[`${entityType}Id`], entity.id), eq(membershipsTable.type, entityType)];

    if (role) membersFilters.push(eq(membershipsTable.role, role));

    const memberships = db
      .select()
      .from(membershipsTable)
      .where(and(...membersFilters))
      .as('memberships');

    const membershipCount = memberCountsQuery(null, 'userId');

    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        lastSeenAt: usersTable.lastSeenAt,
        role: memberships.role,
      },
      sort,
      usersTable.id,
      order,
    );

    const membersQuery = db
      .select({
        user: safeUserSelect,
        membership: membershipSelect,
        counts: {
          memberships: membershipCount.members,
        },
      })
      .from(usersQuery)
      .innerJoin(memberships, eq(usersTable.id, memberships.userId))
      .leftJoin(membershipCount, eq(usersTable.id, membershipCount.id))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const result = await membersQuery.limit(Number(limit)).offset(Number(offset));

    const members = await Promise.all(
      result.map(async ({ user, membership, counts }) => ({
        ...user,
        membership,
        counts,
      })),
    );

    return ctx.json({ success: true, data: { items: members, total } }, 200);
  })
  /*
   * Unsubscribe a user by token
   */
  .openapi(generalRouteConfig.unsubscribeUser, async (ctx) => {
    const { token } = ctx.req.valid('query');

    if (!token) return errorResponse(ctx, 400, 'No token provided', 'warn', 'user');

    const user = await getUserBy('unsubscribeToken', token);

    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    const isValid = verifyUnsubscribeToken(user.email, token);

    if (!isValid) return errorResponse(ctx, 400, 'Token verification failed', 'warn', 'user');

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
