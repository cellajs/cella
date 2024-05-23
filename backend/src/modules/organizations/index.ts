import { type SQL, and, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { usersTable } from '../../db/schema/users';

import { config } from 'config';
import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import {
  createOrganizationRouteConfig,
  deleteOrganizationsRouteConfig,
  getOrganizationByIdOrSlugRouteConfig,
  getOrganizationsRouteConfig,
  getUsersByOrganizationIdRouteConfig,
  updateOrganizationRouteConfig,
} from './routes';

const app = new CustomHono();

// * Organization endpoints
const organizationsRoutes = app
  /*
   * Create organization
   */
  .openapi(createOrganizationRouteConfig, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = ctx.get('user');

    const slugAvailable = await checkSlugAvailable(slug, 'ORGANIZATION');

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

    await db.insert(membershipsTable).values({
      userId: user.id,
      organizationId: createdOrganization.id,
      role: 'ADMIN',
    });

    logEvent('User added to organization', {
      user: user.id,
      organization: createdOrganization.id,
    });

    sendSSE(user.id, 'new_organization_membership', {
      ...createdOrganization,
      userRole: 'ADMIN',
      type: 'ORGANIZATION',
    });

    return ctx.json({
      success: true,
      data: {
        ...createdOrganization,
        userRole: 'ADMIN' as const,
        counts: {
          admins: 1,
          members: 1,
        },
      },
    }, 200);
  })
  /*
   * Get an organizations
   */
  .openapi(getOrganizationsRouteConfig, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const user = ctx.get('user');

    const filter: SQL | undefined = q ? ilike(organizationsTable.name, `%${q}%`) : undefined;

    const organizationsQuery = db.select().from(organizationsTable).where(filter);

    const [{ total }] = await db.select({ total: count() }).from(organizationsQuery.as('organizations'));

    const counts = db
      .select({
        organizationId: membershipsTable.organizationId,
        admins: count(sql`CASE WHEN ${membershipsTable.role} = 'ADMIN' THEN 1 ELSE NULL END`).as('admins'),
        members: count().as('members'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.organizationId)
      .as('counts');

    const membershipRoles = db
      .select({
        organizationId: membershipsTable.organizationId,
        role: membershipsTable.role,
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id))
      .as('membership_roles');

    const orderColumn = getOrderColumn(
      {
        id: organizationsTable.id,
        name: organizationsTable.name,
        createdAt: organizationsTable.createdAt,
        userRole: membershipRoles.role,
      },
      sort,
      organizationsTable.id,
      order,
    );

    const organizations = await db
      .select({
        organization: organizationsTable,
        userRole: membershipRoles.role,
        admins: counts.admins,
        members: counts.members,
      })
      .from(organizationsQuery.as('organizations'))
      .leftJoin(membershipRoles, eq(organizationsTable.id, membershipRoles.organizationId))
      .leftJoin(counts, eq(organizationsTable.id, counts.organizationId))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json({
      success: true,
      data: {
        items: organizations.map(({ organization, userRole, admins, members }) => ({
          ...organization,
          userRole,
          counts: { admins, members },
        })),
        total,
      },
    }, 200);
  })
  /*
   * Update an organization
   */
  .openapi(updateOrganizationRouteConfig, async (ctx) => {
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
      brandColor,
      thumbnailUrl,
      logoUrl,
      bannerUrl,
      websiteUrl,
      welcomeText,
      authStrategies,
      chatSupport,
    } = ctx.req.valid('json');

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug, 'ORGANIZATION');

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
        brandColor,
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

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organization.id)));

    if (membership) {
      sendSSE(user.id, 'update_organization', {
        ...updatedOrganization,
        userRole: membership.role,
        type: 'ORGANIZATION',
      });
    }

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

    logEvent('Organization updated', { organization: updatedOrganization.id });

    return ctx.json({
      success: true,
      data: {
        ...updatedOrganization,
        userRole: membership?.role || null,
        counts: {
          admins,
          members,
        },
      },
    }, 200);
  })
  /*
   * Get organization by id or slug
   */
  .openapi(getOrganizationByIdOrSlugRouteConfig, async (ctx) => {
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

    return ctx.json({
      success: true,
      data: {
        ...organization,
        userRole: membership?.role || null,
        counts: {
          admins,
          members,
        },
      },
    }, 200);
  })
  /*
   * Get members by organization id
   */
  .openapi(getUsersByOrganizationIdRouteConfig, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');
    const organization = ctx.get('organization');

    const filter: SQL | undefined = q ? ilike(usersTable.email, `%${q}%`) : undefined;

    const usersQuery = db.select().from(usersTable).where(filter).as('users');

    const membersFilters = [eq(membershipsTable.organizationId, organization.id)];

    if (role) {
      membersFilters.push(eq(membershipsTable.role, role.toUpperCase() as MembershipModel['role']));
    }

    const roles = db
      .select({
        userId: membershipsTable.userId,
        role: membershipsTable.role,
      })
      .from(membershipsTable)
      .where(and(...membersFilters))
      .as('roles');

    const membershipCount = db
      .select({
        userId: membershipsTable.userId,
        memberships: count().as('memberships'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.userId)
      .as('membership_count');

    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        lastSeenAt: usersTable.lastSeenAt,
        organizationRole: roles.role,
      },
      sort,
      usersTable.id,
      order,
    );

    const membersQuery = db
      .select({
        user: usersTable,
        organizationRole: roles.role,
        counts: {
          memberships: membershipCount.memberships,
        },
      })
      .from(usersQuery)
      .innerJoin(roles, eq(usersTable.id, roles.userId))
      .leftJoin(membershipCount, eq(usersTable.id, membershipCount.userId))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const result = await membersQuery.limit(Number(limit)).offset(Number(offset));

    const members = await Promise.all(
      result.map(async ({ user, organizationRole, counts }) => ({
        ...user,
        sessions: [],
        organizationRole,
        counts,
      })),
    );

    return ctx.json({
      success: true,
      data: {
        items: members,
        total,
      },
    }, 200);
  })
  /*
   * Delete organizations
   */
  .openapi(deleteOrganizationsRouteConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    // * Convert the ids to an array
    const organizationIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    // * Get the organizations and the user role
    const targets = await db
      .select({
        organization: organizationsTable,
        userRole: membershipsTable.role,
      })
      .from(organizationsTable)
      .leftJoin(membershipsTable, and(eq(membershipsTable.organizationId, organizationsTable.id), eq(membershipsTable.userId, user.id)))
      .where(inArray(organizationsTable.id, organizationIds));

    // * Check if the organizations exist
    for (const id of organizationIds) {
      if (!targets.some((target) => target.organization.id === id)) {
        errors.push(
          createError(ctx, 404, 'not_found', 'warn', 'ORGANIZATION', {
            organization: id,
          }),
        );
      }
    }

    // * Filter out organizations that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      const organizationId = target.organization.id;

      if (user.role !== 'ADMIN' && target.userRole !== 'ADMIN') {
        errors.push(
          createError(ctx, 403, 'delete_forbidden', 'warn', 'ORGANIZATION', {
            organization: organizationId,
          }),
        );
        return false;
      }

      return true;
    });

    // * If the user doesn't have permission to delete any of the organizations, return an error
    if (allowedTargets.length === 0) {
      return ctx.json({
        success: false,
        errors: errors,
      }, 200);
    }

    // * Delete the organizations
    await db.delete(organizationsTable).where(
      inArray(
        organizationsTable.id,
        allowedTargets.map((target) => target.organization.id),
      ),
    );

    // * Send SSE events for the organizations that were deleted
    for (const { organization, userRole } of allowedTargets) {
      // * Send the event to the user if they are a member of the organization
      if (userRole) {
        sendSSE(user.id, 'remove_organization', organization);
      }

      logEvent('Organization deleted', { organization: organization.id });
    }

    return ctx.json({
      success: true,
      errors: errors,
    }, 200);
  });

export default organizationsRoutes;

export type OrganizationsRoutes = typeof organizationsRoutes;
