import { and, count, desc, eq, ilike, or } from 'drizzle-orm';

import type { User } from 'lucia';
import { coalesce, db } from '../../db/db';
import { auth } from '../../db/lucia';
import { membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { usersTable } from '../../db/schema/users';
import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { removeSessionCookie } from '../auth/helpers/cookies';
import { checkSlugExists } from '../general/helpers/check-slug';
import { transformDatabaseUser } from './helpers/transform-database-user';
import { deleteUsersRouteConfig, getUserByIdOrSlugRouteConfig, getUserMenuConfig, getUsersConfig, meRouteConfig, updateUserConfig } from './routes';

const app = new CustomHono();

// User endpoints
const usersRoutes = app
  /*
   * Get current user
   */
  .add(meRouteConfig, async (ctx) => {
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
  /*
   * Get current user sessions
   */
  // TODO: Implement this route
  // .add(getUserSessionsConfig, async (ctx) => {
  //   const user = ctx.get('user');

  //   const sessions = await auth.getUserSessions(user.id);

  //   return ctx.json({
  //     success: true,
  //     data: sessions,
  //   });
  // })
  /*
   * Get user menu
   */
  .add(getUserMenuConfig, async (ctx) => {
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
  /*
   * Update a user
   */
  .add(updateUserConfig, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const user = ctx.get('user');

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!targetUser) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: userId });
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      return errorResponse(ctx, 403, 'update_forbidden', 'warn', 'user', { user: userId });
    }

    const { email, bannerUrl, bio, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    if (slug && slug !== targetUser.slug) {
      const slugExists = await checkSlugExists(slug);

      if (slugExists) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'user', { slug });
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

    logEvent('User updated', { user: updatedUser.id });

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
  /*
   * Get users
   */
  .add(getUsersConfig, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');

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

    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        membershipCount: membershipCounts.count,
        role: usersTable.role,
      },
      sort,
      usersTable.id,
      order,
    );

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
      .orderBy(orderColumn)
      .leftJoin(membershipCounts, eq(membershipCounts.userId, usersTable.id));

    const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));

    const result = await usersQuery.limit(Number(limit)).offset(Number(offset));

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
  /*
   * Delete users
   */
  .add(deleteUsersRouteConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    const userIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    await Promise.all(
      userIds.map(async (id) => {
        const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, id));

        if (!targetUser) {
          errors.push(createError(ctx, 404, 'not_found', 'warn', 'user', { user: id }));
        }

        if (user.role !== 'ADMIN' && user.id !== id) {
          errors.push(createError(ctx, 403, 'delete_forbidden', 'warn', 'user', { user: id }));
        }

        await db.delete(usersTable).where(eq(usersTable.id, id));

        if (user.id === id) {
          await auth.invalidateUserSessions(user.id);
          removeSessionCookie(ctx);
        }

        logEvent('User deleted', { user: targetUser.id });
      }),
    );

    return ctx.json({
      success: true,
      errors: errors,
    });
  })
  /*
   * Get a user by id or slug
   */
  .add(getUserByIdOrSlugRouteConfig, async (ctx) => {
    const userIdentifier = ctx.req.param('userId').toLowerCase();
    const user = ctx.get('user');

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.id, userIdentifier), eq(usersTable.slug, userIdentifier)));

    if (!targetUser) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: userIdentifier });
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', 'user', { user: targetUser.id });
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

export type UsersRoutes = typeof usersRoutes;
