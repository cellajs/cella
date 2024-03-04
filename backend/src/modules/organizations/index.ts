import { config } from 'config';
import { AnyColumn, SQL, and, asc, count, desc, eq, ilike, sql } from 'drizzle-orm';
import slugify from 'slugify';
import { db } from '../../db/db';
import { MembershipModel, membershipsTable, organizationsTable, usersTable } from '../../db/schema';
import { customLogger } from '../../lib/custom-logger';
import { createError } from '../../lib/errors';
import { transformDatabaseUser } from '../../lib/transform-database-user';
import { CustomHono, ErrorResponse } from '../../types/common';
import { checkSlugRoute } from '../general/routes';
import {
  createOrganizationRoute,
  deleteOrganizationsRoute,
  deleteUsersFromOrganizationRoute,
  getOrganizationByIdOrSlugRoute,
  getOrganizationsRoute,
  getUsersByOrganizationIdRoute,
  updateOrganizationRoute,
  updateUserInOrganizationRoute,
} from './routes';

const app = new CustomHono();

// routes
const organizationsRoutes = app
  .openapi(createOrganizationRoute, async (ctx) => {
    const { name } = ctx.req.valid('json');
    const user = ctx.get('user');

    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.name, name));

    if (organization) {
      customLogger('Organization with this name exists', { name }, 'warn');

      return ctx.json<ErrorResponse>(createError('error.organization_with_this_name_exists', 'Organization with this name already exists'), 400);
    }

    const [createdOrganization] = await db
      .insert(organizationsTable)
      .values({
        name,
        slug: slugify(name, {
          lower: true,
        }),
        createdBy: user.id,
      })
      .returning();

    customLogger('Organization created', { organization: createdOrganization.id });

    return ctx.json({
      success: true,
      data: {
        ...createdOrganization,
        userRole: null,
        counts: {
          admins: 0,
          members: 0,
        },
      },
    });
  })
  .openapi(getOrganizationsRoute, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const user = ctx.get('user');

    const orderFunc = order === 'asc' ? asc : desc;

    let orderColumn: AnyColumn;
    switch (sort) {
      case 'name':
        orderColumn = organizationsTable.name;
        break;
      case 'createdAt':
        orderColumn = organizationsTable.createdAt;
        break;
      default:
        orderColumn = organizationsTable.id;
        break;
    }

    const filter: SQL | undefined = q ? ilike(organizationsTable.name, `%${q}%`) : undefined;

    const organizationsQuery = db.select().from(organizationsTable).where(filter).orderBy(orderFunc(orderColumn));

    const [{ total }] = await db
      .select({
        total: count(),
      })
      .from(organizationsQuery.as('organizations'));

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
      .limit(+limit)
      .offset(+offset);

    return ctx.json({
      success: true,
      data: {
        items: organizations.map(({ organization, userRole, admins, members }) => ({
          ...organization,
          userRole,
          counts: {
            admins,
            members,
          },
        })),
        total,
      },
    });
  })
  .openapi(updateOrganizationRoute, async (ctx) => {
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

    if (slug) {
      const response = await fetch(`${config.backendUrl + checkSlugRoute.path.replace('{slug}', slug)}`, {
        method: checkSlugRoute.method,
      });

      const { data: slugExists } = (await response.json()) as { data: boolean };

      if (slugExists && slug !== organization.slug) {
        customLogger('Slug already exists', { slug }, 'warn');

        return ctx.json(createError('error.slug_already_exists', 'Slug already exists'), 400);
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

    customLogger('Organization updated', { organization: updatedOrganization.id });

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
    });
  })
  .openapi(updateUserInOrganizationRoute, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const { role } = ctx.req.valid('json');
    const user = ctx.get('user');
    const organization = ctx.get('organization');

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!targetUser) {
      customLogger('User not found', { user: userId }, 'warn');
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    const [membership] = await db
      .update(membershipsTable)
      .set({ role, modifiedBy: user.id, modifiedAt: new Date() })
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)))
      .returning();

    if (!membership) {
      customLogger('Membership not found', { user: targetUser.id, organization: organization.id }, 'warn');
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.organizationId, organization.id));

    customLogger('User updated in organization', { user: targetUser.id, organization: organization.id });

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(targetUser),
        organizationRole: membership.role,
        counts: {
          memberships,
        },
      },
    });
  })
  .openapi(deleteOrganizationsRoute, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    // const user = ctx.get('user');

    const organizationIds = Array.isArray(ids) ? ids : [ids];

    const errors: ReturnType<typeof createError>[] = [];

    await Promise.all(
      organizationIds.map(async (id) => {
        const [targetOrganization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));

        if (!targetOrganization) {
          customLogger('Organization not found', { organization: id }, 'warn');
          errors.push(createError('error.organization_not_found', 'Organization not found'));
          return;
        }

        // if (user.role !== 'ADMIN') {
        //   customLogger('User forbidden', { user: user.id }, 'warn);
        //   errors.push(forbiddenError());
        //   return;
        // }

        await db.delete(organizationsTable).where(eq(organizationsTable.id, id));

        customLogger('Organization deleted', { organization: id });
      }),
    );

    return ctx.json({
      success: true,
      data:
        errors.length > 0
          ? {
            error: errors[0].error,
          }
          : undefined,
    });
  })
  .openapi(getOrganizationByIdOrSlugRoute, async (ctx) => {
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
    });
  })
  .openapi(getUsersByOrganizationIdRoute, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');
    const organization = ctx.get('organization');

    const orderFunc = order === 'asc' ? asc : desc;

    let orderColumn: AnyColumn;
    switch (sort) {
      case 'name':
        orderColumn = usersTable.name;
        break;
      case 'email':
        orderColumn = usersTable.email;
        break;
      case 'createdAt':
        orderColumn = usersTable.createdAt;
        break;
      case 'lastSeenAt':
        orderColumn = usersTable.lastSeenAt;
        break;
      default:
        orderColumn = usersTable.id;
        break;
    }

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

    const membersQuery = db
      .select({
        user: usersTable,
        organizationRole: roles.role,
        counts: {
          memberships: membershipCount.memberships,
        }
      })
      .from(usersQuery)
      .innerJoin(roles, eq(usersTable.id, roles.userId))
      .leftJoin(membershipCount, eq(usersTable.id, membershipCount.userId))
      .orderBy(sort === 'organizationRole' ? orderFunc(roles.role) : orderFunc(orderColumn));

    const [{ total }] = await db
      .select({
        total: count(),
      })
      .from(membersQuery.as('memberships'));

    const result = await membersQuery.limit(+limit).offset(+offset);

    const members = await Promise.all(
      result.map(async ({ user, organizationRole, counts }) => ({
        ...user,
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
    });
  })
  .openapi(deleteUsersFromOrganizationRoute, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const organization = ctx.get('organization');

    const usersIds = Array.isArray(ids) ? ids : [ids];

    const errors: ReturnType<typeof createError>[] = [];

    await Promise.all(
      usersIds.map(async (id) => {
        const [targetMembership] = await db
          .delete(membershipsTable)
          .where(and(eq(membershipsTable.userId, id), eq(membershipsTable.organizationId, organization.id)))
          .returning();

        if (!targetMembership) {
          customLogger('Membership not found', { user: id, organization: organization.id }, 'warn');
          errors.push(createError('error.membership_not_found', 'Membership not found'));
          return;
        }

        customLogger('Membership deleted', { user: id, organization: organization.id });
      }),
    );

    return ctx.json({
      success: true,
      data:
        errors.length > 0
          ? {
            error: errors[0].error,
          }
          : undefined,
    });
  });

export default organizationsRoutes;
