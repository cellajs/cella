import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, ilike, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { userSelect, usersBaseQuery } from '#/modules/users/helpers/select';
import userRoutes from '#/modules/users/routes';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const usersRouteHandlers = app
  /**
   * Get list of users
   */
  .openapi(userRoutes.getUsers, async (ctx) => {
    const { q, sort, order, offset, mode, limit, role, targetEntityId, targetEntityType } = ctx.req.valid('query');

    const user = getContextUser();

    const filters = [
      // Filter by role if provided
      ...(role ? [eq(usersTable.role, role)] : []),

      // Exclude self when fetching shared memberships
      ...(mode === 'shared' ? [ne(usersTable.id, user.id)] : []),

      // Filter by search query if provided
      ...(q ? [or(ilike(usersTable.name, prepareStringForILikeFilter(q)), ilike(usersTable.email, prepareStringForILikeFilter(q)))] : []),
    ];

    // Base user query with ordering
    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        lastSeenAt: usersTable.lastSeenAt,
        role: usersTable.role,
      },
      sort,
      usersTable.id,
      order,
    );

    const targetMembership = alias(membershipsTable, 'targetMembership'); // memberships of users being queried
    const requesterMembership = alias(membershipsTable, 'requesterMembership'); // memberships of requesting user

    const baseUsersQuery =
      mode === 'shared'
        ? db
            .selectDistinct({ ...userSelect })
            .from(usersTable)
            .innerJoin(
              targetMembership,
              and(eq(usersTable.id, targetMembership.userId), isNotNull(targetMembership.activatedAt), isNull(targetMembership.tokenId)),
            )
            .innerJoin(
              requesterMembership,
              and(eq(requesterMembership.organizationId, targetMembership.organizationId), eq(requesterMembership.userId, user.id)),
            )
        : usersBaseQuery();

    const usersQuery = baseUsersQuery.where(and(...filters)).orderBy(orderColumn);

    // Total count
    const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));

    const users = await usersQuery.limit(limit).offset(offset);

    // If no users, return empty result early
    if (!users.length) return ctx.json({ items: [], total }, 200);

    const userIds = users.map((u) => u.id);

    // Fetch memberships for all these users
    const membershipFilters = [inArray(membershipsTable.userId, userIds)];
    if (targetEntityId && targetEntityType) {
      const entityFieldId = appConfig.entityIdFields[targetEntityType];
      membershipFilters.push(eq(membershipsTable.contextType, targetEntityType), eq(membershipsTable[entityFieldId], targetEntityId));
    }

    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(and(...membershipFilters));

    // Group memberships by userId in a type-safe way
    const membershipsByUser = memberships.reduce<Record<string, typeof memberships>>((acc, m) => {
      if (!acc[m.userId]) acc[m.userId] = [];
      acc[m.userId].push(m);
      return acc;
    }, {});

    // Attach memberships to users
    const items = users.map((user) => ({
      ...user,
      memberships: membershipsByUser[user.id] ?? [],
    }));

    return ctx.json({ items, total }, 200);
  })
  /**
   * Delete users
   */
  .openapi(userRoutes.deleteUsers, async (ctx) => {
    const { ids } = ctx.req.valid('json');
    const { role: contextUserRole, id: contextUserId } = getContextUser();

    // Convert the user ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', entityType: 'user' });

    // Fetch users by IDs

    const targets = await usersBaseQuery().where(inArray(usersTable.id, toDeleteIds));

    const foundIds = new Set(targets.map(({ id }) => id));
    const allowedIds: string[] = [];
    const rejectedItems: string[] = [];

    for (const targetId of toDeleteIds) {
      // Not found in DB
      if (!foundIds.has(targetId)) {
        rejectedItems.push(targetId);
        continue; // Skip to next
      }

      const isAllowed = contextUserRole === 'admin' || contextUserId === targetId;
      if (isAllowed) allowedIds.push(targetId);
      else rejectedItems.push(targetId); // Found but not authorized
    }

    // Ifuser doesn't have permission to delete, return error
    if (!allowedIds.length) throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType: 'user' });

    // Delete allowed users
    await db.delete(usersTable).where(inArray(usersTable.id, allowedIds));

    logEvent('info', 'Users deleted', allowedIds);

    return ctx.json({ success: true, rejectedItems }, 200);
  })
  /**
   * Get a user by id or slug
   */
  .openapi(userRoutes.getUser, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const requestingUser = getContextUser();
    const requesterMemberships = getContextMemberships();

    if (idOrSlug === requestingUser.id || idOrSlug === requestingUser.slug) return ctx.json(requestingUser, 200);

    const [targetUser] = await usersBaseQuery()
      .where(or(eq(usersTable.id, idOrSlug), eq(usersTable.slug, idOrSlug)))
      .limit(1);

    if (!targetUser) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { user: idOrSlug } });

    const requesterOrgIds = requesterMemberships.filter((m) => m.contextType === 'organization').map((m) => m.organizationId);

    const [sharedMembership] = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, targetUser.id),
          eq(membershipsTable.contextType, 'organization'),
          isNotNull(membershipsTable.activatedAt),
          inArray(membershipsTable.organizationId, requesterOrgIds),
        ),
      )
      .limit(1);

    if (requestingUser.role !== 'admin' && !sharedMembership) {
      throw new AppError({
        status: 403,
        type: 'forbidden',
        severity: 'warn',
        entityType: 'user',
        meta: { user: targetUser.id },
      });
    }

    return ctx.json(targetUser, 200);
  })
  /**
   * Update a user by id or slug
   */
  .openapi(userRoutes.updateUser, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const user = getContextUser();

    const [targetUser] = await usersBaseQuery()
      .where(or(eq(usersTable.id, idOrSlug), eq(usersTable.slug, idOrSlug)))
      .limit(1);

    if (!targetUser) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { user: idOrSlug } });

    const { bannerUrl, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    // Check if slug is available
    if (slug && slug !== targetUser.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) throw new AppError({ status: 409, type: 'slug_exists', severity: 'warn', entityType: 'user', meta: { slug } });
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

    logEvent('info', 'User updated', { userId: updatedUser.id });

    return ctx.json(updatedUser, 200);
  });

export default usersRouteHandlers;
