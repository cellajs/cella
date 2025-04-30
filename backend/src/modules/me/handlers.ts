import crypto from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { EnabledOauthProvider } from 'config';
import { config } from 'config';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import type { z } from 'zod';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { usersTable } from '#/db/schema/users';
import { type EntityRelations, entityIdFields, entityRelations, entityTables } from '#/entity-config';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { isAuthenticated } from '#/middlewares/guard';
import { logEvent } from '#/middlewares/logger/log-event';
import { getUserBy } from '#/modules/users/helpers/get-user-by';
import { verifyUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import defaultHook from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { utcDateString } from '#/utils/utc-data-string';
import { deleteAuthCookie, getAuthCookie } from '../auth/helpers/cookie';
import { parseAndValidatePasskeyAttestation } from '../auth/helpers/passkey';
import { getParsedSessionCookie, invalidateSessionById, invalidateUserSessions, validateSession } from '../auth/helpers/session';
import { checkSlugAvailable } from '../entities/helpers/check-slug';
import { membershipSelect } from '../memberships/helpers/select';
import { getUserSessions } from './helpers/get-sessions';
import { uploadTemplates } from './helpers/upload-templates';
import meRouteConfig from './routes';
import type { menuItemSchema, userMenuSchema } from './schema';

type UserMenu = z.infer<typeof userMenuSchema>;
type MenuItem = z.infer<typeof menuItemSchema>;

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

export const streams = new Map<string, SSEStreamingApi>();

const meRoutes = app
  /*
   * Get current user
   */
  .openapi(meRouteConfig.getSelf, async (ctx) => {
    const user = getContextUser();

    // Update last visit date
    await db.update(usersTable).set({ lastStartedAt: getIsoDate() }).where(eq(usersTable.id, user.id));

    return ctx.json({ success: true, data: user }, 200);
  })
  /*
   * Get current user auth info
   */
  .openapi(meRouteConfig.getSelfAuthData, async (ctx) => {
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
   * Get current user menu
   */
  .openapi(meRouteConfig.getSelfMenu, async (ctx) => {
    const user = getContextUser();
    const memberships = getContextMemberships();

    // Fetch function for each menu section, including handling submenus
    const fetchMenuItemsForSection = async (section: EntityRelations) => {
      let submenu: MenuItem[] = [];
      const mainTable = entityTables[section.entity];
      const mainEntityIdField = entityIdFields[section.entity];

      const entity = await db
        .select({
          slug: mainTable.slug,
          id: mainTable.id,
          createdAt: mainTable.createdAt,
          modifiedAt: mainTable.modifiedAt,
          organizationId: membershipSelect.organizationId,
          name: mainTable.name,
          entity: mainTable.entity,
          thumbnailUrl: mainTable.thumbnailUrl,
          membership: membershipSelect,
        })
        .from(mainTable)
        .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, section.entity)))
        .orderBy(asc(membershipsTable.order))
        .innerJoin(membershipsTable, and(eq(membershipsTable[mainEntityIdField], mainTable.id), isNotNull(membershipsTable.activatedAt)));

      // If the section has a submenu, fetch the submenu items
      if (section.subEntity) {
        const subTable = entityTables[section.subEntity];
        const subEntityIdField = entityIdFields[section.subEntity];

        submenu = await db
          .select({
            slug: subTable.slug,
            id: subTable.id,
            createdAt: subTable.createdAt,
            modifiedAt: subTable.modifiedAt,
            organizationId: membershipSelect.organizationId,
            name: subTable.name,
            entity: subTable.entity,
            thumbnailUrl: subTable.thumbnailUrl,
            membership: membershipSelect,
          })
          .from(subTable)
          .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, section.subEntity)))
          .orderBy(asc(membershipsTable.order))
          .innerJoin(membershipsTable, eq(membershipsTable[subEntityIdField], subTable.id));
      }

      return entity.map((entity) => ({
        ...entity,
        submenu: submenu.filter((p) => p.membership[mainEntityIdField] === entity.id),
      }));
    };

    // Build the menu data asynchronously
    const data = async () => {
      const result = await entityRelations.reduce(
        async (accPromise, section) => {
          const acc = await accPromise;
          if (!memberships.length) {
            acc[section.menuSectionName] = [];
            return acc;
          }

          // Fetch menu items for the current section
          acc[section.menuSectionName] = await fetchMenuItemsForSection(section);
          return acc;
        },
        Promise.resolve({} as UserMenu),
      );

      return result;
    };

    return ctx.json({ success: true, data: await data() }, 200);
  })
  /*
   * Terminate a session
   */
  .openapi(meRouteConfig.deleteSessions, async (ctx) => {
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
   * Update current user (self)
   */
  .openapi(meRouteConfig.updateSelf, async (ctx) => {
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
   * Delete current user (self)
   */
  .openapi(meRouteConfig.deleteSelf, async (ctx) => {
    const user = getContextUser();

    // Check if user exists
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: 'self' });

    // Delete user
    await db.delete(usersTable).where(eq(usersTable.id, user.id));

    // Invalidate sessions
    await invalidateUserSessions(user.id);
    deleteAuthCookie(ctx, 'session');
    logEvent('User deleted', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete current user (self) entity membership
   */
  .openapi(meRouteConfig.leaveEntity, async (ctx) => {
    const user = getContextUser();

    const { entityType, idOrSlug } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);

    const entityIdField = entityIdFields[entityType];

    // Delete the memberships
    await db
      .delete(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, entityType), eq(membershipsTable[entityIdField], entity.id)));

    logEvent('User leave entity', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Create passkey for self
   */
  .openapi(meRouteConfig.createPasskey, async (ctx) => {
    const { attestationObject, clientDataJSON, userEmail } = ctx.req.valid('json');

    const challengeFromCookie = await getAuthCookie(ctx, 'passkey_challenge');
    if (!challengeFromCookie) return errorResponse(ctx, 401, 'invalid_credentials', 'error');

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(clientDataJSON, attestationObject, challengeFromCookie);

    // Save public key in the database
    await db.insert(passkeysTable).values({ userEmail, credentialId, publicKey });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete passkey of self
   */
  .openapi(meRouteConfig.deletePasskey, async (ctx) => {
    const user = getContextUser();

    await db.delete(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    return ctx.json({ success: true }, 200);
  })
  /*
   * Get upload token
   */
  .openapi(meRouteConfig.getUploadToken, async (ctx) => {
    const user = getContextUser();
    const { public: isPublic, organization, templateId } = ctx.req.valid('query');

    // This will be used to as first part of S3 key
    const sub = organization ? `${organization}/${user.id}` : user.id;

    // Transloadit security requires us to set an expiration date like this
    const expires = utcDateString(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // And a nonce to prevent replay attacks
    const nonce = nanoid(16);

    const authKey = env.TRANSLOADIT_KEY;
    const authSecret = env.TRANSLOADIT_SECRET;

    if (!authKey || !authSecret) {
      return errorResponse(ctx, 500, 'missing_auth_key', 'error');
    }

    const template = uploadTemplates[templateId];

    const params = {
      auth: {
        key: authKey,
        expires,
        nonce,
      },
      steps: {
        ':original': {
          robot: '/upload/handle',
        },
        // Inject steps based on template: avatar thumbnail, cover image, attachments ...
        ...template.steps,
        exported: {
          // Use is also based on template data
          use: template.use,
          robot: '/s3/store',
          credentials: isPublic ? 'imado-dev' : 'imado-dev-priv',
          host: 's3.nl-ams.scw.cloud',
          no_vhost: true,
          url_prefix: '',
          acl: isPublic ? 'public-read' : 'private',
          path: `/${sub}/\${file.id}.\${file.url_name}`,
        },
      },
    };

    const paramsString = JSON.stringify(params);
    const signatureBytes = crypto.createHmac('sha384', authSecret).update(Buffer.from(paramsString, 'utf-8'));
    // The final signature needs the hash name in front, so
    // the hashing algorithm can be updated in a backwards-compatible
    // way when old algorithms become insecure.
    const signature = `sha384:${signatureBytes.digest('hex')}`;

    const token = {
      sub: sub,
      public: isPublic,
      imado: !!env.S3_ACCESS_KEY_ID,
      params,
      signature,
    };

    return ctx.json({ success: true, data: token }, 200);
  })
  /*
   * Unsubscribe a user by token from receiving newsletters
   */
  .openapi(meRouteConfig.unsubscribeSelf, async (ctx) => {
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

export default meRoutes;
