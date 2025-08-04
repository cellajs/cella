import { OpenAPIHono, type z } from '@hono/zod-openapi';
import type { EnabledOAuthProvider, MenuSection } from 'config';
import { appConfig } from 'config';
import { and, eq, isNotNull } from 'drizzle-orm';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { entityTables } from '#/entity-config';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { getParams, getSignature } from '#/lib/transloadit';
import { isAuthenticated } from '#/middlewares/guard';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/helpers/cookie';
import { parseAndValidatePasskeyAttestation } from '#/modules/auth/helpers/passkey';
import { getParsedSessionCookie, invalidateAllUserSessions, invalidateSessionById, validateSession } from '#/modules/auth/helpers/session';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getUserSessions } from '#/modules/me/helpers/get-sessions';
import { getUserMenuEntities } from '#/modules/me/helpers/get-user-menu-entities';
import meRoutes from '#/modules/me/routes';
import type { menuItemSchema, menuSchema } from '#/modules/me/schema';
import { getUserBy } from '#/modules/users/helpers/get-user-by';
import { userSummarySelect } from '#/modules/users/helpers/select';
import { verifyUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import permissionManager from '#/permissions/permissions-config';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

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

    const getPasskey = db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));
    const getOAuth = db.select({ providerId: oauthAccountsTable.providerId }).from(oauthAccountsTable).where(eq(oauthAccountsTable.userId, user.id));
    const [passkeys, oauthAccounts, sessions] = await Promise.all([getPasskey, getOAuth, getUserSessions(ctx, user.id)]);

    const validOAuthAccounts = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOAuthProvider => appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider));

    return ctx.json({ oauth: validOAuthAccounts, passkey: !!passkeys.length, sessions }, 200);
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
          .select({ entity: entitySelect, invitedBy: userSummarySelect, expiresAt: tokensTable.expiresAt, token: tokensTable.token })
          .from(tokensTable)
          .leftJoin(usersTable, eq(usersTable.id, tokensTable.createdBy))
          .innerJoin(entityTable, eq(entityTable.id, tokensTable[entityIdField]))
          .where(
            and(
              eq(tokensTable.type, 'invitation'),
              eq(tokensTable.entityType, entityType),
              eq(tokensTable.userId, user.id),
              isNotNull(tokensTable.role),
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

    const currentSessionData = await getParsedSessionCookie(ctx);

    const { session } = currentSessionData ? await validateSession(currentSessionData.sessionToken) : {};

    const rejectedItems: string[] = [];

    await Promise.all(
      sessionIds.map(async (id) => {
        try {
          if (session && id === session.id) deleteAuthCookie(ctx, 'session');
          await invalidateSessionById(id, user.id);
        } catch (error) {
          // Could be not found, not owned by user, etc.
          rejectedItems.push(id);
        }
      }),
    );

    return ctx.json({ success: true, rejectedItems }, 200);
  })
  /*
   * Update current user (me)
   */
  .openapi(meRoutes.updateMe, async (ctx) => {
    const user = getContextUser();

    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { user: 'self' } });

    const { bannerUrl, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    const name = [firstName, lastName].filter(Boolean).join(' ') || slug;

    if (slug && slug !== user.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) throw new AppError({ status: 409, type: 'slug_exists', severity: 'warn', entityType: 'user', meta: { slug } });
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({
        bannerUrl,
        firstName,
        lastName,
        language,
        newsletter,
        thumbnailUrl,
        slug,
        name,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, user.id))
      .returning();

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

    // Invalidate sessions
    await invalidateAllUserSessions(user.id);
    deleteAuthCookie(ctx, 'session');
    logEvent({ msg: 'User deleted itself', meta: { user: user.id } });

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

    logEvent({ msg: 'User left entity', meta: { user: user.id } });

    return ctx.json(true, 200);
  })
  /*
   * Create passkey
   */
  .openapi(meRoutes.createPasskey, async (ctx) => {
    const { attestationObject, clientDataJSON } = ctx.req.valid('json');
    const user = getContextUser();

    const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
    if (!challengeFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'error' });

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(clientDataJSON, attestationObject, challengeFromCookie);

    // Save public key in the database
    await db.insert(passkeysTable).values({ userEmail: user.email, credentialId, publicKey });

    return ctx.json(true, 200);
  })
  /*
   * Delete passkey
   */
  .openapi(meRoutes.deletePasskey, async (ctx) => {
    const user = getContextUser();

    await db.delete(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

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
    const user = await getUserBy('unsubscribeToken', token, 'unsafe');
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

export default meRouteHandlers;
