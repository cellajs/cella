import { OpenAPIHono, type z } from '@hono/zod-openapi';
import type { EnabledOAuthProvider, MenuSection } from 'config';
import { appConfig } from 'config';
import { and, eq, getTableColumns, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { passwordsTable } from '#/db/schema/passwords';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { totpsTable } from '#/db/schema/totps';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { entityTables } from '#/entity-config';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { getParams, getSignature } from '#/lib/transloadit';
import { isAuthenticated } from '#/middlewares/guard';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/helpers/cookie';
import { deviceInfo } from '#/modules/auth/helpers/device-info';
import { parseAndValidatePasskeyAttestation } from '#/modules/auth/helpers/passkey';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/helpers/session';
import { verifyTotpCode } from '#/modules/auth/helpers/totps';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getUserSessions } from '#/modules/me/helpers/get-sessions';
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
  /*
   * Get me
   */
  .openapi(meRoutes.getMe, async (ctx) => {
    const user = getContextUser();

    // Update last visit date
    await db.update(usersTable).set({ lastStartedAt: getIsoDate() }).where(eq(usersTable.id, user.id));

    return ctx.json(user, 200);
  })
  /*
   * Get my auth data
   */
  .openapi(meRoutes.getMyAuth, async (ctx) => {
    const user = getContextUser();

    // Queries for user authentication factors
    // Select passkey fields except for sensitive credential data
    const { credentialId, publicKey, ...passkeySelect } = getTableColumns(passkeysTable);
    const getPasskeys = db.select(passkeySelect).from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    const getPassword = db.select().from(passwordsTable).where(eq(passwordsTable.userId, user.id)).limit(1);

    const getTOTP = db.select().from(totpsTable).where(eq(totpsTable.userId, user.id));

    const getOAuth = db.select({ providerId: oauthAccountsTable.providerId }).from(oauthAccountsTable).where(eq(oauthAccountsTable.userId, user.id));

    // Run all queries + fetch user sessions in parallel
    const [passkeys, password, totps, oauthAccounts, sessions] = await Promise.all([
      getPasskeys,
      getPassword,
      getTOTP,
      getOAuth,
      getUserSessions(ctx, user.id),
    ]);

    // Filter only providers that are enabled in appConfig
    const enabledOAuth = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOAuthProvider => appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider));

    // Return a consolidated JSON response with all relevant auth info
    return ctx.json(
      {
        enabledOAuth,
        hasTotp: !!totps.length,
        hasPassword: !!password.length,
        sessions,
        passkeys,
      },
      200,
    );
  })
  /*
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
  /*
   * Get my invites data
   */
  .openapi(meRoutes.getMyInvites, async (ctx) => {
    const user = getContextUser();

    const pendingInvites = await Promise.all(
      appConfig.contextEntityTypes.map((entityType) => {
        const entityTable = entityTables[entityType];
        const entityIdField = appConfig.entityIdFields[entityType];
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
            invitedBy: userBaseSelect,
            expiresAt: tokensTable.expiresAt,
            token: tokensTable.token,
            tokenId: tokensTable.id,
          })
          .from(tokensTable)
          .leftJoin(usersTable, eq(usersTable.id, tokensTable.createdBy))
          .innerJoin(entityTable, eq(entityTable.id, tokensTable[entityIdField]))
          .where(
            and(
              eq(tokensTable.type, 'invitation'),
              eq(tokensTable.entityType, entityType),
              eq(tokensTable.userId, user.id),
              isNotNull(tokensTable.role),
              isNull(tokensTable.consumedAt),
            ),
          );
      }),
    );

    return ctx.json(pendingInvites.flat(), 200);
  })
  /*
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
  /*
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
  /*
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
  /*
   * Delete one of my entity memberships
   */
  .openapi(meRoutes.deleteMyMembership, async (ctx) => {
    const user = getContextUser();

    const { entityType, idOrSlug } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType });

    const entityIdField = appConfig.entityIdFields[entityType];

    // Delete the memberships
    await db.delete(membershipsTable).where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable[entityIdField], entity.id)));

    logEvent('info', 'User left entity', { userId: user.id });

    return ctx.json(true, 200);
  })
  /*
   * Registrate passkey
   */
  .openapi(meRoutes.registratePasskey, async (ctx) => {
    const { attestationObject, clientDataJSON, nameOnDevice } = ctx.req.valid('json');
    const user = getContextUser();

    const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
    if (!challengeFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'error' });

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(clientDataJSON, attestationObject, challengeFromCookie);

    const device = deviceInfo(ctx);
    const passkeyValue = {
      userEmail: user.email,
      credentialId,
      publicKey,
      nameOnDevice,
      deviceName: device.name,
      deviceType: device.type,
      deviceOs: device.os,
      browser: device.browser,
    };

    const { credentialId: _, publicKey: __, ...passkeySelect } = getTableColumns(passkeysTable);

    // Save public key in the database
    const [newPasskey] = await db.insert(passkeysTable).values(passkeyValue).returning(passkeySelect);

    return ctx.json(newPasskey, 200);
  })
  /*
   * Unlink passkey
   */
  .openapi(meRoutes.unlinkPasskey, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const user = getContextUser();

    // Remove all passkeys linked to this user's email
    await db.delete(passkeysTable).where(and(eq(passkeysTable.userEmail, user.email), eq(passkeysTable.id, id)));

    // Check if the user still has any passkeys or TOTP entries registered
    const [userPasskeys, userTotps] = await Promise.all([
      db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email)),
      db.select().from(totpsTable).where(eq(totpsTable.userId, user.id)),
    ]);

    // If no TOTP exists, disable 2FA completely
    if (!userPasskeys.length && !userTotps.length) await db.update(usersTable).set({ twoFactorEnabled: false }).where(eq(usersTable.id, user.id));

    return ctx.json(!!userPasskeys.length, 200);
  })
  /*
   * Setup TOTP
   */
  .openapi(meRoutes.setupTOTP, async (ctx) => {
    const { code } = ctx.req.valid('json');
    const user = getContextUser();

    // Retrieve the encoded totp secret from cookie
    const encoderSecretKey = await getAuthCookie(ctx, 'totp-key');
    if (!encoderSecretKey) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'warn' });

    try {
      const isValid = verifyTotpCode(code, encoderSecretKey);
      if (!isValid) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn' });
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError({ status: 500, type: 'totp_verification_failed', severity: 'error', originalError: error });
      }
    }
    // Save 32encoded secret key in database
    await db.insert(totpsTable).values({ userId: user.id, encoderSecretKey });

    return ctx.json(true, 200);
  })
  /*
   * Unlink TOTP
   */
  .openapi(meRoutes.unlinkTOTP, async (ctx) => {
    const user = getContextUser();

    // Remove all totps linked to this user's email
    await db.delete(totpsTable).where(eq(totpsTable.userId, user.id));

    // Check if the user still has any passkeys entries registered
    const userPasskeys = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    // If no passkeys exists, disable 2FA completely
    if (!userPasskeys.length) await db.update(usersTable).set({ twoFactorEnabled: false }).where(eq(usersTable.id, user.id));

    return ctx.json(true, 200);
  })
  /*
   * Get upload token
   */
  .openapi(meRoutes.getUploadToken, async (ctx) => {
    const { public: isPublic, organizationId, templateId } = ctx.req.valid('query');
    const user = getContextUser();

    // This will be used to as first part of S3 key
    const sub = [appConfig.s3BucketPrefix, organizationId, user.id].filter(Boolean).join('/');

    try {
      const params = getParams(templateId, isPublic, sub);
      const paramsString = JSON.stringify(params);
      const signature = getSignature(paramsString);

      const token = { sub, public: isPublic, s3: !!env.S3_ACCESS_KEY_ID, params, signature };

      return ctx.json(token, 200);
    } catch (error) {
      throw new AppError({ status: 500, type: 'missing_auth_key', severity: 'error' });
    }
  })
  /*
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
  /*
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
