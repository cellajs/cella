import { config } from 'config';
import { AnyColumn, SQL, and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { countDistinct } from 'drizzle-orm';
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
  deleteOrganizationRoute,
  deleteUserFromOrganizationRoute,
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
      customLogger('Organization with this name exists', { name });

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

    const organizationsQuery = db.select().from(organizationsTable).where(filter).orderBy(orderFunc(orderColumn)).limit(+limit).offset(+offset);

    const [{ total }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(organizationsQuery.as('organizations'));

    // TODO: Review and refactor this logic

    const organizationsWithMemberships = await db
      .select({
        membership: membershipsTable,
        organization: organizationsTable,
      })
      .from(organizationsQuery.as('organizations'))
      .leftJoin(membershipsTable, eq(membershipsTable.organizationId, organizationsTable.id))
      .where(eq(membershipsTable.userId, user.id))
      .orderBy(sort === 'userRole' ? orderFunc(membershipsTable.role) : asc(organizationsTable.id));

    const organizations = await organizationsQuery;

    const filteredOrganizations = organizations
      .filter((organization) => !organizationsWithMemberships.find((m) => m.organization?.id === organization.id))
      .map((organization) => ({ organization, membership: null }));

    const result = await Promise.all(
      organizationsWithMemberships.concat(filteredOrganizations).map(async ({ organization, membership }) => {
        const [{ admins }] = await db
          .select({
            admins: countDistinct(membershipsTable.userId),
          })
          .from(membershipsTable)
          .where(and(eq(membershipsTable.role, 'ADMIN'), eq(membershipsTable.organizationId, organization.id)));

        const [{ members }] = await db
          .select({
            members: countDistinct(membershipsTable.userId),
          })
          .from(membershipsTable)
          .where(eq(membershipsTable.organizationId, organization.id));

        return {
          ...organization,
          userRole: membership?.role || null,
          counts: {
            members,
            admins,
          },
        };
      }),
    );

    customLogger('Organizations returned');

    return ctx.json({
      success: true,
      data: {
        items: result,
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
        customLogger('Slug already exists', { slug });

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
        admins: countDistinct(membershipsTable.userId),
      })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.role, 'ADMIN')));

    const [{ members }] = await db
      .select({
        members: countDistinct(membershipsTable.userId),
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
      customLogger('User not found', { user: userId });
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    const [membership] = await db
      .update(membershipsTable)
      .set({ role, modifiedBy: user.id, modifiedAt: new Date() })
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)))
      .returning();

    if (!membership) {
      customLogger('Membership not found', { user: targetUser.id, organization: organization.id });
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    const [{ memberships }] = await db
      .select({
        memberships: countDistinct(membershipsTable.userId),
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
  .openapi(deleteOrganizationRoute, async (ctx) => {
    const organization = ctx.get('organization');

    await db.delete(organizationsTable).where(eq(organizationsTable.id, organization.id));

    customLogger('Organization deleted', { organization: organization.id });

    return ctx.json({
      success: true,
      data: undefined,
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
        admins: countDistinct(membershipsTable.userId),
      })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.role, 'ADMIN')));

    const [{ members }] = await db
      .select({
        members: countDistinct(membershipsTable.userId),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.organizationId, organization.id));

    customLogger('Organization returned', { organization: organization.id });

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

    const membersQuery = db
      .select({
        user: usersTable,
        membership: membershipsTable,
      })
      .from(membershipsTable)
      .where(and(...membersFilters))
      .orderBy(sort === 'organizationRole' ? orderFunc(membershipsTable.role) : orderFunc(orderColumn))
      .innerJoin(usersQuery, eq(membershipsTable.userId, usersTable.id));

    const [{ total }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(membersQuery.as('memberships'));

    customLogger('Members returned');

    const result = await membersQuery.limit(+limit).offset(+offset);

    const members = await Promise.all(
      result.map(async ({ user, membership }) => {
        const [{ memberships }] = await db
          .select({
            memberships: countDistinct(membershipsTable.userId),
          })
          .from(membershipsTable)
          .where(eq(membershipsTable.userId, user.id));

        return {
          ...user,
          organizationRole: membership?.role || null,
          counts: {
            memberships,
          },
        };
      }),
    );

    return ctx.json({
      success: true,
      data: {
        items: members,
        total,
      },
    });
  })
  .openapi(deleteUserFromOrganizationRoute, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const organization = ctx.get('organization');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!user) {
      customLogger('User not found', { user: userId });

      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    const [membership] = await db
      .delete(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, user.id)))
      .returning();

    const [{ memberships }] = await db
      .select({
        memberships: countDistinct(membershipsTable.userId),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.organizationId, organization.id));

    customLogger('User deleted from organization', { user: user.id, organization: organization.id });

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(user),
        organizationRole: membership.role,
        counts: {
          memberships,
        },
      },
    });
  });

export default organizationsRoutes;
