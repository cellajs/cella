import { and, asc, eq } from 'drizzle-orm';

import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono, type EnabledOauthProvider } from '#/types/common';
import { deleteSessionCookie, getSessionIdFromCookie, invalidateSession, invalidateUserSessions } from '../auth/helpers/session';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUserWithCount } from '../users/helpers/transform-database-user';
import meRoutesConfig from './routes';

import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { config } from 'config';
import { render } from 'jsx-email';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { getUserBy } from '#/db/util';
import { type MenuSection, entityIdFields, entityTables, menuSections } from '#/entity-config';
import { getContextUser, getMemberships } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { emailSender } from '#/lib/mailer';
import { sendSSEToUsers } from '#/lib/sse';
import type { MenuItem, UserMenu } from '#/types/common';
import { updateBlocknoteHTML } from '#/utils/blocknote';
import { NewsletterEmail } from '../../../emails/newsletter';
import { env } from '../../../env';
import { getUserSessions } from './helpers/get-sessions';

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
      .filter((provider): provider is EnabledOauthProvider => config.enabledOauthProviders.includes(provider as EnabledOauthProvider));

    // Update last visit date
    await db.update(usersTable).set({ lastStartedAt: new Date() }).where(eq(usersTable.id, user.id));

    // Prepare data
    const data = {
      ...transformDatabaseUserWithCount(user, memberships.length),
      oauth: validOAuthAccounts,
      passkey: !!passkey.length,
      sessions: await getUserSessions(user.id, ctx),
    };

    return ctx.json({ success: true, data }, 200);
  })
  // Your main function
  .openapi(meRoutesConfig.getUserMenu, async (ctx) => {
    const user = getContextUser();
    const memberships = getMemberships();

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
    const { ids } = ctx.req.valid('query');

    const sessionIds = Array.isArray(ids) ? ids : [ids];

    const currentSessionId = await getSessionIdFromCookie(ctx);
    const hashedCurrentSessionId = currentSessionId ? encodeHexLowerCase(sha256(new TextEncoder().encode(currentSessionId))) : '';

    const errors: ErrorType[] = [];

    await Promise.all(
      sessionIds.map(async (id) => {
        try {
          if (id === hashedCurrentSessionId) {
            deleteSessionCookie(ctx);
          }
          await invalidateSession(id);
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

    const passkey = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, updatedUser.email));

    const oauthAccounts = await db
      .select({
        providerId: oauthAccountsTable.providerId,
      })
      .from(oauthAccountsTable)
      .where(eq(oauthAccountsTable.userId, user.id));

    const validOAuthAccounts = oauthAccounts
      .map((el) => el.providerId)
      .filter((provider): provider is EnabledOauthProvider => config.enabledOauthProviders.includes(provider as EnabledOauthProvider));
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
    await invalidateUserSessions(user.id);
    deleteSessionCookie(ctx);
    logEvent('User deleted', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Send newsletter to current user (self)
   */
  .openapi(meRoutesConfig.sendNewsletterEmailToSelf, async (ctx) => {
    const user = getContextUser();
    const { subject, content } = ctx.req.valid('json');

    const unsafeUser = await getUserBy('id', user.id, 'unsafe');

    // generating email html
    const emailHtml = await render(
      NewsletterEmail({
        userLanguage: user.language,
        subject,
        content: updateBlocknoteHTML(content),
        unsubscribeLink: `${config.backendUrl}/unsubscribe?token=${unsafeUser?.unsubscribeToken}`,
        orgName: 'Organization',
      }),
    );

    await emailSender.send(env.SEND_ALL_TO_EMAIL ?? user.email, subject, emailHtml, user.email);

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
   * TODO? here? Also create then.. Delete passkey of self
   */
  .openapi(meRoutesConfig.deletePasskey, async (ctx) => {
    const user = getContextUser();

    await db.delete(passkeysTable).where(eq(passkeysTable.userEmail, user.email));

    return ctx.json({ success: true }, 200);
  });

export default meRoutes;
