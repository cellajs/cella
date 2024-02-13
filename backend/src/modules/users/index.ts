import { AnyColumn, SQL, and, asc, countDistinct, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { config } from 'config';
import { User } from 'lucia';
import { db } from '../../db/db';
import { auth } from '../../db/lucia';
import { membershipsTable, organizationsTable, usersTable } from '../../db/schema';
import { customLogger } from '../../lib/custom-logger';
import { createError, forbiddenError } from '../../lib/errors';
import { transformDatabaseUser } from '../../lib/transform-database-user';
import { CustomHono } from '../../types/common';
import { checkSlugRoute } from '../general/routes';
import { deleteUsersRoute, getUserByIdOrSlugRoute, getUserMenuRoute, getUsersRoute, meRoute, updateUserRoute } from './routes';

const app = new CustomHono();

// routes
const usersRoutes = app
  .openapi(meRoute, async (ctx) => {
    const user = ctx.get('user');

    const [{ memberships }] = await db
      .select({
        memberships: countDistinct(membershipsTable.userId),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id));

    customLogger('User returned', { user: user.id });

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

    customLogger('User menu returned');

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
      customLogger('User not found', { user: userId });
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      customLogger('User forbidden', { user: user.id });
      return ctx.json(forbiddenError(), 403);
    }

    const { email, bannerUrl, bio, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    if (slug) {
      const response = await fetch(`${config.backendUrl + checkSlugRoute.path.replace('{slug}', slug)}`, {
        method: checkSlugRoute.method,
      });

      const { data: slugExists } = (await response.json()) as { data: boolean };

      if (slugExists && slug !== targetUser.slug) {
        customLogger('Slug already exists', { slug });
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
        memberships: countDistinct(membershipsTable.userId),
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

    let orderColumn: AnyColumn | SQL;
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
        orderColumn = sql`count(${membershipsTable.userId})`;
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
        memberships: countDistinct(membershipsTable.organizationId),
      })
      .from(usersTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(orderFunc(orderColumn))
      .leftJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
      .groupBy(usersTable.id);

    const [{ total }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(usersQuery.as('users'));

    const result = await usersQuery.limit(+limit).offset(+offset);

    const users = result.map(({ user, memberships }) => ({
      ...transformDatabaseUser(user),
      counts: {
        memberships,
      },
    }));

    customLogger('Users returned');

    return ctx.json({
      success: true,
      data: {
        items: users,
        total,
      },
    });
  })
  .openapi(deleteUsersRoute, async (ctx) => {
    const { userIds } = ctx.req.valid('query');
    const user = ctx.get('user');

    const ids = Array.isArray(userIds) ? userIds : [userIds];


    const errors: ReturnType<typeof createError>[] = [];

    await Promise.all(
      ids.map(async (id) => {
        const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, id));

        if (!targetUser) {
          customLogger('User not found', { user: id });
          errors.push(createError(i18n, 'error.user_not_found', 'User not found'));
          return;
        }

        if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
          customLogger('User forbidden', { user: user.id });
          errors.push(forbiddenError(i18n));
          return;
        }

        await db.delete(usersTable).where(eq(usersTable.id, id));

        if (user.id === targetUser.id) {
          await auth.invalidateUserSessions(user.id);

          const sessionCookie = auth.createBlankSessionCookie();
          ctx.header('Set-Cookie', sessionCookie.serialize());
        }

        customLogger('User deleted', { user: targetUser.id });
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
  .openapi(getUserByIdOrSlugRoute, async (ctx) => {
    const userIdentifier = ctx.req.param('userId').toLowerCase();
    const user = ctx.get('user');

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.id, userIdentifier), eq(usersTable.slug, userIdentifier)));

    if (!targetUser) {
      customLogger('User not found', { user: userIdentifier });
      return ctx.json(createError('error.user_not_found', 'User not found'), 404);
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      customLogger('User forbidden', { user: user.id });
      return ctx.json(forbiddenError(), 403);
    }

    const [{ memberships }] = await db
      .select({
        memberships: countDistinct(membershipsTable.userId),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, targetUser.id));

    customLogger('User returned', { user: targetUser.id });

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
