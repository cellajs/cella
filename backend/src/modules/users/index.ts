import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';

import type { User } from 'lucia';
import { coalesce, db } from '../../db/db';
import { auth } from '../../db/lucia';
import { membershipsTable } from '../../db/schema/memberships';
import { usersTable } from '../../db/schema/users';
import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { removeSessionCookie } from '../auth/helpers/cookies';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUser } from './helpers/transform-database-user';
import { deleteUsersRouteConfig, getUserRouteConfig, getUsersConfig, updateUserConfig } from './routes';

const app = new CustomHono();

// User endpoints
const usersRoutes = app
  /*
   * Get list of  users
   */
  .openapi(getUsersConfig, async (ctx) => {
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
        lastSeenAt: usersTable.lastSeenAt,
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

    return ctx.json(
      {
        success: true,
        data: {
          items: users,
          total,
        },
      },
      200,
    );
  })
  /*
   * Delete users
   */
  .openapi(deleteUsersRouteConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    // * Convert the user ids to an array
    const userIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    // * Get the users
    const targets = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));

    // * Check if the users exist
    for (const id of userIds) {
      if (!targets.some((target) => target.id === id)) {
        errors.push(
          createError(ctx, 404, 'not_found', 'warn', 'USER', {
            user: id,
          }),
        );
      }
    }

    // * Filter out users that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      const userId = target.id;

      if (user.role !== 'ADMIN' && user.id !== userId) {
        errors.push(
          createError(ctx, 403, 'delete_forbidden', 'warn', 'USER', {
            user: userId,
          }),
        );
        return false;
      }

      return true;
    });

    // * If the user doesn't have permission to delete any of the users, return an error
    if (allowedTargets.length === 0) {
      return ctx.json({ success: false, errors: errors }, 200);
    }

    // * Delete the users
    await db.delete(usersTable).where(
      inArray(
        usersTable.id,
        allowedTargets.map((target) => target.id),
      ),
    );

    // * Send SSE events for the users that were deleted
    for (const { id } of allowedTargets) {
      // * Invalidate the user's sessions if the user is deleting themselves
      if (user.id === id) {
        await auth.invalidateUserSessions(user.id);
        removeSessionCookie(ctx);
      }

      logEvent('User deleted', { user: id });
    }

    return ctx.json({ success: true, errors: errors }, 200);
  })
  /*
   * Get a user by id or slug
   */
  .openapi(getUserRouteConfig, async (ctx) => {
    const idOrSlug = ctx.req.param('idOrSlug');
    const user = ctx.get('user');

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.id, idOrSlug), eq(usersTable.slug, idOrSlug)));

    if (!targetUser) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { user: idOrSlug });
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', 'USER', { user: targetUser.id });
    }

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, targetUser.id));

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUser(targetUser),
          counts: {
            memberships,
          },
        },
      },
      200,
    );
  })
  /*
   * Update a user by id or slug
   */
  .openapi(updateUserConfig, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const user = ctx.get('user');
    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.id, idOrSlug), eq(usersTable.slug, idOrSlug)));

    if (!targetUser) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { user: idOrSlug });
    }

    if (user.role !== 'ADMIN' && user.id !== targetUser.id) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', 'USER', { user: idOrSlug });
    }

    const { email, bannerUrl, bio, firstName, lastName, language, newsletter, thumbnailUrl, slug, role } = ctx.req.valid('json');

    if (slug && slug !== targetUser.slug) {
      const slugAvailable = await checkSlugAvailable(slug);

      if (!slugAvailable) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'USER', { slug });
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
        role,
        name: [firstName, lastName].filter(Boolean).join(' ') || slug,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, user.id))
      .returning();

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, updatedUser.id));

    logEvent('User updated', { user: updatedUser.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUser(updatedUser),
          counts: {
            memberships,
          },
        },
      },
      200,
    );
  });

export default usersRoutes;

export type UsersRoutes = typeof usersRoutes;
