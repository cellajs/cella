import { type SQL, and, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';

import { config } from 'config';
import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { sendSSEToUsers } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import organizationRoutesConfig from './routes';
import { toMembershipInfo } from '../memberships/helpers/to-membership-info';

const app = new CustomHono();

// * Organization endpoints
const organizationsRoutes = app
  /*
   * Create organization
   */
  .openapi(organizationRoutesConfig.createOrganization, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = ctx.get('user');

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'ORGANIZATION', { slug });
    }

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

    const [createdMembership] = await db
      .insert(membershipsTable)
      .values({
        type: 'ORGANIZATION',
        userId: user.id,
        organizationId: createdOrganization.id,
        role: 'ADMIN',
      })
      .returning();

    logEvent('User added to organization', { user: user.id, organization: createdOrganization.id });

    sendSSEToUsers([user.id], 'create_entity', { role: 'ADMIN', ...createdOrganization });

    return ctx.json(
      {
        success: true,
        data: {
          ...createdOrganization,
          membership: toMembershipInfo(createdMembership),
          counts: {
            admins: 1,
            members: 1,
          },
        },
      },
      200,
    );
  })
  /*
   * Get list of organizations
   */
  .openapi(organizationRoutesConfig.getOrganizations, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const user = ctx.get('user');

    const filter: SQL | undefined = q ? ilike(organizationsTable.name, `%${q}%`) : undefined;

    const organizationsQuery = db.select().from(organizationsTable).where(filter);

    const [{ total }] = await db.select({ total: count() }).from(organizationsQuery.as('organizations'));

    // TODO: Try to optimize this count query and move to a helper
    const counts = db
      .select({
        organizationId: membershipsTable.organizationId,
        admins: count(sql`CASE WHEN ${membershipsTable.role} = 'ADMIN' THEN 1 ELSE NULL END`).as('admins'),
        members: count().as('members'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.organizationId)
      .as('counts');

    const memberships = db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, 'ORGANIZATION')))
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

    const organizations = await db
      .select({
        organization: organizationsTable,
        membership: membershipsTable,
        admins: counts.admins,
        members: counts.members,
      })
      .from(organizationsQuery.as('organizations'))
      .leftJoin(memberships, eq(organizationsTable.id, memberships.organizationId))
      .leftJoin(counts, eq(organizationsTable.id, counts.organizationId))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json(
      {
        success: true,
        data: {
          items: organizations.map(({ organization, membership, admins, members }) => ({
            ...organization,
            membership: toMembershipInfo(membership),
            counts: { admins, members },
          })),
          total,
        },
      },
      200,
    );
  })
  /*
   * Update an organization by id or slug
   */
  .openapi(organizationRoutesConfig.updateOrganization, async (ctx) => {
    const user = ctx.get('user');
    const organization = ctx.get('organization');

    const {
      name,
      slug,
      shortName,
      country,
      timezone,
      defaultLanguage,
      languages,
      notificationEmail,
      emailDomains,
      color,
      thumbnailUrl,
      logoUrl,
      bannerUrl,
      websiteUrl,
      welcomeText,
      authStrategies,
      chatSupport,
    } = ctx.req.valid('json');

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug);

      if (!slugAvailable) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'ORGANIZATION', { slug });
      }
    }

    const [updatedOrganization] = await db
      .update(organizationsTable)
      .set({
        name,
        slug,
        shortName,
        country,
        timezone,
        defaultLanguage,
        languages,
        notificationEmail,
        emailDomains,
        color,
        thumbnailUrl,
        logoUrl,
        bannerUrl,
        websiteUrl,
        welcomeText,
        authStrategies,
        chatSupport,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(organizationsTable.id, organization.id))
      .returning();

    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'ORGANIZATION'), eq(membershipsTable.organizationId, organization.id)));

    if (memberships.length > 0) {
      const membersId = memberships.map((member) => member.id);
      sendSSEToUsers(membersId, 'update_entity', updatedOrganization);
    }

    // TODO: Try to optimize this count query and move to a helper
    const [{ admins }] = await db
      .select({
        admins: count(),
      })
      .from(membershipsTable);

    const [{ members }] = await db
      .select({
        members: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.organizationId, organization.id));

    logEvent('Organization updated', { organization: updatedOrganization.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...updatedOrganization,
          membership: toMembershipInfo(memberships.find((member) => member.id === user.id)),
          counts: {
            admins,
            members,
          },
        },
      },
      200,
    );
  })
  /*
   * Get organization by id or slug
   */
  .openapi(organizationRoutesConfig.getOrganization, async (ctx) => {
    const user = ctx.get('user');
    const organization = ctx.get('organization');

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organization.id)));

    const [{ admins }] = await db
      .select({
        admins: count(),
      })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.role, 'ADMIN')));

    const [{ members }] = await db
      .select({
        members: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.organizationId, organization.id));

    return ctx.json(
      {
        success: true,
        data: {
          ...organization,
          membership: toMembershipInfo(membership),
          counts: {
            admins,
            members,
          },
        },
      },
      200,
    );
  })

  /*
   * Delete organizations by ids
   */
  .openapi(organizationRoutesConfig.deleteOrganizations, async (ctx) => {
    // * Extract allowed and disallowed ids
    const allowedIds = ctx.get('allowedIds');
    const disallowedIds = ctx.get('disallowedIds');

    // * Map errors of workspaces user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'ORGANIZATION', { organization: id }));

    // * Get members
    const organizationsMembers = await db
      .select({ id: membershipsTable.userId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'ORGANIZATION'), inArray(membershipsTable.organizationId, allowedIds)));

    // * Delete the organizations
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    // * Send SSE events for the organizations that were deleted
    for (const id of allowedIds) {
      // * Send the event to the user if they are a member of the organization
      if (organizationsMembers.length > 0) {
        const membersId = organizationsMembers.map((member) => member.id).filter(Boolean) as string[];
        sendSSEToUsers(membersId, 'remove_entity', { id, type: 'ORGANIZATION' });
      }

      logEvent('Organization deleted', { organization: id });
    }

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default organizationsRoutes;
