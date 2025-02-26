import { type SQL, and, count, eq, getTableColumns, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';

import { OpenAPIHono } from '@hono/zod-openapi';
import { config } from 'config';
import emailProviders from '#/../../restricted-email-providers.json';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { checkSlugAvailable } from '#/modules/general/helpers/check-slug';
import { insertMembership } from '#/modules/memberships/helpers';
import { membershipSelect } from '#/modules/memberships/helpers/select';
import { getValidEntity } from '#/permissions/get-valid-entity';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import { getMemberCounts, getMemberCountsQuery, getRelatedEntityCounts } from '#/utils/counts';
import defaultHook from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { NewsletterEmail, type NewsletterEmailProps } from '../../../emails/newsletter';
import organizationsRouteConfig from './routes';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

const organizationsRoutes = app
  /*
   * Create organization
   */
  .openapi(organizationsRouteConfig.createOrganization, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = getContextUser();

    // Check if slug is available
    const slugAvailable = await checkSlugAvailable(slug);
    if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'organization', { slug });

    const [createdOrganization] = await db
      .insert(organizationsTable)
      .values({
        name,
        shortName: name,
        slug,
        languages: [config.defaultLanguage],
        defaultLanguage: config.defaultLanguage,
        createdBy: user.id,
      })
      .returning();

    logEvent('Organization created', { organization: createdOrganization.id });

    // Insert membership
    const createdMembership = await insertMembership({ userId: user.id, role: 'admin', entity: createdOrganization });

    const data = {
      ...createdOrganization,
      membership: createdMembership,
      counts: { membership: { admin: 1, member: 1, total: 1 } },
    };

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Get list of organizations
   */
  .openapi(organizationsRouteConfig.getOrganizations, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const user = getContextUser();

    const filter: SQL | undefined = q ? ilike(organizationsTable.name, prepareStringForILikeFilter(q)) : undefined;

    const organizationsQuery = db.select().from(organizationsTable).where(filter);

    const [{ total }] = await db.select({ total: count() }).from(organizationsQuery.as('organizations'));

    const memberships = db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, 'organization')))
      .as('memberships');

    const orderColumn = getOrderColumn(
      {
        id: organizationsTable.id,
        name: organizationsTable.name,
        createdAt: organizationsTable.createdAt,
        userRole: memberships.role,
      },
      sort,
      organizationsTable.id,
      order,
    );

    const countsQuery = getMemberCountsQuery('organization');

    const organizations = await db
      .select({
        ...getTableColumns(organizationsTable),
        membership: membershipSelect,
        counts: {
          membership: sql<{
            admin: number;
            member: number;
            pending: number;
            total: number;
          }>`json_build_object('admin', ${countsQuery.admin}, 'member', ${countsQuery.member}, 'pending', ${countsQuery.pending}, 'total', ${countsQuery.member})`,
        },
      })
      .from(organizationsQuery.as('organizations'))
      .leftJoin(memberships, and(eq(organizationsTable.id, memberships.organizationId), eq(memberships.userId, user.id)))
      .leftJoin(countsQuery, eq(organizationsTable.id, countsQuery.id))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json({ success: true, data: { items: organizations, total } }, 200);
  })
  /*
   * Update an organization by id or slug
   */
  .openapi(organizationsRouteConfig.updateOrganization, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const { entity: organization, isAllowed, membership } = await getValidEntity('organization', 'update', idOrSlug);
    if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization');
    if (!isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization');

    const user = getContextUser();

    const updatedFields = ctx.req.valid('json');
    const slug = updatedFields.slug;
    const emailDomains = updatedFields.emailDomains;

    if (emailDomains) {
      // Convert emailDomains into a PostgreSQL-compatible array
      const formattedEmailDomains = `ARRAY[${emailDomains.map((d) => `'${d}'`).join(', ')}]::text[]`;

      const isDomainsInValid = emailDomains.some((domain) => emailProviders.includes(domain));
      const alreadyExists = await db
        .select()
        .from(organizationsTable)
        .where(sql`
          EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${organizationsTable.emailDomains}::jsonb) AS domain
            WHERE domain = ANY (${sql.raw(formattedEmailDomains)})
          )
        `);
      // TODO: create 2 different error messages for the 2 cases
      if (alreadyExists.length || isDomainsInValid) return errorResponse(ctx, 422, 'invalid_domain', 'warn', 'organization');
    }

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'organization', { slug });
    }

    const [updatedOrganization] = await db
      .update(organizationsTable)
      .set({
        ...updatedFields,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(organizationsTable.id, organization.id))
      .returning();

    const organizationMemberships = await db
      .select(membershipSelect)
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'organization'), eq(membershipsTable.organizationId, organization.id)));

    // Send SSE events to organization members
    for (const member of organizationMemberships) {
      sendSSEToUsers([member.userId], 'update_entity', { ...updatedOrganization, member });
    }

    logEvent('Organization updated', { organization: updatedOrganization.id });

    const memberCounts = await getMemberCounts('organization', organization.id);

    // Prepare data
    const data = { ...updatedOrganization, membership, counts: { membership: memberCounts } };

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Get organization by id or slug
   */
  .openapi(organizationsRouteConfig.getOrganization, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const { entity: organization, isAllowed, membership } = await getValidEntity('organization', 'read', idOrSlug);
    if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization');
    if (!isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization');

    const memberCounts = await getMemberCounts('organization', organization.id);
    const relatedEntitiesCounts = await getRelatedEntityCounts('organization', organization.id);

    const counts = { membership: memberCounts, ...relatedEntitiesCounts };
    const data = { ...organization, membership, counts };

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Delete organizations by ids
   */
  .openapi(organizationsRouteConfig.deleteOrganizations, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    const memberships = getContextMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) return errorResponse(ctx, 400, 'invalid_request', 'warn', 'organization');

    // Split ids into allowed and disallowed
    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'organization', toDeleteIds, memberships);
    if (!allowedIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization');

    // Map errors of organization user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'organization', { organization: id }));

    // Get ids of members for organizations
    const memberIds = await db
      .select({ id: membershipsTable.userId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'organization'), inArray(membershipsTable.organizationId, allowedIds)));

    // Delete the organizations
    // await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    // Send SSE events to all members of organizations that were deleted
    for (const id of allowedIds) {
      if (!memberIds.length) continue;

      const userIds = memberIds.map((m) => m.id);
      sendSSEToUsers(userIds, 'remove_entity', { id, entity: 'organization' });
    }

    logEvent('Organizations deleted', { ids: allowedIds.join() });

    return ctx.json({ success: true, errors: errors }, 200);
  })
  /*
   * Send newsletter to one or more roles members of one or more organizations
   */
  .openapi(organizationsRouteConfig.sendNewsletter, async (ctx) => {
    const { organizationIds, subject, content, roles } = ctx.req.valid('json');
    const { toSelf } = ctx.req.valid('query');

    const user = getContextUser();

    // Get members from organizations
    const recipientsRecords = await db
      .selectDistinct({
        email: usersTable.email,
        name: usersTable.name,
        unsubscribeToken: usersTable.unsubscribeToken,
        newsletter: usersTable.newsletter,
        orgName: organizationsTable.name,
      })
      .from(membershipsTable)
      .innerJoin(usersTable, and(eq(usersTable.id, membershipsTable.userId)))
      // eq(usersTable.emailVerified, true) // maybe add for only confirmed emails
      .innerJoin(organizationsTable, eq(organizationsTable.id, membershipsTable.organizationId))
      .where(
        and(
          eq(membershipsTable.type, 'organization'),
          inArray(membershipsTable.organizationId, organizationIds),
          inArray(membershipsTable.role, roles),
          eq(usersTable.newsletter, true),
        ),
      );

    // Stop if no recipients
    if (recipientsRecords.length === 0) return errorResponse(ctx, 400, 'no_recipients', 'warn');

    // Add unsubscribe link to each recipient
    let recipients = recipientsRecords.map(({ newsletter, unsubscribeToken, ...recipient }) => ({
      ...recipient,
      unsubscribeLink: `${config.backendUrl}/unsubscribe?token=${unsubscribeToken}`,
    }));

    // If toSelf is true, send the email only to self
    if (toSelf)
      recipients = [
        {
          email: user.email,
          name: user.name,
          unsubscribeLink: `${config.backendUrl}/unsubscribe?token=NOTOKEN`,
          orgName: recipients[0].orgName,
        },
      ];

    type Recipient = (typeof recipients)[number];

    // Prepare emails and send them
    const staticProps = { content, subject, testEmail: toSelf, lng: user.language };
    await mailer.prepareEmails<NewsletterEmailProps, Recipient>(NewsletterEmail, staticProps, recipients, user.email);

    return ctx.json({ success: true }, 200);
  });

export default organizationsRoutes;
