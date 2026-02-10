import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { lastSeenTable } from '#/db/schema/last-seen';
import { membershipsTable } from '#/db/schema/memberships';
import { systemRolesTable } from '#/db/schema/system-roles';
import { usersTable } from '#/db/schema/users';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { resolveEntity } from '#/lib/resolve-entity';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { userSelect } from '#/modules/user/helpers/select';
import userRoutes from '#/modules/user/user-routes';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const userRouteHandlers = app
  /**
   * Get list of users in the organization
   */
  .openapi(userRoutes.getUsers, async (ctx) => {
    const { q, sort, order, offset, limit, role, targetEntityId, targetEntityType } = ctx.req.valid('query');

    const organization = ctx.var.organization;
    const db = ctx.var.db; // Use tenant-scoped transaction

    const filters = [
      // Filter by role if provided
      ...(role ? [eq(systemRolesTable.role, role)] : []),

      // Filter by search query if provided
      ...(q
        ? [
            or(
              ilike(usersTable.name, prepareStringForILikeFilter(q)),
              ilike(usersTable.email, prepareStringForILikeFilter(q)),
            ),
          ]
        : []),
    ];

    // Base user query with ordering
    // Note: lastSeenAt requires subquery since it's in user_activity table
    const orderColumn = getOrderColumn(sort, usersTable.id, order, {
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: usersTable.createdAt,
      lastSeenAt: sql`(SELECT ${lastSeenTable.lastSeenAt} FROM ${lastSeenTable} WHERE ${lastSeenTable.userId} = ${usersTable.id})`,
      role: systemRolesTable.role,
    });

    const usersQuerySelect = { ...userSelect, role: systemRolesTable.role };

    // Get users who have membership in the current organization
    const baseUsersQuery = db
      .selectDistinct(usersQuerySelect)
      .from(usersTable)
      .innerJoin(
        membershipsTable,
        and(eq(usersTable.id, membershipsTable.userId), eq(membershipsTable.organizationId, organization.id)),
      );

    const usersQuery = baseUsersQuery
      .leftJoin(systemRolesTable, eq(usersTable.id, systemRolesTable.userId))
      .where(and(...filters))
      .orderBy(orderColumn);

    // Total count
    const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));

    const users = await usersQuery.limit(limit).offset(offset);

    // If no users, return empty result early
    if (!users.length) return ctx.json({ items: [], total }, 200);

    const userIds = users.map((u) => u.id);

    // Fetch memberships for all these users within the organization
    const membershipFilters = [
      inArray(membershipsTable.userId, userIds),
      eq(membershipsTable.organizationId, organization.id),
    ];
    if (targetEntityId && targetEntityType) {
      const entityFieldId = appConfig.entityIdColumnKeys[targetEntityType];
      membershipFilters.push(
        eq(membershipsTable.contextType, targetEntityType),
        eq(membershipsTable[entityFieldId], targetEntityId),
      );
    }

    const memberships = await db
      .select(membershipBaseSelect)
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
   * Get a user by id within the organization context. Pass ?slug=true to resolve by slug.
   */
  .openapi(userRoutes.getUser, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const { slug: bySlug } = ctx.req.valid('query');
    const requestingUser = ctx.var.user;
    const organization = ctx.var.organization;
    const db = ctx.var.db; // Use tenant-scoped transaction

    // Check if requesting self (by id or slug)
    if (userId === requestingUser.id || (bySlug && userId === requestingUser.slug)) {
      return ctx.json(requestingUser, 200);
    }

    // Resolve user by ID (or slug when bySlug is true)
    // TODO-009 we should scan codebase for usage of resolveEntity in handlers directy.
    // Perhaps we would do well to make it explicitly internal use only
    // Perhaps make it part of permission refactor
    // Since the permission wrapped is preferred getValidEntity
    const targetUser = await resolveEntity('user', userId, db, bySlug);

    if (!targetUser) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: userId } });

    // Verify target user has membership in the current organization
    const [orgMembership] = await db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, targetUser.id), eq(membershipsTable.organizationId, organization.id)))
      .limit(1);

    if (!orgMembership) {
      throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: targetUser.id } });
    }

    return ctx.json(targetUser, 200);
  });

export default userRouteHandlers;
