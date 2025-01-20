import { and, eq, ilike, inArray, or } from 'drizzle-orm';
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
import { getContextUser, getMemberships } from '#/lib/context';

import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { setCookie } from 'hono/cookie';
import { type MembershipModel, membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { type OrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { getUserBy } from '#/db/util';
import { entityIdFields, entityTables, menuSections } from '#/entity-config';
import { resolveEntity } from '#/lib/entity';
import { errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { sendSSEToUsers } from '#/lib/sse';
import { isAuthenticated } from '#/middlewares/guard';
import { logEvent } from '#/middlewares/logger/log-event';
import { verifyUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { CustomHono } from '#/types/common';
import { prepareStringForILikeFilter } from '#/utils/sql';
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
    if (!tokenRecord) return errorResponse(ctx, 404, 'not_found', 'warn');

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
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      const emailHtml = await render(
        InviteSystemEmail({
          userName: targetUser?.name,
          userThumbnailUrl: targetUser?.thumbnailUrl,
          userLanguage: targetUser?.language || user.language,
          inviteBy: user.name,
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
    const { oauth } = ctx.req.valid('json');

    const [token]: (TokenModel | undefined)[] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)))
      .limit(1);

    if (!token || !token.email || !token.role || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 401, 'invalid_token_or_expired', 'warn');
    }
    // Delete token
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));
    // If it is a system invitation, update user role
    if (token.type === 'system_invitation') {
      if (oauth) setCookie(ctx, 'oauth_invite_token', token.id);

      return ctx.json({ success: true }, 200);
    }

    if (!token.organizationId) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    // check if user exists
    const user = await getUserBy('email', token.email);
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { email: token.email });

    const role = token.role as MembershipModel['role'];
    const membershipInfo = token.membershipInfo;

    const [organization]: (OrganizationModel | undefined)[] = await db
      .select()
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, token.organizationId)))
      .limit(1);

    if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization', { organization: token.organizationId });

    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.type, 'organization')));

    const existingMembership = memberships.find((member) => member.userId === user.id);

    if (existingMembership && existingMembership.role !== role) {
      await db
        .update(membershipsTable)
        .set({ role: role })
        .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, user.id)));

      return ctx.json({ success: true }, 200);
    }

    // Insert membership
    const membership = await insertMembership({ user, role, entity: organization });

    const newMenuItem = {
      newItem: { ...organization, membership },
      sectionName: menuSections.find((el) => el.entityType === membership.type)?.name,
    };

    // SSE with organization data, to update user's menu
    sendSSEToUsers([user.id], 'add_entity', newMenuItem);
    // SSE to to update members queries
    sendSSEToUsers(
      memberships.map(({ userId }) => userId).filter((id) => id !== user.id),
      'member_accept_invite',
      { id: organization.id, slug: organization.slug },
    );

    if (membershipInfo) {
      const { parentEntity: parentInfo, targetEntity: targetInfo } = membershipInfo;

      const targetEntity = await resolveEntity(targetInfo.entity, targetInfo.idOrSlug);
      const parentEntity = parentInfo ? await resolveEntity(parentInfo.entity, parentInfo.idOrSlug) : null;

      if (!targetEntity) return errorResponse(ctx, 404, 'not_found', 'warn', targetInfo.entity, { [targetInfo.entity]: targetInfo.idOrSlug });

      const [createdParentMembership, createdMembership] = await Promise.all([
        parentEntity
          ? insertMembership({
              user,
              role,
              entity: parentEntity,
            })
          : Promise.resolve(null), // No-op if parentEntity is undefined
        insertMembership({
          user,
          role,
          entity: targetEntity,
          parentEntity,
        }),
      ]);

      if (createdParentMembership && parentEntity) {
        // SSE with parentEntity data, to update user's menu
        sendSSEToUsers([user.id], 'add_entity', {
          newItem: { ...parentEntity, membership: createdParentMembership },
          sectionName: menuSections.find((el) => el.entityType === parentEntity.entity)?.name,
        });
      }

      // SSE with entity data, to update user's menu
      sendSSEToUsers([user.id], 'add_entity', {
        newItem: { ...targetEntity, membership: createdMembership },
        sectionName: menuSections.find((el) => el.entityType === targetEntity.entity)?.name,
        ...(parentEntity && { parentSlug: parentEntity.slug }),
      });
    }

    return ctx.json({ success: true, data: newMenuItem }, 200);
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
   * Get suggestions
   */
  .openapi(generalRouteConfig.getSuggestionsConfig, async (ctx) => {
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
   * Unsubscribe a user by token
   */
  .openapi(generalRouteConfig.unsubscribeUser, async (ctx) => {
    const { token } = ctx.req.valid('query');

    // Check if token exists
    const user = await getUserBy('unsubscribeToken', token);
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    // Verify token
    const isValid = verifyUnsubscribeToken(user.email, token);
    if (!isValid) return errorResponse(ctx, 401, 'Token verification failed', 'warn', 'user');

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
