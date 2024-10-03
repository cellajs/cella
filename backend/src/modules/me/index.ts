import { and, asc, eq } from 'drizzle-orm';

import { db } from '#/db/db';
import { auth } from '#/db/lucia';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { type ContextEntity, CustomHono, type EnabledOauthProviderOptions } from '#/types/common';
import { removeSessionCookie } from '../auth/helpers/cookies';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUserWithCount } from '../users/helpers/transform-database-user';
import meRoutesConfig from './routes';

import { config } from 'config';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { entityMenuSections, entityTables } from '#/entity-config';
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

    const oauthAccounts = await db
      .select({
        providerId: oauthAccountsTable.providerId,
      })
      .from(oauthAccountsTable)
      .where(eq(oauthAccountsTable.userId, user.id));

    const validOAuthAccounts = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOauthProviderOptions => config.enabledOauthProviders.includes(provider as EnabledOauthProviderOptions));
    // Update last visit date
    await db.update(usersTable).set({ lastVisitAt: new Date() }).where(eq(usersTable.id, user.id));

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUserWithCount(user, memberships.length),
          oauth: validOAuthAccounts,
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
    const user = getContextUser();

    const fetchAndFormatEntities = async (type: ContextEntity, subEntityType?: ContextEntity) => {
      let formattedSubmenus: z.infer<typeof menuItemsSchema>;
      const mainTable = entityTables[type];
      const entity = await db
        .select({
          entity: mainTable,
          membership: membershipSelect,
        })
        .from(mainTable)
        .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, type)))
        .orderBy(asc(membershipsTable.order))
        .innerJoin(membershipsTable, eq(membershipsTable[`${type}Id`], mainTable.id));

      if (subEntityType && 'parentId' in entityTables[subEntityType]) {
        const subTable = entityTables[subEntityType];
        const subEntity = await db
          .select({
            entity: subTable,
            membership: membershipSelect,
            parent: mainTable,
          })
          .from(subTable)
          .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, subEntityType)))
          .orderBy(asc(membershipsTable.order))
          .innerJoin(membershipsTable, eq(membershipsTable[`${subEntityType}Id`], subTable.id))
          .innerJoin(mainTable, eq(mainTable.id, subTable.parentId as PgColumn));

        formattedSubmenus = subEntity.map(({ entity, membership, parent }) => ({
          slug: entity.slug,
          id: entity.id,
          createdAt: entity.createdAt.toDateString(),
          modifiedAt: entity.modifiedAt?.toDateString() ?? null,
          organizationId: 'organizationId' in entity ? entity.organizationId : undefined,
          name: entity.name,
          entity: entity.entity,
          thumbnailUrl: entity.thumbnailUrl,
          membership,
          parentId: parent.id,
          parentSlug: parent.slug,
        }));
      }

      return entity.map(({ entity, membership }) => ({
        slug: entity.slug,
        id: entity.id,
        createdAt: entity.createdAt.toDateString(),
        modifiedAt: entity.modifiedAt?.toDateString() ?? null,
        organizationId: 'organizationId' in entity ? entity.organizationId : undefined,
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
          return {
            ...acc,
            [section.storageType]: await fetchAndFormatEntities(section.type, submenu?.type),
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

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUserWithCount(updatedUser, memberships.length),
          oauth: validOAuthAccounts,
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
