import { AnyColumn, SQL, and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';

import config from 'config';
import { User } from 'lucia';
import { getI18n } from 'i18n';
import { db } from '~/db/db';
import { auth } from '~/db/lucia';
import { membershipsTable, organizationsTable, usersTable } from '~/db/schema';
import { createError, forbiddenError } from '~/lib/errors';
import { transformDatabaseUser } from '~/lib/transform-database-user';
import { CustomHono } from '~/types/common';
import { customLogger } from '../middlewares/custom-logger';
import { checkSlugRoute, deleteUserRoute, getUserByIdOrSlugRoute, getUserMenuRoute, getUsersRoute, meRoute, updateUserRoute } from './schema';

const i18n = getI18n('backend');

const app = new CustomHono();

// routes
const usersRoutes = app
  .openapi(meRoute, async (ctx) => {
    const user = ctx.get('user');

    const [{ total: membershipCount }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id));

    customLogger('User returned', {
      userId: user.id,
      userSlug: user.slug,
    });

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(user),
        membershipCount,
      },
    });
  })
  .openapi(getUserMenuRoute, async (ctx) => {
    const user = ctx.get('user');

    const result = await db
      .select({
        organization: organizationsTable,
        membership: membershipsTable,
      })
      .from(organizationsTable)
      .where(eq(membershipsTable.userId, user.id))
      .orderBy(desc(organizationsTable.createdAt))
      .innerJoin(membershipsTable, eq(membershipsTable.organizationId, organizationsTable.id));

    const organizations = result.map(({ organization, membership }) => ({
      ...organization,
      userRole: membership.role,
    }));

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
      customLogger('User not found', { userId });

      return ctx.json(createError(i18n, 'error.user_not_found', 'User not found'), 404);
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      customLogger('User forbidden', {
        userId: user.id,
        userSlug: user.slug,
      });

      return ctx.json(forbiddenError(i18n), 403);
    }

    const { email, bannerUrl, bio, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    if (slug) {
      const response = await fetch(`${config.backendUrl + checkSlugRoute.path.replace('{slug}', slug)}`, {
        method: checkSlugRoute.method,
      });

      const { data: slugExists } = (await response.json()) as { data: boolean };

      if (slugExists) {
        customLogger('Slug already exists', { slug });

        return ctx.json(createError(i18n, 'error.slug_already_exists', 'Slug already exists'), 400);
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

    customLogger('User updated', {
      userId: updatedUser.id,
      userSlug: updatedUser.slug,
    });

    return ctx.json({
      success: true,
      data: transformDatabaseUser(updatedUser),
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
        membershipCount: sql<number>`count(${membershipsTable.userId})`.mapWith(Number),
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

    const users = result.map(({ user, membershipCount }) => ({
      ...transformDatabaseUser(user),
      membershipCount,
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
  .openapi(deleteUserRoute, async (ctx) => {
    const { userId } = ctx.req.valid('param');

    const user = ctx.get('user');

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!targetUser) {
      customLogger('User not found', { userId });

      return ctx.json(createError(i18n, 'error.user_not_found', 'User not found'), 404);
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      customLogger('User forbidden', {
        userId: user.id,
        userSlug: user.slug,
      });

      return ctx.json(forbiddenError(i18n), 403);
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));

    if (user.id === targetUser.id) {
      await auth.invalidateUserSessions(user.id);

      const sessionCookie = auth.createBlankSessionCookie();
      ctx.header('Set-Cookie', sessionCookie.serialize());
    }

    customLogger('User deleted', {
      userId: targetUser.id,
      userSlug: targetUser.slug,
    });

    return ctx.json({
      success: true,
      data: undefined,
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
      customLogger('User not found', { userIdentifier });

      return ctx.json(createError(i18n, 'error.user_not_found', 'User not found'), 404);
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      customLogger('User forbidden', {
        userId: user.id,
        userSlug: user.slug,
      });

      return ctx.json(forbiddenError(i18n), 403);
    }

    customLogger('User returned', {
      userId: targetUser.id,
      userSlug: targetUser.slug,
    });

    return ctx.json({
      success: true,
      data: transformDatabaseUser(targetUser),
    });
  })
  .openapi(checkSlugRoute, async (ctx) => {
    const { slug } = ctx.req.valid('param');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.slug, slug));

    customLogger('Slug checked', {
      slug,
      available: !!user,
    });

    return ctx.json({
      success: true,
      data: !!user,
    });
  });

export default usersRoutes;
