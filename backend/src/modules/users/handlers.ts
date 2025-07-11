import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { createError, type ErrorType, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { checkSlugAvailable } from '../entities/helpers/check-slug';
import { userSelect } from './helpers/select';
import userRoutes from './routes';

const app = new OpenAPIHono<Env>({ defaultHook });

const usersRouteHandlers = app
  /*
   * Get list of users
   */
  .openapi(userRoutes.getUsers, async (ctx) => {
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

    const filters: SQL[] = [];
    if (q) {
      const query = prepareStringForILikeFilter(q);
      filters.push(or(ilike(usersTable.name, query), ilike(usersTable.email, query)) as SQL);
    }
    if (role) filters.push(eq(usersTable.role, role));

    const usersQuery = db
      .select({ ...userSelect })
      .from(usersTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(orderColumn)
      .leftJoin(membershipCounts, eq(membershipCounts.userId, usersTable.id));

    const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));

    const items = await usersQuery.limit(Number(limit)).offset(Number(offset));

    return ctx.json({ items, total }, 200);
  })
  /*
   * Delete users
   */
  .openapi(userRoutes.deleteUsers, async (ctx) => {
    const { ids } = ctx.req.valid('json');
    const user = getContextUser();

    // Convert the user ids to an array
    const userIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    // Get the users
    const targets = await getUsersByConditions([inArray(usersTable.id, userIds)]);

    // Check if the users exist
    for (const id of userIds) {
      if (!targets.some((target) => target.id === id)) {
        errors.push(createError(ctx, 404, 'not_found', 'warn', 'user', { user: id }));
      }
    }

    // Filter out users that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      const userId = target.id;

      if (user.role !== 'admin' && user.id !== userId) {
        errors.push(createError(ctx, 403, 'delete_resource_forbidden', 'warn', 'user', { user: userId }));
        return false;
      }

      return true;
    });

    // Ifuser doesn't have permission to delete, return error
    if (allowedTargets.length === 0) {
      return ctx.json({ success: false, errors }, 200);
    }

    // Delete the users
    await db.delete(usersTable).where(
      inArray(
        usersTable.id,
        allowedTargets.map((target) => target.id),
      ),
    );

    logEvent('Users deleted');

    return ctx.json({ success: true, errors }, 200);
  })
  /*
   * Get a user by id or slug
   */
  .openapi(userRoutes.getUser, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const user = getContextUser();
    const memberships = getContextMemberships();

    if (idOrSlug === user.id || idOrSlug === user.slug) return ctx.json(user, 200);

    const [targetUser] = await getUsersByConditions([or(eq(usersTable.id, idOrSlug), eq(usersTable.slug, idOrSlug))]);

    if (!targetUser) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: idOrSlug });

    const targetUserMembership = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, targetUser.id), eq(membershipsTable.contextType, 'organization')));

    const jointMembership = memberships.find((membership) =>
      targetUserMembership.some((targetMembership) => targetMembership.organizationId === membership.organizationId),
    );

    if (user.role !== 'admin' && !jointMembership) return errorResponse(ctx, 403, 'forbidden', 'warn', 'user', { user: targetUser.id });

    return ctx.json(targetUser, 200);
  })
  /*
   * Update a user by id or slug
   */
  .openapi(userRoutes.updateUser, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const user = getContextUser();

    const [targetUser] = await getUsersByConditions([or(eq(usersTable.id, idOrSlug), eq(usersTable.slug, idOrSlug))]);
    if (!targetUser) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: idOrSlug });

    const { bannerUrl, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    // Check if slug is available
    if (slug && slug !== targetUser.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'user', { slug });
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({
        bannerUrl,
        firstName,
        lastName,
        language,
        newsletter,
        thumbnailUrl,
        slug,
        name: [firstName, lastName].filter(Boolean).join(' ') || slug,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, targetUser.id))
      .returning();

    logEvent('User updated', { user: updatedUser.id });

    return ctx.json(updatedUser, 200);
  });

export default usersRouteHandlers;
