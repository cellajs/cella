import { and, asc, count, eq } from 'drizzle-orm';

import { db } from '#/db/db';
import { auth } from '#/db/lucia';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { removeSessionCookie } from '../auth/helpers/cookies';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUserWithCount } from '../users/helpers/transform-database-user';
import meRoutesConfig from './routes';

import type { config } from 'config';
import type { z } from 'zod';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { entityMenuSections, entityTables, relationTables } from '#/entity-config';
import { getPreparedSessions } from './helpers/get-sessions';
import type { menuItemsSchema, userMenuSchema } from './schema';

const app = new CustomHono();

// Me (self) endpoints
const meRoutes = app
  /*
   * Get current user
   */
  .openapi(meRoutesConfig.getSelf, async (ctx) => {
    const user = ctx.get('user');

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id));

    const passkey = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    const oauthAccounts = await db
      .select({
        providerId: oauthAccountsTable.providerId,
      })
      .from(oauthAccountsTable)
      .where(eq(oauthAccountsTable.userId, user.id));

    // Update last visit date
    await db.update(usersTable).set({ lastVisitAt: new Date() }).where(eq(usersTable.id, user.id));

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUserWithCount(user, memberships),
          oauth: oauthAccounts.map((el) => el.providerId),
          passkey: !!passkey.length,
          sessions: await getPreparedSessions(user.id, ctx),
        },
      },
      200,
    );
  })
  /*
   * Get current user menu
   */
  .openapi(meRoutesConfig.getUserMenu, async (ctx) => {
    const user = ctx.get('user');

    const fetchAndFormatEntities = async (
      type: (typeof config.contextEntityTypes)[number],
      subEntityType?: (typeof config.contextEntityTypes)[number],
    ) => {
      let formattedSubmenus: z.infer<typeof menuItemsSchema>;
      const entityWithMemberships = await db
        .select({
          entity: entityTables[type],
          membership: membershipSelect,
        })
        .from(entityTables[type])
        .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, type)))
        .orderBy(asc(membershipsTable.order))
        .innerJoin(membershipsTable, eq(membershipsTable[`${type}Id`], entityTables[type].id));
      if (subEntityType && subEntityType in relationTables) {
        const relationTable = relationTables[subEntityType as keyof typeof relationTables];
        const submenuWithMemberships = await db
          .select({
            entity: entityTables[subEntityType],
            membership: membershipSelect,
            parent: relationTable,
          })
          .from(entityTables[subEntityType])
          .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, subEntityType)))
          .orderBy(asc(membershipsTable.order))
          .innerJoin(membershipsTable, eq(membershipsTable[`${subEntityType}Id`], entityTables[subEntityType].id))
          .innerJoin(relationTable, eq(relationTable[`${subEntityType}Id`], entityTables[subEntityType].id));

        // Format the fetched data
        formattedSubmenus = submenuWithMemberships.map(({ entity, membership, parent }) => ({
          slug: entity.slug,
          id: entity.id,
          createdAt: entity.createdAt.toDateString(),
          modifiedAt: entity.modifiedAt?.toDateString() ?? null,
          name: entity.name,
          entity: entity.entity,
          thumbnailUrl: entity.thumbnailUrl,
          membership,
          parentSlug: entityWithMemberships.find((i) => i.entity.id === parent[`${type}Id`])?.entity.slug,
          parentId: parent[`${type}Id`],
        }));
      }
      return entityWithMemberships.map(({ entity, membership }) => ({
        slug: entity.slug,
        id: entity.id,
        createdAt: entity.createdAt.toDateString(),
        modifiedAt: entity.modifiedAt?.toDateString() ?? null,
        name: entity.name,
        entity: entity.entity,
        thumbnailUrl: entity.thumbnailUrl,
        membership,
        submenu: formattedSubmenus ? formattedSubmenus.filter((p) => p.parentId === entity.id) : [],
      }));
    };
    const data = await entityMenuSections
      .filter((el) => !el.isSubmenu)
      .reduce(
        async (accPromise, section) => {
          const acc = await accPromise;
          const submenu = entityMenuSections.find((el) => el.storageType === section.storageType && el.isSubmenu);
          if (submenu) {
            return {
              ...acc,
              [section.storageType]: await fetchAndFormatEntities(section.type, submenu.type),
            };
          }
          return {
            ...acc,
            [section.storageType]: await fetchAndFormatEntities(section.type),
          };
        },
        Promise.resolve({} as z.infer<typeof userMenuSchema>),
      );

    return ctx.json(
      {
        success: true,
        data,
      },
      200,
    );
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
    const user = ctx.get('user');

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

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id));

    const passkey = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    const oauthAccounts = await db
      .select({
        providerId: oauthAccountsTable.providerId,
      })
      .from(oauthAccountsTable)
      .where(eq(oauthAccountsTable.userId, user.id));

    logEvent('User updated', { user: updatedUser.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUserWithCount(updatedUser, memberships),
          oauth: oauthAccounts.map((el) => el.providerId),
          passkey: !!passkey.length,
        },
      },
      200,
    );
  })
  /*
   * Delete current user (self)
   */
  .openapi(meRoutesConfig.deleteSelf, async (ctx) => {
    const user = ctx.get('user');
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
    const user = ctx.get('user');

    await db.delete(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    return ctx.json({ success: true }, 200);
  });

// const route = app.route('/me', meRoutes);

export type AppMeType = typeof meRoutes;

export default meRoutes;
