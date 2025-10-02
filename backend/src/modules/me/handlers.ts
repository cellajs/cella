import { OpenAPIHono, type z } from '@hono/zod-openapi';
import type { EnabledOAuthProvider, MenuSection } from 'config';
import { appConfig } from 'config';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { AuthStrategy, sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { entityTables } from '#/entity-config';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { getParams, getSignature } from '#/lib/transloadit';
import { isAuthenticated } from '#/middlewares/guard';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { validatePasskey } from '#/modules/auth/passkeys/helpers/passkey';
import { validateTOTP } from '#/modules/auth/totps/helpers/totps';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getAuthInfo, getUserSessions } from '#/modules/me/helpers/get-user-info';
import { getUserMenuEntities } from '#/modules/me/helpers/get-user-menu-entities';
import meRoutes from '#/modules/me/routes';
import type { menuItemSchema, menuSchema } from '#/modules/me/schema';
import { userBaseSelect, usersBaseQuery } from '#/modules/users/helpers/select';
import permissionManager from '#/permissions/permissions-config';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { verifyUnsubscribeToken } from '#/utils/unsubscribe-token';

type UserMenu = z.infer<typeof menuSchema>;
type MenuItem = z.infer<typeof menuItemSchema>;

const app = new OpenAPIHono<Env>({ defaultHook });

export const streams = new Map<string, SSEStreamingApi>();

const meRouteHandlers = app
  /**
   * Get me
   */
  .openapi(meRoutes.getMe, async (ctx) => {
    const user = getContextUser();

    // Update last visit date
    await db.update(usersTable).set({ lastStartedAt: getIsoDate() }).where(eq(usersTable.id, user.id));

    return ctx.json(user, 200);
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
      throw new AppError({
        status: 500,
        type: 'invalid_credentials',
        severity: 'error',
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }

    const [updatedUser] = await db.update(usersTable).set({ mfaRequired }).where(eq(usersTable.id, user.id)).returning();

    if (updatedUser.mfaRequired) {
      // Invalidate all existing regular sessions
      await db.delete(sessionsTable).where(and(eq(sessionsTable.userId, updatedUser.id), eq(sessionsTable.type, 'regular')));

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
      .filter((provider): provider is EnabledOAuthProvider => appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider));

    return ctx.json({ ...restInfo, enabledOAuth, sessions }, 200);
  })
  /**
   * Get my user menu
   */
  .openapi(meRoutes.getMyMenu, async (ctx) => {
    const user = getContextUser();
    const memberships = getContextMemberships();

    const emptyData = appConfig.menuStructure.reduce((acc, section) => {
      acc[section.entityType] = [];
      return acc;
    }, {} as UserMenu);

    if (!memberships.length) return ctx.json(emptyData, 200);

    const buildMenuForSection = async ({ entityType, subentityType }: MenuSection): Promise<MenuItem[]> => {
      const entities = await getUserMenuEntities(entityType, user.id);
      const subentities = subentityType ? await getUserMenuEntities(subentityType, user.id) : [];

      const allowedEntities = entities.filter((entity) => permissionManager.isPermissionAllowed([entity.membership], 'read', entity));

      return allowedEntities.map((entity) => {
        const entityIdField = appConfig.entityIdFields[entityType];

        const submenu = subentities.filter(
          (sub) =>
            sub.membership[entityIdField] === entity.id && permissionManager.isPermissionAllowed([entity.membership, sub.membership], 'read', sub),
        );
        return { ...entity, submenu };
      });
    };

    const menu = {} as UserMenu;

    for (const section of appConfig.menuStructure) {
      menu[section.entityType] = await buildMenuForSection(section);
    }

    return ctx.json(menu, 200);
  })
  /**
   * Get my invitations - a combination of pending membership and entity data
   */
  .openapi(meRoutes.getMyInvitations, async (ctx) => {
    const user = getContextUser();

    const pendingInvites = await Promise.all(
      appConfig.contextEntityTypes.map((entityType) => {
        const entityTable = entityTables[entityType];
        const entityIdField = appConfig.entityIdFields[entityType];
        // TODO cant we use an existing select for this? or resolveEntity util?
        const entitySelect = {
          id: entityTable.id,
          entityType: entityTable.entityType,
          slug: entityTable.slug,
          name: entityTable.name,
          thumbnailUrl: entityTable.thumbnailUrl,
          bannerUrl: entityTable.bannerUrl,
        };

        return db
          .select({
            entity: entitySelect,
            expiresAt: tokensTable.expiresAt,
            invitedBy: userBaseSelect,
            membership: membershipsTable,
          })
          .from(membershipsTable)
          .leftJoin(usersTable, eq(usersTable.id, membershipsTable.createdBy))
          .innerJoin(entityTable, eq(entityTable.id, membershipsTable[entityIdField]))
          .innerJoin(tokensTable, eq(tokensTable.id, membershipsTable.tokenId))
          .where(
            and(
              eq(membershipsTable.contextType, entityType),
              eq(membershipsTable.userId, user.id),
              isNotNull(membershipsTable.tokenId),
              isNull(membershipsTable.activatedAt),
            ),
          );
      }),
    );

    return ctx.json(pendingInvites.flat(), 200);
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

    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { user: 'self' } });

    const { userFlags, ...passedUpdates } = ctx.req.valid('json');

    const { slug, firstName, lastName } = passedUpdates;

    if (slug && slug !== user.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) throw new AppError({ status: 409, type: 'slug_exists', severity: 'warn', entityType: 'user', meta: { slug } });
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
    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { user: 'self' } });

    // Delete user
    await db.delete(usersTable).where(eq(usersTable.id, user.id));

    deleteAuthCookie(ctx, 'session');
    logEvent('info', 'User deleted itself', { userId: user.id });

    return ctx.json(true, 200);
  })
  /**
   * Delete one of my entity memberships
   */
  .openapi(meRoutes.deleteMyMembership, async (ctx) => {
    const user = getContextUser();

    const { entityType, idOrSlug } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType });

    const entityIdField = appConfig.entityIdFields[entityType];

    // Delete memberships
    await db.delete(membershipsTable).where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable[entityIdField], entity.id)));

    logEvent('info', 'User left entity', { userId: user.id });

    return ctx.json(true, 200);
  })
  /**
   * Get upload token
   */
  .openapi(meRoutes.getUploadToken, async (ctx) => {
    const { public: isPublic, organizationId, templateId } = ctx.req.valid('query');
    const user = getContextUser();

    // This will be used to as first part of S3 key
    const sub = [appConfig.s3BucketPrefix, organizationId, user.id].filter((part): part is string => typeof part === 'string').join('/');

    try {
      const params = getParams(templateId, isPublic, sub);
      const paramsString = JSON.stringify(params);
      const signature = getSignature(paramsString);

      const token = { sub, public: isPublic, s3: !!env.S3_ACCESS_KEY_ID, params, signature };

      return ctx.json(token, 200);
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError({
        status: 500,
        type: 'auth_key_not_found',
        severity: 'error',
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
    const [user] = await usersBaseQuery()
      .innerJoin(unsubscribeTokensTable, eq(usersTable.id, unsubscribeTokensTable.userId))
      .where(eq(unsubscribeTokensTable.token, token))
      .limit(1);

    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

    // Verify token
    const isValid = verifyUnsubscribeToken(user.email, token);
    if (!isValid) throw new AppError({ status: 401, type: 'unsubscribe_failed', severity: 'warn', entityType: 'user' });

    // Update user
    await db.update(usersTable).set({ newsletter: false }).where(eq(usersTable.id, user.id));

    const redirectUrl = new URL('/auth/unsubscribed', appConfig.frontendUrl);
    return ctx.redirect(redirectUrl, 302);
  })
  /**
   *  Get SSE stream
   */
  .get('/sse', isAuthenticated, async (ctx) => {
    const { id: userId } = getContextUser();
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');
      streams.set(userId, stream);

      logEvent('info', 'Connected to SSE', { userId });
      await stream.writeSSE({
        event: 'connected',
        data: 'connected',
        retry: 5000,
      });

      stream.onAbort(async () => {
        logEvent('warn', 'Disconnected from SSE', { userId });
        streams.delete(userId);
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

export default meRouteHandlers;
