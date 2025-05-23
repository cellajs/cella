import { OpenAPIHono } from '@hono/zod-openapi';
import type { EnabledOauthProvider, MenuSection } from 'config';
import { config } from 'config';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import type { z } from 'zod';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { usersTable } from '#/db/schema/users';
import { entityTables } from '#/entity-config';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { getParams, getSignature } from '#/lib/transloadit';
import { isAuthenticated } from '#/middlewares/guard';
import { logEvent } from '#/middlewares/logger/log-event';
import { getUserBy } from '#/modules/users/helpers/get-user-by';
import { verifyUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { deleteAuthCookie, getAuthCookie } from '../auth/helpers/cookie';
import { parseAndValidatePasskeyAttestation } from '../auth/helpers/passkey';
import { getParsedSessionCookie, invalidateSessionById, invalidateUserSessions, validateSession } from '../auth/helpers/session';
import { checkSlugAvailable } from '../entities/helpers/check-slug';
import { membershipSummarySelect } from '../memberships/helpers/select';
import { getUserSessions } from './helpers/get-sessions';
import meRoutes from './routes';
import type { menuItemSchema, menuSchema } from './schema';

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

    return ctx.json({ success: true, data: user }, 200);
  })
  /*
   * Get my auth data
   */
  .openapi(meRoutes.getMyAuthData, async (ctx) => {
    const user = getContextUser();

    const getPasskey = db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));
    const getOAuth = db.select({ providerId: oauthAccountsTable.providerId }).from(oauthAccountsTable).where(eq(oauthAccountsTable.userId, user.id));
    const [passkeys, oauthAccounts, sessions] = await Promise.all([getPasskey, getOAuth, getUserSessions(ctx, user.id)]);

    const validOAuthAccounts = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOauthProvider => config.enabledOauthProviders.includes(provider as EnabledOauthProvider));

    console.info('Valid OAuth accounts:', validOAuthAccounts);

    return ctx.json({ success: true, data: { oauth: validOAuthAccounts, passkey: !!passkeys.length, sessions } }, 200);
  })
  /*
   * Get my user menu
   */
  .openapi(meRoutes.getMyMenu, async (ctx) => {
    const user = getContextUser();
    const memberships = getContextMemberships();

    // Fetch function for each menu section, including handling submenus
    const fetchMenuItemsForSection = async (section: MenuSection) => {
      let submenu: MenuItem[] = [];
      const mainTable = entityTables[section.entityType];
      const mainEntityIdField = config.entityIdFields[section.entityType];

      const entity = await db
        .select({
          slug: mainTable.slug,
          id: mainTable.id,
          createdAt: mainTable.createdAt,
          modifiedAt: mainTable.modifiedAt,
          organizationId: membershipSummarySelect.organizationId,
          name: mainTable.name,
          entityType: mainTable.entityType,
          thumbnailUrl: mainTable.thumbnailUrl,
          membership: membershipSummarySelect,
        })
        .from(mainTable)
        .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.contextType, section.entityType)))
        .orderBy(asc(membershipsTable.order))
        .innerJoin(membershipsTable, and(eq(membershipsTable[mainEntityIdField], mainTable.id), isNotNull(membershipsTable.activatedAt)));

      // If the section has a submenu, fetch the submenu items
      if (section.subentityType) {
        const subTable = entityTables[section.subentityType];
        const subentityIdField = config.entityIdFields[section.subentityType];

        submenu = await db
          .select({
            slug: subTable.slug,
            id: subTable.id,
            createdAt: subTable.createdAt,
            modifiedAt: subTable.modifiedAt,
            organizationId: membershipSummarySelect.organizationId,
            name: subTable.name,
            entityType: subTable.entityType,
            thumbnailUrl: subTable.thumbnailUrl,
            membership: membershipSummarySelect,
          })
          .from(subTable)
          .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.contextType, section.subentityType)))
          .orderBy(asc(membershipsTable.order))
          .innerJoin(membershipsTable, eq(membershipsTable[subentityIdField], subTable.id));
      }

      return entity.map((entity) => ({
        ...entity,
        submenu: submenu.filter((p) => p.membership[mainEntityIdField] === entity.id),
      }));
    };

    // Build the menu data asynchronously
    const data = async () => {
      const result = await config.menuStructure.reduce(
        async (accPromise, section) => {
          const acc = await accPromise;
          if (!memberships.length) {
            acc[section.entityType] = [];
            return acc;
          }

          // Fetch menu items for the current section
          acc[section.entityType] = await fetchMenuItemsForSection(section);
          return acc;
        },
        Promise.resolve({} as UserMenu),
      );

      return result;
    };

    return ctx.json({ success: true, data: await data() }, 200);
  })
  /*
   * Terminate one or more sessions
   */
  .openapi(meRoutes.deleteSessions, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    const sessionIds = Array.isArray(ids) ? ids : [ids];

    const currentSessionData = await getParsedSessionCookie(ctx);

    const { session } = currentSessionData ? await validateSession(currentSessionData.sessionToken) : {};

    const errors: ErrorType[] = [];

    await Promise.all(
      sessionIds.map(async (id) => {
        try {
          if (session && id === session.id) deleteAuthCookie(ctx, 'session');

          await invalidateSessionById(id);
        } catch (error) {
          errors.push(createError(ctx, 404, 'not_found', 'warn', undefined, { session: id }));
        }
      }),
    );

    return ctx.json({ success: true, errors: errors }, 200);
  })
  /*
   * Update current user (me)
   */
  .openapi(meRoutes.updateMe, async (ctx) => {
    const user = getContextUser();

    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: 'self' });

    const { bannerUrl, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    if (slug && slug !== user.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'user', { slug });
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
        name: [firstName, lastName].filter(Boolean).join(' ') || slug,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, user.id))
      .returning();

    return ctx.json({ success: true, data: updatedUser }, 200);
  })
  /*
   * Delete current user (me)
   */
  .openapi(meRoutes.deleteMe, async (ctx) => {
    const user = getContextUser();

    // Check if user exists
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: 'self' });

    // Delete user
    await db.delete(usersTable).where(eq(usersTable.id, user.id));

    // Invalidate sessions
    await invalidateUserSessions(user.id);
    deleteAuthCookie(ctx, 'session');
    logEvent('User deleted itself', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete one of my entity memberships
   */
  .openapi(meRoutes.deleteMyMembership, async (ctx) => {
    const user = getContextUser();

    const { entityType, idOrSlug } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);

    const entityIdField = config.entityIdFields[entityType];

    // Delete the memberships
    await db
      .delete(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.contextType, entityType), eq(membershipsTable[entityIdField], entity.id)));

    logEvent('User left entity', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Create passkey
   */
  .openapi(meRoutes.createPasskey, async (ctx) => {
    const { attestationObject, clientDataJSON, userEmail } = ctx.req.valid('json');

    const challengeFromCookie = await getAuthCookie(ctx, 'passkey_challenge');
    if (!challengeFromCookie) return errorResponse(ctx, 401, 'invalid_credentials', 'error');

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(clientDataJSON, attestationObject, challengeFromCookie);

    // Save public key in the database
    await db.insert(passkeysTable).values({ userEmail, credentialId, publicKey });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete passkey
   */
  .openapi(meRoutes.deletePasskey, async (ctx) => {
    const user = getContextUser();

    await db.delete(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    return ctx.json({ success: true }, 200);
  })
  /*
   * Get upload token
   */
  .openapi(meRoutes.getUploadToken, async (ctx) => {
    const { public: isPublic, organizationId, templateId } = ctx.req.valid('query');
    const user = getContextUser();

    // This will be used to as first part of S3 key
    const sub = [config.s3BucketPrefix, organizationId, user.id].filter(Boolean).join('/');

    try {
      const params = getParams(templateId, isPublic, sub);
      const paramsString = JSON.stringify(params);
      const signature = getSignature(paramsString);

      const token = { sub, public: isPublic, s3: !!env.S3_ACCESS_KEY_ID, params, signature };

      return ctx.json({ success: true, data: token }, 200);
    } catch (error) {
      return errorResponse(ctx, 500, 'missing_auth_key', 'error');
    }
  })
  /*
   * Unsubscribe myself by token from receiving newsletters
   */
  .openapi(meRoutes.unsubscribeMe, async (ctx) => {
    const { token } = ctx.req.valid('query');

    // Check if token exists
    const user = await getUserBy('unsubscribeToken', token, 'unsafe');
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    // Verify token
    const isValid = verifyUnsubscribeToken(user.email, token);
    if (!isValid) return errorResponse(ctx, 401, 'unsubscribe_failed', 'warn', 'user');

    // Update user
    await db.update(usersTable).set({ newsletter: false }).where(eq(usersTable.id, user.id));

    const redirectUrl = `${config.frontendUrl}/auth/unsubscribed`;
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
