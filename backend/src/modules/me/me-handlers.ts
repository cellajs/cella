import { OpenAPIHono } from '@hono/zod-openapi';
import type { EnabledOAuthProvider } from 'config';
import { appConfig } from 'config';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { db } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { AuthStrategy, sessionsTable } from '#/db/schema/sessions';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextUser, getContextUserSystemRole } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/error';
import { getParams, getSignature } from '#/lib/transloadit';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { validatePasskey } from '#/modules/auth/passkeys/helpers/passkey';
import { validateTOTP } from '#/modules/auth/totps/helpers/totps';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { makeContextEntityBaseSelect } from '#/modules/entities/helpers/select';
import { getAuthInfo, getUserSessions } from '#/modules/me/helpers/get-user-info';
import meRoutes from '#/modules/me/me-routes';
import {
  type AppStreamSubscriber,
  dispatchToUserSubscribers,
  fetchUserCatchUpActivities,
  getLatestUserActivityId,
  orgChannel,
} from '#/modules/me/stream';
import { userSelect } from '#/modules/user/helpers/select';
import { type ActivityEventWithEntity, activityBus } from '#/sync/activity-bus';
import { keepAlive, streamSubscriberManager, writeChange, writeOffset } from '#/sync/stream';
import { entityTables } from '#/table-config';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { verifyUnsubscribeToken } from '#/utils/unsubscribe-token';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// ActivityBus registration for user stream events
// ============================================

// Membership events - routed via user channel
const membershipEvents = ['membership.created', 'membership.updated', 'membership.deleted'] as const;

for (const eventType of membershipEvents) {
  activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await dispatchToUserSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to dispatch membership event', { error, activityId: event.id });
    }
  });
}

// Product entity events - routed via org channel to user stream subscribers
const productEntityEvents = [
  'page.created',
  'page.updated',
  'page.deleted',
  'attachment.created',
  'attachment.updated',
  'attachment.deleted',
] as const;

for (const eventType of productEntityEvents) {
  activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await dispatchToUserSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to dispatch product entity event', { error, activityId: event.id });
    }
  });
}

// Organization events - routed via org channel
const organizationEvents = ['organization.updated', 'organization.deleted'] as const;

for (const eventType of organizationEvents) {
  activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await dispatchToUserSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to dispatch organization event', { error, activityId: event.id });
    }
  });
}

// ============================================
// Route handlers
// ============================================

const meRouteHandlers = app
  /**
   * Get me
   */
  .openapi(meRoutes.getMe, async (ctx) => {
    const user = getContextUser();
    const systemRole = getContextUserSystemRole();

    // Update last visit date
    await db.update(usersTable).set({ lastStartedAt: getIsoDate() }).where(eq(usersTable.id, user.id));

    return ctx.json({ user, systemRole }, 200);
  })
  /**
   * Toggle MFA require for me auth
   */
  .openapi(meRoutes.toggleMfa, async (ctx) => {
    const { mfaRequired, passkeyData, totpCode } = ctx.req.valid('json');
    const user = getContextUser();

    // Determine which MFA strategy user is using
    const strategy: Extract<AuthStrategy, 'passkey' | 'totp'> = passkeyData ? 'passkey' : 'totp';

    try {
      // --- Passkey verification ---
      if (passkeyData) await validatePasskey(ctx, { ...passkeyData, userId: user.id });

      // --- TOTP verification ---
      if (totpCode) await validateTOTP({ code: totpCode, userId: user.id });
    } catch (error) {
      if (error instanceof AppError) throw error;

      // Wrap unexpected errors in AppError for consistent error handling
      throw new AppError(500, 'invalid_credentials', 'error', {
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({ mfaRequired })
      .where(eq(usersTable.id, user.id))
      .returning();

    if (updatedUser.mfaRequired) {
      // Invalidate all existing regular sessions
      await db
        .delete(sessionsTable)
        .where(and(eq(sessionsTable.userId, updatedUser.id), eq(sessionsTable.type, 'regular')));

      // Clear session cookie to enforce fresh login
      deleteAuthCookie(ctx, 'session');

      // Establish a new session after MFA verification
      await setUserSession(ctx, user, strategy, 'mfa');
    }

    return ctx.json(updatedUser, 200);
  })
  /**
   * Get my auth data
   */
  .openapi(meRoutes.getMyAuth, async (ctx) => {
    const user = getContextUser();

    // Get auth info + sessions in parallel
    const [authInfo, sessions] = await Promise.all([getAuthInfo(user.id), getUserSessions(ctx, user.id)]);

    const { oauth, ...restInfo } = authInfo;
    // Filter only providers that are enabled in appConfig
    const enabledOAuth = oauth
      .map(({ provider }) => provider)
      .filter((provider): provider is EnabledOAuthProvider =>
        appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider),
      );

    return ctx.json({ ...restInfo, enabledOAuth, sessions }, 200);
  })
  /**
   * Get my invitations - a list with a combination of pending membership and entity data
   */
  .openapi(meRoutes.getMyInvitations, async (ctx) => {
    const user = getContextUser();

    const pendingInvites = await Promise.all(
      appConfig.contextEntityTypes.map((entityType) => {
        const entityTable = entityTables[entityType];
        const entityIdColumnKey = appConfig.entityIdColumnKeys[entityType];

        const contextEntityBaseSelect = makeContextEntityBaseSelect(entityType);

        return db
          .select({
            entity: contextEntityBaseSelect,
            inactiveMembership: inactiveMembershipsTable,
          })
          .from(inactiveMembershipsTable)
          .leftJoin(usersTable, eq(usersTable.id, inactiveMembershipsTable.createdBy))
          .innerJoin(entityTable, eq(entityTable.id, inactiveMembershipsTable[entityIdColumnKey]))
          .where(
            and(
              eq(inactiveMembershipsTable.contextType, entityType),
              eq(inactiveMembershipsTable.userId, user.id),
              isNull(inactiveMembershipsTable.rejectedAt),
            ),
          );
      }),
    );

    const items = pendingInvites.flat();
    const total = items.length;

    return ctx.json({ items, total }, 200);
  })
  /**
   * Terminate one or more of my sessions
   */
  .openapi(meRoutes.deleteMySessions, async (ctx) => {
    const { ids } = ctx.req.valid('json');
    const user = getContextUser();

    const sessionIds = Array.isArray(ids) ? ids : [ids];
    const { sessionToken } = await getParsedSessionCookie(ctx);
    const { session: currentSession } = await validateSession(sessionToken);

    try {
      // Clear auth cookie if user deletes their current session
      if (currentSession && sessionIds.includes(currentSession.id)) deleteAuthCookie(ctx, 'session');

      const deleted = await db
        .delete(sessionsTable)
        .where(and(inArray(sessionsTable.id, sessionIds), eq(sessionsTable.userId, user.id)))
        .returning({ id: sessionsTable.id });

      const deletedIds = deleted.map((s) => s.id);
      const rejectedItems = sessionIds.filter((id) => !deletedIds.includes(id));

      return ctx.json({ success: true, rejectedItems }, 200);
    } catch {
      return ctx.json({ success: false, rejectedItems: sessionIds }, 200);
    }
  })
  /**
   * Update current user (me)
   */
  .openapi(meRoutes.updateMe, async (ctx) => {
    const user = getContextUser();

    if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: 'self' } });

    const { userFlags, ...passedUpdates } = ctx.req.valid('json');

    const { slug, firstName, lastName } = passedUpdates;

    if (slug && slug !== user.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
    }
    // if userFlags is provided, merge it
    const updateData = {
      ...passedUpdates,
      ...(userFlags && {
        userFlags: sql`${usersTable.userFlags} || ${JSON.stringify(userFlags)}::jsonb`,
      }),
      ...((firstName || lastName) && { name: [firstName, lastName].filter(Boolean).join(' ') }),
      modifiedAt: getIsoDate(),
      modifiedBy: user.id,
    };

    const [updatedUser] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, user.id)).returning();

    return ctx.json(updatedUser, 200);
  })
  /**
   * Delete current user (me)
   */
  .openapi(meRoutes.deleteMe, async (ctx) => {
    const user = getContextUser();

    // Check if user exists
    if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: 'self' } });

    // Delete user
    await db.delete(usersTable).where(eq(usersTable.id, user.id));

    deleteAuthCookie(ctx, 'session');
    logEvent('info', 'User deleted itself', { userId: user.id });

    return ctx.body(null, 204);
  })
  /**
   * Delete one of my entity memberships
   */
  .openapi(meRoutes.deleteMyMembership, async (ctx) => {
    const user = getContextUser();

    const { entityType, idOrSlug } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

    const entityIdColumnKey = appConfig.entityIdColumnKeys[entityType];

    // Delete memberships
    await db
      .delete(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable[entityIdColumnKey], entity.id)));

    logEvent('info', 'User left entity', { userId: user.id });

    return ctx.body(null, 204);
  })
  /**
   * Get upload token
   */
  .openapi(meRoutes.getUploadToken, async (ctx) => {
    const { public: isPublic, organizationId, templateId } = ctx.req.valid('query');
    const user = getContextUser();

    // This will be used to as first part of S3 key
    const sub = [appConfig.s3.bucketPrefix, organizationId, user.id]
      .filter((part): part is string => typeof part === 'string')
      .join('/');

    // If Transloadit not configured, return response indicating local-only mode
    if (!env.TRANSLOADIT_KEY || !env.TRANSLOADIT_SECRET) {
      return ctx.json({ sub, public: isPublic, s3: !!env.S3_ACCESS_KEY_ID, params: null, signature: null }, 200);
    }

    try {
      const params = getParams(templateId, isPublic, sub);
      const paramsString = JSON.stringify(params);
      const signature = getSignature(paramsString);

      const token = { sub, public: isPublic, s3: !!env.S3_ACCESS_KEY_ID, params, signature };

      return ctx.json(token, 200);
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError(500, 'auth_key_not_found', 'error', {
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }
  })
  /**
   * Unsubscribe myself by token from receiving newsletters
   */
  .openapi(meRoutes.unsubscribeMe, async (ctx) => {
    const { token } = ctx.req.valid('query');

    // Check if token exists
    const [user] = await db
      .select(userSelect)
      .from(usersTable)
      .innerJoin(unsubscribeTokensTable, eq(usersTable.id, unsubscribeTokensTable.userId))
      .where(eq(unsubscribeTokensTable.token, token))
      .limit(1);

    if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

    // Verify token
    const isValid = verifyUnsubscribeToken(user.email, token);
    if (!isValid) throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user' });

    // Update user
    await db.update(usersTable).set({ newsletter: false }).where(eq(usersTable.id, user.id));

    const redirectUrl = new URL('/auth/unsubscribed', appConfig.frontendUrl);
    return ctx.redirect(redirectUrl, 302);
  })
  /**
   *  App stream (membership an realtime entity updates)
   */
  .openapi(meRoutes.stream, async (ctx) => {
    const { offset, live } = ctx.req.valid('query');
    const user = getContextUser();
    const memberships = getContextMemberships();
    const userSystemRole = getContextUserSystemRole();
    const orgIds = new Set(memberships.map((m) => m.organizationId));

    // Resolve cursor from offset parameter
    let cursor: string | null = null;
    if (offset === 'now') {
      cursor = await getLatestUserActivityId(user.id, orgIds);
    } else if (offset) {
      cursor = offset;
    }

    // Non-streaming catch-up request
    if (live !== 'sse') {
      const catchUpActivities = await fetchUserCatchUpActivities(user.id, orgIds, cursor);
      const lastActivity = catchUpActivities.at(-1);

      return ctx.json({
        activities: catchUpActivities.map((a) => a.notification),
        cursor: lastActivity?.activityId ?? cursor,
      });
    }

    // SSE streaming mode
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send catch-up activities
      const catchUpActivities = await fetchUserCatchUpActivities(user.id, orgIds, cursor);
      for (const { activityId, notification } of catchUpActivities) {
        await writeChange(stream, activityId, notification);
        cursor = activityId;
      }

      // Send offset marker (catch-up complete)
      await writeOffset(stream, cursor);

      // Build subscriber with memberships for permission checks
      // Primary channel is first org channel (or empty if no orgs)
      const orgChannels = [...orgIds].map((id) => orgChannel(id));
      const subscriber: AppStreamSubscriber = {
        id: nanoid(),
        channel: orgChannels[0] ?? '',
        stream,
        userId: user.id,
        orgIds,
        userSystemRole,
        memberships,
        cursor,
      };

      // Register on all org channels - all events (including memberships) route through org channels
      // NOTE: If user is added to new org while connected, they won't receive events for that
      // org until reconnect. Frontend should reconnect stream when membership.created is received.
      streamSubscriberManager.register(subscriber, orgChannels.slice(1));
      logEvent('info', 'User stream subscriber registered', {
        subscriberId: subscriber.id,
        userId: user.id,
        orgCount: orgIds.size,
      });

      // Handle disconnect
      stream.onAbort(() => {
        streamSubscriberManager.unregister(subscriber.id);
        logEvent('info', 'User stream subscriber disconnected', { subscriberId: subscriber.id, userId: user.id });
      });

      // Keep connection alive
      await keepAlive(stream);
    });
  });

export default meRouteHandlers;
