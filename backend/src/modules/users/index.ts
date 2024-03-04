import { AnyColumn, SQL, and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';

import { User } from 'lucia';
import { coalesce, db } from '../../db/db';
import { auth } from '../../db/lucia';
import { checkSlugExists } from '../../lib/checkSlug';
import { removeSessionCookie } from '../../lib/cookies';
import { customLogger } from '../../lib/custom-logger';
import { createError, forbiddenError } from '../../lib/errors';
import { transformDatabaseUser } from '../../lib/transform-database-user';
import { CustomHono } from '../../types/common';
import { deleteUsersRoute, getUserByIdOrSlugRoute, getUserMenuRoute, getUsersRoute, meRoute, updateUserRoute, userSuggestionsRoute } from './routes';
import { membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { usersTable } from '../../db/schema/users';

const app = new CustomHono();

// routes
const usersRoutes = app
  .openapi(meRoute, async (ctx) => {
    const user = ctx.get('user');

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id));

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(user),
        counts: {
          memberships,
        },
      },
    });
  })
  .openapi(getUserMenuRoute, async (ctx) => {
    const user = ctx.get('user');

    const organizationsWithMemberships = await db
      .select({
        organization: organizationsTable,
        membership: membershipsTable,
      })
      .from(organizationsTable)
      .where(eq(membershipsTable.userId, user.id))
      .orderBy(desc(organizationsTable.createdAt))
      .innerJoin(membershipsTable, eq(membershipsTable.organizationId, organizationsTable.id));

    const organizations = await Promise.all(
      organizationsWithMemberships.map(async ({ organization, membership }) => {
        const [{ admins }] = await db
          .select({
            admins: count(),
          })
          .from(membershipsTable)
          .where(and(eq(membershipsTable.role, 'ADMIN'), eq(membershipsTable.organizationId, organization.id)));

        const [{ members }] = await db
          .select({
            members: count(),
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

    return ctx.json({
      success: true,
      data: {
        organizations: {
          active: organizations,
          inactive: [],
          canCreate: user.role === 'ADMIN',
        },
      },
    });
  })
  .openapi(updateUserRoute, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const user = ctx.get('user');

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!targetUser) {
      customLogger('User not found', { user: userId }, 'warn');
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      customLogger('User forbidden', { user: user.id }, 'warn');
      return ctx.json(forbiddenError(), 403);
    }

    const { email, bannerUrl, bio, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    if (slug) {
      const slugExists = await checkSlugExists(slug);

      if (slugExists && slug !== targetUser.slug) {
        customLogger('Slug already exists', { slug }, 'warn');
        return ctx.json(createError('error.slug_already_exists', 'Slug already exists'), 400);
      }
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
        name: [firstName, lastName].filter(Boolean).join(' ') || null,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, userId))
      .returning();

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, updatedUser.id));

    customLogger('User updated', { user: updatedUser.id });

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(updatedUser),
        counts: {
          memberships,
        },
      },
    });
  })
  .openapi(getUsersRoute, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');

    const orderFunc = order === 'asc' ? asc : desc;

    const memberships = db
      .select({
        userId: membershipsTable.userId,
      })
      .from(membershipsTable)
      .as('user_memberships');

    const membershipCounts = db
      .select({
        userId: memberships.userId,
        count: count().as('count'),
      })
      .from(memberships)
      .groupBy(memberships.userId)
      .as('membership_counts');

    let orderColumn: AnyColumn | SQL.Aliased;
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
      case 'membershipCount':
        orderColumn = membershipCounts.count;
        break;
      case 'role':
        orderColumn = usersTable.role;
        break;
      default:
        orderColumn = usersTable.id;
        break;
    }

    const filters = [];
    if (q) {
      filters.push(or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.email, `%${q}%`)));
    }
    if (role) {
      filters.push(eq(usersTable.role, role.toUpperCase() as User['role']));
    }

    const usersQuery = db
      .select({
        user: usersTable,
        counts: {
          memberships: coalesce(membershipCounts.count, 0),
        },
      })
      .from(usersTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(orderFunc(orderColumn))
      .leftJoin(membershipCounts, eq(membershipCounts.userId, usersTable.id));

    const [{ total }] = await db
      .select({
        total: count(),
      })
      .from(usersQuery.as('users'));

    const result = await usersQuery.limit(+limit).offset(+offset);

    const users = result.map(({ user, counts }) => ({
      ...transformDatabaseUser(user),
      counts,
    }));

    return ctx.json({
      success: true,
      data: {
        items: users,
        total,
      },
    });
  })
  .openapi(userSuggestionsRoute, async (ctx) => {
    const { q } = ctx.req.valid('query');

    const users = await db
      .select({
        name: usersTable.name,
        email: usersTable.email,
        thumbnailUrl: usersTable.thumbnailUrl,
      })
      .from(usersTable)
      .where(or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.email, `%${q}%`)))
      .limit(10);

    return ctx.json({
      success: true,
      data: users,
    });
  })
  .openapi(deleteUsersRoute, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    const userIds = Array.isArray(ids) ? ids : [ids];

    const errors: ReturnType<typeof createError>[] = [];

    await Promise.all(
      userIds.map(async (id) => {
        const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, id));

        if (!targetUser) {
          customLogger('User not found', { user: id }, 'warn');
          errors.push(createError('error.user_not_found', 'User not found'));
          return;
        }

        if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
          customLogger('User forbidden', { user: user.id }, 'warn');
          errors.push(forbiddenError());
          return;
        }

        await db.delete(usersTable).where(eq(usersTable.id, id));

        if (user.id === targetUser.id) {
          await auth.invalidateUserSessions(user.id);
          removeSessionCookie(ctx);
        }

        customLogger('User deleted', { user: targetUser.id });
      }),
    );

    return ctx.json({
      success: true,
      data: errors.length > 0 ? { error: errors[0].error } : undefined,
    });
  })
  .openapi(getUserByIdOrSlugRoute, async (ctx) => {
    const userIdentifier = ctx.req.param('userId').toLowerCase();
    const user = ctx.get('user');

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.id, userIdentifier), eq(usersTable.slug, userIdentifier)));

    if (!targetUser) {
      customLogger('User not found', { user: userIdentifier }, 'warn');
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      customLogger('User forbidden', { user: user.id }, 'warn');
      return ctx.json(forbiddenError(), 403);
    }

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, targetUser.id));

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(targetUser),
        counts: {
          memberships,
        },
      },
    });
  });

export default usersRoutes;
