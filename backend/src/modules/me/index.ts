import { and, asc, eq } from 'drizzle-orm';

import { db } from '#/db/db';
import { auth } from '#/db/lucia';
import { usersTable } from '#/db/schema/users';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono, type EnabledOauthProviderOptions } from '#/types/common';
import { removeSessionCookie } from '../auth/helpers/cookies';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUserWithCount } from '../users/helpers/transform-database-user';
import meRoutesConfig from './routes';

import { config } from 'config';
import type { z } from 'zod';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { type MenuSection, entityIdFields, entityTables, menuSections } from '#/entity-config';
import { getContextUser, getMemberships } from '#/lib/context';
import { getPreparedSessions } from './helpers/get-sessions';
import type { menuItemsSchema, userMenuSchema } from './schema';

const app = new CustomHono();

// Me (self) endpoints
const meRoutes = app
  /*
   * Get current user
   */
  .openapi(meRoutesConfig.getSelf, async (ctx) => {
    const user = getContextUser();
    const memberships = getMemberships();

    const passkey = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    // List enabled identity providers
    const oauthAccounts = await db
      .select({ providerId: oauthAccountsTable.providerId })
      .from(oauthAccountsTable)
      .where(eq(oauthAccountsTable.userId, user.id));

    const validOAuthAccounts = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOauthProviderOptions => config.enabledOauthProviders.includes(provider as EnabledOauthProviderOptions));

    // Update last visit date
    await db.update(usersTable).set({ lastStartedAt: new Date() }).where(eq(usersTable.id, user.id));

    // Prepare data
    const data = {
      ...transformDatabaseUserWithCount(user, memberships.length),
      oauth: validOAuthAccounts,
      passkey: !!passkey.length,
      sessions: await getPreparedSessions(user.id, ctx),
    };

    return ctx.json({ success: true, data }, 200);
  })
  // Your main function
  .openapi(meRoutesConfig.getUserMenu, async (ctx) => {
    const user = getContextUser();
    const memberships = getMemberships();

    // Fetch function for each menu section, including handling submenus
    const fetchMenuItemsForSection = async (section: MenuSection) => {
      let formattedSubmenus: Omit<z.infer<typeof menuItemsSchema>[number], 'submenu'>[];
      const mainTable = entityTables[section.entityType];
      const mainEntityIdField = entityIdFields[section.entityType];

      const entity = await db
        .select({
          item: mainTable,
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

        const subEntity = await db
          .select({
            item: subTable,
            membership: membershipSelect,
          })
          .from(subTable)
          .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, section.submenu.entityType)))
          .orderBy(asc(membershipsTable.order))
          .innerJoin(membershipsTable, eq(membershipsTable[subEntityIdField], subTable.id));

        // TODO is this formatting necessary? Can we return data with proper select? toDateString?
        formattedSubmenus = subEntity.map(({ item, membership }) => ({
          slug: item.slug,
          id: item.id,
          createdAt: item.createdAt.toDateString(),
          modifiedAt: item.modifiedAt?.toDateString() ?? null,
          organizationId: membership.organizationId,
          name: item.name,
          entity: item.entity,
          thumbnailUrl: item.thumbnailUrl,
          membership,
        }));
      }

      // TODO is this formatting necessary? Can we return data with proper select? toDateString is necessary?
      return entity.map(({ item, membership }) => ({
        slug: item.slug,
        id: item.id,
        createdAt: item.createdAt.toDateString(),
        modifiedAt: item.modifiedAt?.toDateString() ?? null,
        organizationId: membership.organizationId,
        name: item.name,
        entity: item.entity,
        thumbnailUrl: item.thumbnailUrl,
        membership,
        submenu: section.submenu ? formattedSubmenus.filter((p) => p.membership[section.submenu.parentField] === item.id) : [],
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
        Promise.resolve({} as z.infer<typeof userMenuSchema>),
      );

      return result;
    };

    return ctx.json({ success: true, data: await data() }, 200);
  })
  /*
   * Terminate a session
   */
  .openapi(meRoutesConfig.deleteSessions, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    const sessionIds = Array.isArray(ids) ? ids : [ids];

    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const currentSessionId = auth.readSessionCookie(cookieHeader ?? '');

    const errors: ErrorType[] = [];

    await Promise.all(
      sessionIds.map(async (id) => {
        try {
          if (id === currentSessionId) {
            removeSessionCookie(ctx);
          }
          await auth.invalidateSession(id);
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
    const memberships = getMemberships();

    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: 'self' });

    const { email, bannerUrl, bio, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    if (slug && slug !== user.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'user', { slug });
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({
        email,
        bannerUrl,
        bio,
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

    const passkey = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    const oauthAccounts = await db
      .select({
        providerId: oauthAccountsTable.providerId,
      })
      .from(oauthAccountsTable)
      .where(eq(oauthAccountsTable.userId, user.id));

    const validOAuthAccounts = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOauthProviderOptions => config.enabledOauthProviders.includes(provider as EnabledOauthProviderOptions));
    logEvent('User updated', { user: updatedUser.id });

    const data = {
      ...transformDatabaseUserWithCount(updatedUser, memberships.length),
      oauth: validOAuthAccounts,
      passkey: !!passkey.length,
    };

    return ctx.json({ success: true, data }, 200);
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
    await auth.invalidateUserSessions(user.id);
    removeSessionCookie(ctx);
    logEvent('User deleted', { user: user.id });

    return ctx.json({ success: true }, 200);
  })

  /*
   * Delete passkey of self
   */
  .openapi(meRoutesConfig.deletePasskey, async (ctx) => {
    const user = getContextUser();

    await db.delete(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    return ctx.json({ success: true }, 200);
  });

export default meRoutes;
