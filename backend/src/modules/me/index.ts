import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';

import type { EnabledOauthProvider } from 'config';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { invalidateSessionById, invalidateUserSessions, validateSession } from '../auth/helpers/session';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUserWithCount } from '../users/helpers/transform-database-user';
import meRoutesConfig from './routes';

import { OpenAPIHono } from '@hono/zod-openapi';
import { config } from 'config';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { type MenuSection, entityIdFields, entityTables, menuSections } from '#/entity-config';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { sendSSEToUsers } from '#/lib/sse';
import { deleteAuthCookie, getAuthCookie } from '../auth/helpers/cookie';
import { getUserSessions } from './helpers/get-sessions';
import type { menuItemSchema, userMenuSchema } from './schema';

type UserMenu = z.infer<typeof userMenuSchema>;
type MenuItem = z.infer<typeof menuItemSchema>;

const app = new OpenAPIHono<Env>();

// Me (self) endpoints
const meRoutes = app
  /*
   * Get current user
   */
  .openapi(meRoutesConfig.getSelf, async (ctx) => {
    const user = getContextUser();
    const memberships = getContextMemberships();

    // Update last visit date
    await db.update(usersTable).set({ lastStartedAt: new Date() }).where(eq(usersTable.id, user.id));

    return ctx.json({ success: true, data: transformDatabaseUserWithCount(user, memberships.length) }, 200);
  })
  /*
   * Get current user auth info
   */
  .openapi(meRoutesConfig.getSelfAuthData, async (ctx) => {
    const user = getContextUser();

    const getPasskey = db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));
    const getOAuth = db.select({ providerId: oauthAccountsTable.providerId }).from(oauthAccountsTable).where(eq(oauthAccountsTable.userId, user.id));

    const [passkeys, oauthAccounts, sessions] = await Promise.all([getPasskey, getOAuth, getUserSessions(ctx, user.id)]);

    const validOAuthAccounts = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOauthProvider => config.enabledOauthProviders.includes(provider as EnabledOauthProvider));

    return ctx.json({ success: true, data: { oauth: validOAuthAccounts, passkey: !!passkeys.length, sessions } }, 200);
  })
  /*
   * Get current user menu
   */
  .openapi(meRoutesConfig.getUserMenu, async (ctx) => {
    const user = getContextUser();
    const memberships = getContextMemberships();

    // Fetch function for each menu section, including handling submenus
    const fetchMenuItemsForSection = async (section: MenuSection) => {
      let submenu: MenuItem[] = [];
      const mainTable = entityTables[section.entityType];
      const mainEntityIdField = entityIdFields[section.entityType];

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
        .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, section.entityType)))
        .orderBy(asc(membershipsTable.order))
        .innerJoin(membershipsTable, eq(membershipsTable[mainEntityIdField], mainTable.id));

      // If the section has a submenu, fetch the submenu items
      if (section.submenu) {
        const subTable = entityTables[section.submenu.entityType];
        const subEntityIdField = entityIdFields[section.submenu.entityType];

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
          .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, section.submenu.entityType)))
          .orderBy(asc(membershipsTable.order))
          .innerJoin(membershipsTable, eq(membershipsTable[subEntityIdField], subTable.id));
      }

      return entity.map((entity) => ({
        ...entity,
        submenu: submenu.filter((p) => {
          const parentField = section.submenu?.parentField;
          return parentField ? p.membership[parentField] === entity.id : false;
        }),
      }));
    };

    // Build the menu data asynchronously
    const data = async () => {
      const result = await menuSections.reduce(
        async (accPromise, section) => {
          const acc = await accPromise;
          if (!memberships.length) {
            acc[section.name] = [];
            return acc;
          }

          // Fetch menu items for the current section
          acc[section.name] = await fetchMenuItemsForSection(section);
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
  .openapi(meRoutesConfig.deleteSessions, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    const sessionIds = Array.isArray(ids) ? ids : [ids];

    const currentSessionToken = (await getAuthCookie(ctx, 'session')) || '';
    const { session } = await validateSession(currentSessionToken);

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
  .openapi(meRoutesConfig.updateSelf, async (ctx) => {
    const user = getContextUser();
    const memberships = getContextMemberships();

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
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, user.id))
      .returning();

    return ctx.json({ success: true, data: transformDatabaseUserWithCount(updatedUser, memberships.length) }, 200);
  })
  /*
   * Delete current user (self)
   */
  .openapi(meRoutesConfig.deleteSelf, async (ctx) => {
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
  .openapi(meRoutesConfig.leaveEntity, async (ctx) => {
    const user = getContextUser();
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: 'self' });

    const { entityType, idOrSlug } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);

    const entityIdField = entityIdFields[entityType];

    // Delete the memberships
    await db
      .delete(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, entityType), eq(membershipsTable[entityIdField], entity.id)));

    sendSSEToUsers([user.id], 'remove_entity', { id: entity.id, entity: entity.entity });
    logEvent('User leave entity', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * TODO? here? Also create then..? Delete passkey of self
   */
  .openapi(meRoutesConfig.deletePasskey, async (ctx) => {
    const user = getContextUser();

    await db.delete(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    return ctx.json({ success: true }, 200);
  });

export default meRoutes;
