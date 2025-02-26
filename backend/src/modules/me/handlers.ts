import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';

import type { EnabledOauthProvider } from 'config';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { getParsedSessionCookie, invalidateSessionById, invalidateUserSessions, validateSession } from '../auth/helpers/session';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import meRouteConfig from './routes';

import { OpenAPIHono } from '@hono/zod-openapi';
import { config } from 'config';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { organizationsTable } from '#/db/schema/organizations';
import { passkeysTable } from '#/db/schema/passkeys';
import { type EntityRelations, entityIdFields, entityRelations, entityTables } from '#/entity-config';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { sendSSEToUsers } from '#/lib/sse';
import defaultHook from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { deleteAuthCookie, getAuthCookie } from '../auth/helpers/cookie';
import { parseAndValidatePasskeyAttestation } from '../auth/helpers/passkey';
import { insertMembership } from '../memberships/helpers';
import { membershipSelect } from '../memberships/helpers/select';
import { getUserSessions } from './helpers/get-sessions';
import type { menuItemSchema, userMenuSchema } from './schema';

type UserMenu = z.infer<typeof userMenuSchema>;
type MenuItem = z.infer<typeof menuItemSchema>;

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

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

    return ctx.json({ success: true, data: { oauth: validOAuthAccounts, passkey: !!passkeys.length, sessions } }, 200);
  })
  /*
   * Get current user relevant entities
   */
  .openapi(meRouteConfig.getSelfEntities, async (ctx) => {
    const memberships = getContextMemberships();

    const membershipMap = new Map(
      memberships.map((membership) => {
        const entityIdField = entityIdFields[membership.type];
        return [membership[entityIdField], membership];
      }),
    );

    // Get IDs user is member of
    const userEntityIds = Array.from(membershipMap.keys()).filter((el) => el !== null);

    if (userEntityIds.length === 0) return ctx.json({ success: true, data: [] }, 200);

    const queries = config.contextEntityTypes
      .map((entityType) => {
        const table = entityTables[entityType];
        if (!table) return null;

        return db
          .select({
            id: table.id,
            slug: table.slug,
            name: table.name,
            entity: table.entity,
            thumbnailUrl: table.thumbnailUrl,
            bannerUrl: table.bannerUrl,
          })
          .from(table)
          .where(inArray(table.id, userEntityIds));
      })
      .filter((el) => el !== null);

    // Fetch entities that match the user’s memberships
    const entities = (await Promise.all(queries)).flat();

    const data = entities
      .map((entity) => {
        const membership = membershipMap.get(entity.id);
        if (!membership) return null;
        return { ...entity, membership };
      })
      .filter((el) => el !== null);

    return ctx.json({ success: true, data }, 200);
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

    sendSSEToUsers([user.id], 'remove_entity', { id: entity.id, entity: entity.entity });
    logEvent('User leave entity', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Create Passkey of self
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
   * Get list of suggested organizations based of self emails domain */
  .openapi(meRouteConfig.domainOrganizations, async (ctx) => {
    const user = getContextUser();

    const emails = await db
      .select()
      .from(emailsTable)
      .where(and(eq(emailsTable.userId, user.id), eq(emailsTable.verified, true), isNull(emailsTable.domainInvite)));

    // Extract email domains and format them as an array of strings
    const emailDomains = emails.map(({ email }) => email.split('@')[1]);

    // Query to get organizations where the email domain matches
    const organizations = await db
      .select({
        id: organizationsTable.id,
        entity: organizationsTable.entity,
        slug: organizationsTable.slug,
        name: organizationsTable.name,
        thumbnailUrl: organizationsTable.thumbnailUrl,
      })
      .from(organizationsTable)
      .where(
        and(
          sql`
      EXISTS (
        SELECT 1 
        FROM jsonb_array_elements_text(${organizationsTable.emailDomains}::jsonb) AS domain
        WHERE domain = ANY (${sql.raw(`ARRAY[${emailDomains.map((email) => `'${email}'`).join(', ')}]::text[]`)})
        )
        `,
          isNull(membershipsTable.id),
        ),
      )
      .leftJoin(
        membershipsTable,
        and(
          eq(membershipsTable.userId, user.id),
          eq(membershipsTable.type, 'organization'),
          eq(membershipsTable.organizationId, organizationsTable.id),
        ),
      );

    return ctx.json({ success: true, data: organizations }, 200);
  })
  /*
   * Join to organization by domain
   */
  .openapi(meRouteConfig.joinByDomain, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const user = getContextUser();

    const organization = await resolveEntity('organization', idOrSlug);
    if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization');

    const emails = await db
      .select()
      .from(emailsTable)
      .where(and(eq(emailsTable.userId, user.id), eq(emailsTable.verified, true), isNull(emailsTable.domainInvite)));

    // Check if any of the user's email domains match the organization's allowed domains
    const emailInfoWithMatchingDomain = emails.filter(({ email }) => {
      const emailDomain = email.split('@')[1];
      return organization.emailDomains.includes(emailDomain);
    });

    const matchingEmails = emailInfoWithMatchingDomain.map(({ email }) => email);

    // Check if any of the user's email domains match the organization's allowed domains
    if (matchingEmails.length === 0) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization');

    await insertMembership({ userId: user.id, role: 'member', entity: organization });

    await db
      .update(emailsTable)
      .set({ domainInvite: 'accepted' })
      .where(and(eq(emailsTable.userId, user.id), inArray(emailsTable.email, matchingEmails)));

    return ctx.json({ success: true }, 200);
  })
  /*
   * Decline suggestion  by domain
   */
  .openapi(meRouteConfig.declineByDomain, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const user = getContextUser();

    const organization = await resolveEntity('organization', idOrSlug);
    if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization');

    const emails = await db
      .select()
      .from(emailsTable)
      .where(and(eq(emailsTable.userId, user.id), eq(emailsTable.verified, true), isNull(emailsTable.domainInvite)));

    // Check if any of the user's email domains match the organization's allowed domains
    const emailInfoWithMatchingDomain = emails.filter(({ email }) => {
      const emailDomain = email.split('@')[1];
      return organization.emailDomains.includes(emailDomain);
    });

    const matchingEmails = emailInfoWithMatchingDomain.map(({ email }) => email);

    // Check if any of the user's email domains match the organization's allowed domains
    if (matchingEmails.length === 0) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization');

    await db
      .update(emailsTable)
      .set({ domainInvite: 'rejected' })
      .where(and(eq(emailsTable.userId, user.id), inArray(emailsTable.email, matchingEmails)));

    return ctx.json({ success: true }, 200);
  });

export default meRoutes;
