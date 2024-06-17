import { type SQL, and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
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
import { labelsTable } from '../../db/schema-electric/labels';
import { tasksTable } from '../../db/schema-electric/tasks';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { projectsTable } from '../../db/schema/projects';
import { type TokenModel, tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { workspacesTable } from '../../db/schema/workspaces';
import { entityTables, resolveEntity } from '../../lib/entity';
import { errorResponse } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { getOrderColumn } from '../../lib/order-column';
import { isAuthenticated } from '../../middlewares/guard';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { toMembershipInfo } from '../memberships/helpers/to-membership-info';
import { checkSlugAvailable } from './helpers/check-slug';
import generalRouteConfig from './routes';
import type { Suggestion } from './schema';
import { insertMembership } from '../memberships/helpers/insert-membership';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new CustomHono();

export const streams = new Map<string, SSEStreamingApi>();

// General endpoints
const generalRoutes = app
  /*
   * Get public counts
   */
  .openapi(generalRouteConfig.getPublicCounts, async (ctx) => {
    const [users, organizations, workspaces, projects, tasks, labels] = await Promise.all([
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(usersTable),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(organizationsTable),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(workspacesTable),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(projectsTable),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(tasksTable),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(labelsTable),
    ]);

    const data = {
      users: users[0].total,
      organizations: organizations[0].total,
      workspaces: workspaces[0].total,
      projects: projects[0].total,
      tasks: tasks[0].total,
      labels: labels[0].total,
    };

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Get upload token
   */
  .openapi(generalRouteConfig.getUploadToken, async (ctx) => {
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

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Invite users to the system
   */
  .openapi(generalRouteConfig.invite, async (ctx) => {
    const { emails, role } = ctx.req.valid('json');
    const user = ctx.get('user');

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
          i18n: i18n.cloneInstance({
            lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage,
          }),
          username: email.toLowerCase(),
          inviteUrl: `${config.frontendUrl}/auth/invite/${token}`,
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

    return ctx.json({ success: true }, 200);
  })
  /*
   * Accept invite token
   */
  .openapi(generalRouteConfig.acceptInvite, async (ctx) => {
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)));

    // Delete token
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.email || !token.role || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token_or_expired', 'warn');
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, token.email));

    if (!user) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { email: token.email });
    }

    // If it is a system invitation, update user role
    if (token.type === 'SYSTEM_INVITATION') {
      if (token.role === 'ADMIN') {
        await db.update(usersTable).set({ role: 'ADMIN' }).where(eq(usersTable.id, user.id));
      }

      return ctx.json({ success: true }, 200);
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
        return errorResponse(ctx, 404, 'not_found', 'warn', 'ORGANIZATION', { organization: token.organizationId });
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
      logEvent('Error handling paddle webhook', { error: (error as Error).message }, 'error');
    }

    return ctx.json({ success: true }, 200);
  })
  /*
   * Get suggestions
   */
  .openapi(generalRouteConfig.suggestionsConfig, async (ctx) => {
    const { q, type } = ctx.req.valid('query');
    const user = ctx.get('user');

    // Retrieve user memberships to filter suggestions by relevant organization,  ADMIN users see everything
    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

    // Retrieve organizationIds for non-admin users and check if the user has at least one organization membership
    let organizationIds: string[] = [];

    if (user.role !== 'ADMIN') {
      organizationIds = memberships.filter((el) => el.type === 'ORGANIZATION').map((el) => String(el.organizationId));
      if (!organizationIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });
    }

    // Provide suggestions for all entities or narrow them down to a specific type if specified
    const entityTypes = type ? [type] : config.entityTypes;

    // Array to hold queries for concurrent execution
    const queries = [];

    // Build queries
    for (const entityType of entityTypes) {
      const table = entityTables.get(entityType);
      if (!table) continue;

      // Build selection
      const select = {
        id: table.id,
        slug: table.slug,
        name: table.name,
        entity: table.entity,
        ...('email' in table && { email: table.email }),
        ...('organizationId' in table && { organizationId: table.organizationId }),
        ...('thumbnailUrl' in table && { thumbnailUrl: table.thumbnailUrl }),
      };

      // Build search filters
      const $or = [ilike(table.name, `%${q}%`)];
      if ('email' in table) $or.push(ilike(table.email, `%${q}%`));

      // Build organization filters
      const $and = [];

      if (organizationIds.length) {
        if ('organizationId' in table) {
          $and.push(inArray(table.organizationId, organizationIds));
        } else if (entityType === 'ORGANIZATION') {
          $and.push(inArray(table.id, organizationIds));
        } else if (entityType === 'USER') {
          // Filter users based on their memberships in specified organizations
          const userMemberships = await db
            .select({ userId: membershipsTable.userId })
            .from(membershipsTable)
            .where(and(inArray(membershipsTable.organizationId, organizationIds), eq(membershipsTable.type, 'ORGANIZATION')));

          if (!userMemberships.length) continue;
          $and.push(
            inArray(
              table.id,
              userMemberships.map((el) => String(el.userId)),
            ),
          );
        }
      }

      $and.push($or.length > 1 ? or(...$or) : $or[0]);
      const $where = $and.length > 1 ? and(...$and) : $and[0];

      // Build query
      queries.push(db.select(select).from(table).where($where).limit(10));
    }

    const results = await Promise.all(queries);
    const items = [];

    // @TODO: Tmp Typescript type solution
    for (const entities of results as unknown as Array<Suggestion[]>) items.push(...entities.map((e) => e));

    return ctx.json({ success: true, data: { items, total: items.length } }, 200);
  })
  /*
   * Get members by entity id and type
   */
  .openapi(generalRouteConfig.getMembers, async (ctx) => {
    const { idOrSlug, entityType, q, sort, order, offset, limit, role } = ctx.req.valid('query');
    const entity = await resolveEntity(entityType, idOrSlug);

    // TODO use filter query helper to avoid code duplication. Also, this specific filter is missing name search?
    const filter: SQL | undefined = q ? ilike(usersTable.email, `%${q}%`) : undefined;

    const usersQuery = db.select().from(usersTable).where(filter).as('users');

    // TODO refactor this to use agnostic entity mapping to use 'entityType'+Id in a clean way
    const membersFilters = [
      eq(entityType === 'ORGANIZATION' ? membershipsTable.organizationId : membershipsTable.projectId, entity.id),
      eq(membershipsTable.type, entityType),
    ];

    if (role) {
      membersFilters.push(eq(membershipsTable.role, role.toUpperCase() as MembershipModel['role']));
    }

    const memberships = db
      .select()
      .from(membershipsTable)
      .where(and(...membersFilters))
      .as('memberships');

    // TODO: use count helper?
    const membershipCount = db
      .select({
        userId: membershipsTable.userId,
        memberships: count().as('memberships'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.userId)
      .as('membership_count');

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
        user: usersTable,
        membership: membershipsTable,
        counts: {
          memberships: membershipCount.memberships,
        },
      })
      .from(usersQuery)
      .innerJoin(memberships, eq(usersTable.id, memberships.userId))
      .leftJoin(membershipCount, eq(usersTable.id, membershipCount.userId))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const result = await membersQuery.limit(Number(limit)).offset(Number(offset));

    const members = await Promise.all(
      result.map(async ({ user, membership, counts }) => ({
        ...user,
        membership: toMembershipInfo.required(membership),
        counts,
      })),
    );

    return ctx.json({ success: true, data: { items: members, total } }, 200);
  })
  /*
   *  Get SSE stream
   */
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
